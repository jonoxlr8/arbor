"""Explicit operator integration; no web route, key loading or default execution.

The owner supplies an already authorized database connection and SDK clients.
Production capability must be separately qualified before enabling execution.
The isolated adapter and its blocked-project safeguards remain unchanged.
"""
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import re
from urllib.parse import urlsplit
from uuid import UUID

from app.services.account_erasure import Approval, ApprovalFailure, advance
from app.services.account_erasure_providers import (
    SupabaseErasureProviders, SessionInventory, ObjectInventory, OwnedObject,
)
from app.services.account_erasure_workflow import ReviewEvidence


@dataclass(frozen=True)
class OperatorTarget:
    project_ref: str
    owner_id: UUID
    operation_id: UUID
    created_at: datetime

    def __post_init__(self):
        if (not re.fullmatch(r"[a-z]{20}", self.project_ref)
                or not isinstance(self.owner_id, UUID) or not isinstance(self.operation_id, UUID)
                or self.created_at.tzinfo is None):
            raise ValueError("Exact project, identity and operation binding required.")

    @property
    def ref(self):
        return self.project_ref

    def check_client(self, url, suffix):
        u = urlsplit(str(url))
        if (u.scheme != "https" or u.netloc != f"{self.ref}.supabase.co"
                or u.path.rstrip("/") != suffix or u.query or u.fragment
                or u.username or u.password):
            raise ValueError("Client target mismatch.")


class OperatorProviders(SupabaseErasureProviders):
    """Reuse bounded SDK operations with an explicit production target, not fixtures.

    No factory or credentials are created here. This constructor does not grant
    capability: clients and barrier/session inventories must already be qualified.
    """
    def __init__(self, *, target: OperatorTarget, **kwargs):
        super().__init__(project=target, owner=target.owner_id,
                         operation=target.operation_id, expected_created_at=target.created_at,
                         **kwargs)

    def preflight(self, owner):
        self._identity(owner)
        return {"project_matches": True, "identity_matches": True,
                "owned_object_count": len(self._objects(owner)),
                "session_count": self._session_count(owner),
                "execution_enabled": self.execution_enabled}


class SqlOperatorRepository:
    """DB-API repository on one supplied, dedicated direct database connection.

    A bounded session advisory lock serializes operators across hosts and commits.
    The database functions separately lock against app lifecycle races. No pooler,
    shared application connection or connection URL is accepted by this class.
    Driver availability/authorized connection provisioning remains a release gate.
    """
    def __init__(self, connection, target: OperatorTarget):
        # Only read nonsecret connection metadata, never DSN/password/options.
        if getattr(getattr(connection, "info", None), "host", None) != f"db.{target.ref}.supabase.co":
            raise ValueError("Dedicated direct connection target must match.")
        self.connection, self.target = connection, target
        self._locked = False

    def _query(self, sql, args=(), *, one=True):
        try:
            with self.connection.cursor() as c:
                c.execute("SET LOCAL statement_timeout='8s'; SET LOCAL lock_timeout='2s'")
                c.execute(sql, args)
                while c.description is None and c.nextset():
                    pass
                value = c.fetchone() if one else None
            self.connection.commit()
            return value[0] if value else None
        except Exception:
            self.connection.rollback()
            raise RuntimeError("Operator database action unconfirmed; reconcile durable state.") from None

    @contextmanager
    def locked(self, owner):
        if owner != self.target.owner_id or self._locked:
            raise ValueError("Owner mismatch or overlapping operator call.")
        acquired = self._query("SELECT pg_try_advisory_lock(hashtextextended(%s,0))",
                               (f"arbor-erasure-operator:{owner}",))
        if acquired is not True:
            raise ValueError("Owner operation is busy.")
        self._locked = True
        try:
            yield
        finally:
            self._locked = False
            if self._query("SELECT pg_advisory_unlock(hashtextextended(%s,0))",
                           (f"arbor-erasure-operator:{owner}",)) is not True:
                raise RuntimeError("Operator lock release unconfirmed; close the dedicated connection.")

    def capabilities(self):
        # No reads of personal tables or key values. No broad grants are added.
        return self._query("""SELECT jsonb_build_object(
          'schema',to_regclass('arbor_private.account_erasure_operations') IS NOT NULL,
          'session_inventory',has_column_privilege(current_user,'auth.sessions','user_id','SELECT'),
          'auth_inventory',has_column_privilege(current_user,'auth.users','created_at','SELECT'),
          'storage_inventory',has_column_privilege(current_user,'storage.objects','owner_id','SELECT'),
          'maintenance',has_function_privilege(current_user,
            'arbor_private.erasure_data(uuid)','EXECUTE'),
          'private_schema',has_schema_privilege(current_user,'arbor_private','USAGE'),
          'app_roles_denied',NOT EXISTS(SELECT 1 FROM pg_proc p
            JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='arbor_private' AND p.proname LIKE 'erasure_%'
            AND (has_function_privilege('anon',p.oid,'EXECUTE')
              OR has_function_privilege('authenticated',p.oid,'EXECUTE')
              OR has_function_privilege('service_role',p.oid,'EXECUTE'))))""")

    def request(self, owner):
        if owner != self.target.owner_id:
            raise ValueError("Owner mismatch.")
        value = self._query("""SELECT jsonb_build_object('request_id',q.request_id,
          'version',l.version,'state',l.state) FROM arbor_private.account_lifecycle l
          JOIN arbor_private.account_deletion_requests q USING(user_id) WHERE l.user_id=%s""", (str(owner),))
        if not isinstance(value, dict):
            raise ValueError("Current request missing.")
        value['request_id'] = UUID(value['request_id'])
        return value

    def inventory(self, owner):
        if owner != self.target.owner_id:
            raise ValueError("Owner mismatch.")
        return self._query("SELECT arbor_private.erasure_inventory(%s)", (str(owner),))

    def read(self, operation):
        if operation != self.target.operation_id:
            raise ValueError("Operation mismatch.")
        value = self._query("SELECT to_jsonb(o) FROM arbor_private.account_erasure_operations o WHERE id=%s AND owner_id=%s",
                            (str(operation), str(self.target.owner_id)))
        if not isinstance(value, dict):
            raise ValueError("Operation missing.")
        for k in ('id', 'owner_id', 'request_id'):
            value[k] = UUID(value[k])
        return value

    def identity_matches(self):
        return self._query("SELECT EXISTS(SELECT 1 FROM auth.users WHERE id=%s AND created_at=%s)",
                           (str(self.target.owner_id), self.target.created_at)) is True

    def session_inventory(self, owner):
        if owner != self.target.owner_id:
            raise ValueError("Owner mismatch.")
        value = self._query("""SELECT jsonb_build_object('count',
          (SELECT count(*) FROM auth.sessions WHERE user_id=%s),
          'captured_at',clock_timestamp()) WHERE EXISTS(SELECT 1 FROM auth.users
          WHERE id=%s AND created_at=%s)""",
          (str(owner), str(owner), self.target.created_at))
        if not isinstance(value, dict) or type(value.get('count')) is not int:
            raise ValueError("Session inventory unconfirmed.")
        return SessionInventory(self.target.ref, owner, self.target.operation_id,
                                True, value['count'], datetime.fromisoformat(value['captured_at']))

    def object_inventory(self, owner):
        if owner != self.target.owner_id:
            raise ValueError("Owner mismatch.")
        rows = self._query("""SELECT coalesce(jsonb_agg(to_jsonb(o)),'[]'::jsonb)
          FROM (SELECT bucket_id,name,version FROM storage.objects
          WHERE owner_id=%s ORDER BY bucket_id,name LIMIT 10001) o""", (str(owner),))
        if not isinstance(rows, list) or len(rows) > 10000:
            raise ValueError("Storage inventory exceeds bound or is unavailable.")
        objects = tuple(OwnedObject(owner, r['bucket_id'], r['name'], r['version']) for r in rows)
        return ObjectInventory(self.target.ref, owner, True, objects)

    def review(self, evidence, counts):
        if not self._locked or evidence.owner_id != self.target.owner_id or not self.identity_matches():
            raise ValueError("Identity changed.")
        self._query("SELECT arbor_private.erasure_review(%s,%s,%s,%s,true)",
                    (str(evidence.owner_id), str(evidence.request_id), evidence.request_version,
                     str(self.target.operation_id)))
        result = self.read(self.target.operation_id)
        if result['counts'] != counts:
            raise ValueError("Review inventory changed.")
        return result

    def _transition(self, name, operation):
        # Function names are from the hardcoded methods, never operator input.
        if (not self._locked or operation['id'] != self.target.operation_id
                or operation['owner_id'] != self.target.owner_id):
            raise ValueError("Serialized bound operation required.")
        approval = self.approval
        approval.require(operation, approval.phase, datetime.now(timezone.utc))
        # Atomic recheck after DB lock acquisition, including approval expiry and
        # immutable identity. Post-Auth confirmation deliberately expects absence.
        owner, key = str(self.target.owner_id), str(self.target.operation_id)
        phase = approval.phase
        if phase not in {'erasure_begin':('begin',), 'erasure_data':('data','database'),
                         'erasure_auth_confirm':('auth',)}.get(name, ()):
            raise ValueError("Invalid transition phase.")
        # All inserted literals originate from validated UUID/datetime/enumeration
        # objects, never strings supplied by an HTTP request. No bind parameters
        # inside a DO block (which PostgreSQL cannot parameterize).
        expiry = approval.expires_at.isoformat()
        created = self.target.created_at.isoformat()
        self._query(f"""DO $b$ DECLARE o arbor_private.account_erasure_operations%rowtype;
        BEGIN
          PERFORM pg_advisory_xact_lock(hashtextextended('arbor-account-lifecycle:{owner}',0));
          SELECT * INTO o FROM arbor_private.account_erasure_operations WHERE id='{key}' FOR UPDATE;
          IF NOT FOUND OR o.owner_id<>'{owner}'::uuid OR o.holds<>'[]'::jsonb THEN RAISE EXCEPTION 'bound_operation_changed'; END IF;
          IF clock_timestamp()>='{expiry}'::timestamptz THEN RAISE EXCEPTION 'approval_expired'; END IF;
          IF '{phase}' IN ('begin','data','database') AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id=o.owner_id AND created_at='{created}'::timestamptz) THEN RAISE EXCEPTION 'identity_changed'; END IF;
          IF '{phase}' IN ('begin','data','database') AND arbor_private.erasure_inventory(o.owner_id) IS DISTINCT FROM o.counts THEN RAISE EXCEPTION 'inventory_changed'; END IF;
          IF '{phase}' IN ('data','database') AND NOT EXISTS(
            SELECT 1 FROM arbor_private.account_lifecycle l
            JOIN arbor_private.account_deletion_requests q USING(user_id)
            WHERE l.user_id=o.owner_id AND l.state='erasing'
              AND l.version=o.request_version+1 AND q.request_id=o.request_id
              AND q.status='pending') THEN RAISE EXCEPTION 'request_barrier_changed'; END IF;
          IF '{phase}' IN ('data','database') AND (EXISTS(SELECT 1 FROM auth.sessions WHERE user_id=o.owner_id)
            OR EXISTS(SELECT 1 FROM storage.objects WHERE owner_id=o.owner_id::text)) THEN RAISE EXCEPTION 'provider_checkpoint_changed'; END IF;
          PERFORM arbor_private.{name}('{key}');
        END $b$;
        SELECT to_jsonb(o) FROM arbor_private.account_erasure_operations o WHERE id='{key}' AND owner_id='{owner}';""")
        return self.read(self.target.operation_id)

    def begin(self, operation):
        return self._transition('erasure_begin', operation)

    def erase_data(self, operation):
        return self._transition('erasure_data', operation)

    def mark_auth_erased(self, operation):
        return self._transition('erasure_auth_confirm', operation)

    def complete(self, operation):
        if not self._locked or operation['provider_status'] not in ('pending_copies', 'confirmed'):
            raise ValueError("Serialized provider assessment required.")
        self.approval.require(operation, 'complete', datetime.now(timezone.utc))
        key, owner = str(self.target.operation_id), str(self.target.owner_id)
        expiry = self.approval.expires_at.isoformat()
        status = operation['provider_status']
        self._query(f"""DO $b$ BEGIN
          PERFORM pg_advisory_xact_lock(hashtextextended('arbor-account-lifecycle:{owner}',0));
          IF clock_timestamp()>='{expiry}'::timestamptz THEN RAISE EXCEPTION 'approval_expired'; END IF;
          IF NOT EXISTS(SELECT 1 FROM arbor_private.account_erasure_operations WHERE id='{key}' AND owner_id='{owner}' AND holds='[]'::jsonb) THEN RAISE EXCEPTION 'operation_changed'; END IF;
          PERFORM arbor_private.erasure_finish('{key}','{status}');
        END $b$;
        SELECT to_jsonb(o) FROM arbor_private.account_erasure_operations o WHERE id='{key}';""")
        return self.read(self.target.operation_id)


class OperatorWorkflow:
    """One phase per short-lived human approval; default is read-only preflight."""
    def __init__(self, repository, providers, target: OperatorTarget, *, execution_enabled=False):
        if repository.target != target or providers.project != target:
            raise ValueError("Repository/provider target binding mismatch.")
        self.repository, self.providers, self.target = repository, providers, target
        self.execution_enabled = execution_enabled is True

    def preflight(self):
        capabilities = self.repository.capabilities()
        if not isinstance(capabilities, dict) or not capabilities or any(v is not True for v in capabilities.values()):
            raise ValueError("Required operator capabilities are unqualified.")
        return {"capabilities": capabilities,
                "provider": self.providers.preflight(self.target.owner_id),
                "execution_enabled": self.execution_enabled}

    def review(self, evidence: ReviewEvidence, now):
        if not self.execution_enabled:
            raise ValueError("Execution disabled; review would create operational metadata.")
        if (evidence.owner_id != self.target.owner_id or not evidence.operator.strip()
                or evidence.identity_method not in ('recent_owner_session','verified_existing_channel')
                or not evidence.completion_channel_confirmed or evidence.verified_at.tzinfo is None
                or evidence.verified_at > now):
            raise ValueError("Complete bound operator review required.")
        self.preflight()
        with self.repository.locked(self.target.owner_id):
            q = self.repository.request(self.target.owner_id)
            if q != {'request_id': evidence.request_id, 'version': evidence.request_version, 'state': 'deletion_pending'}:
                raise ValueError("Request changed.")
            counts = self.repository.inventory(self.target.owner_id)
            if not isinstance(counts, dict) or not counts or any(v is not None and (type(v) is not int or v < 0) for v in counts.values()):
                raise ValueError("Complete inventory required.")
            return self.repository.review(evidence, counts)

    def step(self, approval: Approval, now=None):
        now = now or datetime.now(timezone.utc)
        if not self.execution_enabled or self.providers.execution_enabled is not True:
            raise ApprovalFailure('execution_disabled')
        if (approval.owner_id != self.target.owner_id or approval.operation_id != self.target.operation_id
                or approval.expires_at > now + timedelta(minutes=3)):
            raise ApprovalFailure('approval_mismatch')
        with self.repository.locked(self.target.owner_id):
            o = self.repository.read(self.target.operation_id)
            if o['state'] == 'completed':
                return o  # Durable read reconciliation only; never replay side effects.
            self.repository.approval = approval
            return advance(self.repository, self.providers, o['id'], approval, now)

    def receipt(self):
        o = self.repository.read(self.target.operation_id)
        if o['state'] != 'completed' or o.get('provider_status') not in ('pending_copies','confirmed'):
            raise ValueError("Completion is unconfirmed.")
        return {'receipt_id': o['id'], 'active_system_data_erased': True,
                'provider_status': o['provider_status'], 'whole_account_erasure_claim': False,
                'communication_status': 'not_sent'}

    def resume_database(self, approval: Approval, now=None):
        """Reconcile Storage separately; never replay its removal to resume SQL."""
        now = now or datetime.now(timezone.utc)
        if not self.execution_enabled:
            raise ApprovalFailure('execution_disabled')
        if (approval.phase != 'database' or approval.owner_id != self.target.owner_id
                or approval.operation_id != self.target.operation_id
                or approval.expires_at > now + timedelta(minutes=3)):
            raise ApprovalFailure('approval_mismatch')
        with self.repository.locked(self.target.owner_id):
            o = self.repository.read(self.target.operation_id)
            if o['state'] in ('data_erased','auth_erased','completed'):
                return o
            approval.require(o,'database',now)
            if o['state'] != 'erasing' or o.get('holds'):
                raise ValueError('Current unheld erasing barrier required.')
            self.repository.approval = approval
            # The actual dispatch transaction verifies current identity,
            # request/barrier, complete counts and all sessions/objects absent.
            return self.repository.erase_data(o)
