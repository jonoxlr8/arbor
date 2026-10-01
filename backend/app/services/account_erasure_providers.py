"""Unwired Supabase SDK adapters for isolated qualification only.

No dotenv, client factory, key reading, credential storage, email or public route.
Clients must be explicitly supplied from a separately approved isolated setup.
Production and the deleted disposable project are always rejected here.
"""
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Callable
from urllib.parse import urlsplit
from uuid import UUID

from supabase_auth import SyncGoTrueAdminAPI, SyncGoTrueClient
from storage3 import SyncStorageClient
from app.services.account_erasure import Approval, ApprovalFailure

BLOCKED_PROJECTS = {"gnjjtlswwhkpiabyayvi", "yzoljwvcwhbjeifyvyfh"}
PROVIDER_CATEGORIES = frozenset({"supabase_auth_logs", "supabase_backups", "render_logs",
    "vercel_logs", "resend_delivery", "zoho_support", "operator_exports"})


class AdapterError(RuntimeError):
    """Safe classification only; never include provider payloads or tokens."""
    def __init__(self, message, *, code="provider_unconfirmed"):
        self.code = code
        super().__init__(message)


@dataclass(frozen=True)
class IsolatedProject:
    ref: str
    origin: str

    @classmethod
    def from_metadata(cls, metadata: dict):
        import re
        ref = metadata.get("id", "")
        if (not isinstance(ref, str) or not re.fullmatch("[a-z]{20}", ref)
                or ref in BLOCKED_PROJECTS or metadata.get("name") != "arbor-erasure-test"
                or metadata.get("organization_id") != "bdvnhzpvywuzoylvffzt"
                or metadata.get("status") != "ACTIVE_HEALTHY"):
            raise AdapterError("No verified isolated erasure project is available.")
        return cls(ref, f"https://{ref}.supabase.co")

    def check_client(self, url, suffix):
        value = urlsplit(str(url))
        if (self.ref in BLOCKED_PROJECTS or self.origin != f"https://{self.ref}.supabase.co"
                or value.scheme != "https" or value.netloc != f"{self.ref}.supabase.co"
                or value.path.rstrip("/") != suffix or value.query or value.fragment
                or value.username or value.password):
            raise AdapterError("Client does not match the verified isolated target.")


@dataclass(frozen=True)
class OwnedObject:
    owner_id: UUID
    bucket: str
    name: str
    version: str


@dataclass(frozen=True)
class ObjectInventory:
    project_ref: str
    owner_id: UUID
    complete: bool
    objects: tuple[OwnedObject, ...]


@dataclass(frozen=True)
class SessionInventory:
    """Authoritative count-only read, supplied through already authorized access.

    No token/session identifiers. Unknown or stale inventory never proves absence.
    The supplier must query all sessions for this exact owner and bind the durable
    erasure operation/barrier; an Auth 403 or logout response is not inventory.
    """
    project_ref: str
    owner_id: UUID
    operation_id: UUID
    complete: bool
    session_count: int
    captured_at: datetime


class IsolatedSessionInventoryReader:
    """Read-only management query supplied by the isolated qualification runner.

    No client factory/key/grant. The callback must target this verified project.
    A single SELECT binds identity, operation, request, durable barrier and ALL
    owner sessions in one database statement. Missing rows never mean absence.
    """
    def __init__(self, *, project: IsolatedProject, owner: UUID, operation: UUID,
                 expected_created_at: datetime, read: Callable[[str], dict]):
        import re
        if (expected_created_at.tzinfo is None or project.ref in BLOCKED_PROJECTS
                or not re.fullmatch(r"[a-z]{20}", project.ref)
                or project.origin != f"https://{project.ref}.supabase.co"):
            raise AdapterError("Verified isolated identity required.")
        self.project, self.owner, self.operation = project, UUID(str(owner)), UUID(str(operation))
        self.expected_created_at, self.read = expected_created_at, read

    def __call__(self, owner):
        if owner != self.owner:
            raise AdapterError("Session inventory owner mismatch.")
        query = f"""SELECT jsonb_build_object(
          'project_ref','{self.project.ref}', 'owner_id',o.owner_id,
          'operation_id',o.id, 'created_at',u.created_at,
          'barrier_valid',true, 'complete',true,
          'session_count',(SELECT count(*) FROM auth.sessions s WHERE s.user_id=o.owner_id),
          'captured_at',clock_timestamp()) AS result
        FROM arbor_private.account_erasure_operations o
        JOIN arbor_private.account_lifecycle l ON l.user_id=o.owner_id
        JOIN arbor_private.account_deletion_requests q ON q.user_id=o.owner_id
        JOIN auth.users u ON u.id=o.owner_id
        WHERE o.id='{self.operation}' AND o.owner_id='{self.owner}'
          AND u.created_at='{self.expected_created_at.isoformat()}'::timestamptz
          AND o.state IN ('erasing','data_erased') AND o.holds='[]'::jsonb
          AND l.state='erasing' AND l.version=o.request_version+1
          AND q.request_id=o.request_id AND q.status='pending'"""
        try:
            row = self.read(query)
            now = datetime.now(timezone.utc)
            if (not isinstance(row, dict) or row.get('complete') is not True
                    or row.get('barrier_valid') is not True
                    or row.get('project_ref') != self.project.ref
                    or UUID(row['owner_id']) != self.owner
                    or UUID(row['operation_id']) != self.operation
                    or datetime.fromisoformat(row['created_at']) != self.expected_created_at
                    or type(row.get('session_count')) is not int or row['session_count'] < 0):
                raise ValueError("Unconfirmed bound evidence")
            captured = datetime.fromisoformat(row['captured_at'])
            if captured.tzinfo is None or captured > now or now-captured > timedelta(seconds=30):
                raise ValueError("Stale evidence")
            return SessionInventory(self.project.ref, self.owner, self.operation,
                                    True, row['session_count'], captured)
        except Exception:
            raise AdapterError("Bound management session inventory was not confirmed.") from None


class IsolatedGuardSessionEvidence:
    """One authoritative read serves its paired guard and session check once.

    The reader already joins current identity, operation, request and barrier.
    No reuse across checkpoints: every guard discards previous evidence; every
    inventory consumes it. Adapter freshness validation still applies after the
    independent SDK identity check. Missing/consumed evidence fails closed.
    """
    def __init__(self, reader: IsolatedSessionInventoryReader):
        self.reader = reader
        self._pending = None

    def guard(self, owner):
        self._pending = None
        evidence = self.reader(owner)
        if evidence.session_count != 0:
            return False
        self._pending = evidence
        return True

    def inventory(self, owner):
        evidence, self._pending = self._pending, None
        if evidence is None or evidence.owner_id != owner:
            raise AdapterError("Fresh paired guard/session evidence is required.")
        return evidence


@dataclass(frozen=True)
class ProviderReview:
    """Operator assessment, not an API claim that every provider copy is erased."""
    owner_id: UUID
    operation_id: UUID
    reviewed_at: datetime
    categories: dict[str, str] = field(repr=False)

    def status(self, owner, operation):
        if (self.owner_id != owner or self.operation_id != operation
                or self.reviewed_at.tzinfo is None or self.reviewed_at > datetime.now(timezone.utc)
                or set(self.categories) != PROVIDER_CATEGORIES
                or any(value not in ("pending", "confirmed_absent", "retained_scoped")
                       for value in self.categories.values())):
            raise AdapterError("Complete owner-bound provider assessment is required.")
        # Even confirmed_absent is operator evidence, never legal certification.
        return "confirmed" if all(v == "confirmed_absent" for v in self.categories.values()) else "pending_copies"


class SupabaseErasureProviders:
    def __init__(self, *, project: IsolatedProject, owner: UUID, operation: UUID,
                 expected_created_at: datetime, auth: SyncGoTrueAdminAPI,
                 session_auth: SyncGoTrueClient, storage: SyncStorageClient,
                 inventory: Callable[[UUID], ObjectInventory],
                 owner_token: Callable[[UUID], str],
                 guard_probe: Callable[[UUID], bool], review: ProviderReview | None = None,
                 execution_enabled: bool = False,
                 session_inventory: Callable[[UUID], SessionInventory] | None = None):
        project.check_client(auth._url, "/auth/v1")
        project.check_client(session_auth._url, "/auth/v1")
        project.check_client(storage._base_url, "/storage/v1")
        for client in (auth._http_client, session_auth._http_client, storage.session):
            limits = (client.timeout.connect, client.timeout.read, client.timeout.write, client.timeout.pool)
            if client.follow_redirects or any(value is None or value <= 0 or value > 10 for value in limits):
                raise AdapterError("Explicit bounded HTTP clients without redirects are required.")
        if expected_created_at.tzinfo is None:
            raise AdapterError("Verified Auth identity creation time is required.")
        self.project, self.owner, self.operation = project, owner, operation
        self.expected_created_at = expected_created_at
        self.auth, self.session_auth, self.storage = auth, session_auth, storage
        self.inventory, self.owner_token, self.guard_probe = inventory, owner_token, guard_probe
        self.review, self.execution_enabled = review, execution_enabled
        self._approval = None
        self.session_inventory = session_inventory

    def authorize(self, approval: Approval):
        self._approval = approval  # Memory only, never persisted or logged.

    def _bound(self, owner):
        if owner != self.owner:
            raise AdapterError("Owner does not match this isolated operation.")

    def _execution(self, owner, phase):
        self._bound(owner)
        if not self.execution_enabled or self._approval is None:
            raise AdapterError("Execution is disabled; only read-only preflight is available.", code="execution_disabled")
        try:
            self._approval.require({"id": self.operation, "owner_id": owner}, phase, datetime.now(timezone.utc))
        except ApprovalFailure as error:
            raise AdapterError("Fresh matching phase approval is required.", code=error.code) from None
        try:
            guarded = self.guard_probe(owner) is True
        except Exception:
            raise AdapterError("Account and Storage restrictions have not been verified.", code="guard_unconfirmed") from None
        if not guarded:
            raise AdapterError("Account and Storage restrictions have not been verified.", code="guard_unconfirmed")
        # A slow authoritative guard must not carry authorization past its expiry.
        try:
            self._approval.require({"id": self.operation, "owner_id": owner}, phase, datetime.now(timezone.utc))
        except ApprovalFailure as error:
            raise AdapterError("Fresh matching phase approval is required.", code=error.code) from None

    def _identity(self, owner):
        self._bound(owner)
        try:
            response = self.auth.get_user_by_id(str(owner))
            user = response.user
            if user is None or UUID(user.id) != owner or user.created_at != self.expected_created_at:
                raise AdapterError("Identity changed or could not be verified.")
            return user
        except AdapterError:
            raise
        except Exception:
            raise AdapterError("Auth identity preflight was not confirmed.") from None

    def _objects(self, owner):
        self._bound(owner)
        try:
            result = self.inventory(owner)
            if (not isinstance(result, ObjectInventory) or result.complete is not True
                    or result.owner_id != owner or result.project_ref != self.project.ref
                    or len(result.objects) > 10000):
                raise ValueError("Incomplete inventory")
            seen = set()
            import re
            for item in result.objects:
                if (not isinstance(item, OwnedObject) or item.owner_id != owner
                        or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,99}", item.bucket)
                        or item.bucket in (".", "..") or not item.name or not item.version
                        or len(item.name.encode()) > 1024
                        or any(ord(c) < 32 for c in item.name + item.bucket)
                        or (item.bucket, item.name) in seen):
                    raise ValueError("Invalid inventory")
                seen.add((item.bucket, item.name))
            return result.objects
        except Exception:
            raise AdapterError("Complete owner-scoped Storage inventory was not confirmed.") from None

    def preflight(self, owner):
        """Reads Auth identity and count-only Storage metadata; no writes."""
        self._identity(owner)
        objects = self._objects(owner)
        return {"isolated_target": True, "identity_matches": True, "owned_object_count": len(objects),
                "execution_enabled": self.execution_enabled, "provider_assessed": self.review is not None}

    def _session_count(self, owner):
        self._bound(owner)
        try:
            if self.session_inventory is None:
                raise ValueError("Missing inventory")
            result = self.session_inventory(owner)
            now = datetime.now(timezone.utc)
            if (not isinstance(result, SessionInventory) or result.complete is not True
                    or result.project_ref != self.project.ref or result.owner_id != owner
                    or result.operation_id != self.operation
                    or type(result.session_count) is not int or result.session_count < 0
                    or result.captured_at.tzinfo is None or result.captured_at > now
                    or now - result.captured_at > timedelta(seconds=30)):
                raise ValueError("Unbound or stale inventory")
            return result.session_count
        except Exception:
            raise AdapterError("Complete current owner-bound session inventory is required.") from None

    def _confirm_session_absence(self, owner, phase):
        # Recheck durable admission and immutable Auth identity before a second
        # authoritative read. No cached zero, revoked token or error-code shortcut.
        self._execution(owner, phase)
        self._identity(owner)
        if self._session_count(owner) != 0:
            raise AdapterError("Owner sessions remain or changed; revocation is unconfirmed.")

    def revoke_sessions(self, owner):
        phase = self._approval.phase if self._approval else "begin"
        if phase not in ("begin", "data"):
            raise AdapterError("Session revocation is not authorized for this phase.")
        self._execution(owner, phase)
        self._identity(owner)
        if self._session_count(owner) == 0:
            self._confirm_session_absence(owner, phase)
            return
        try:
            token = self.owner_token(owner)
            verified = self.session_auth.get_user(token)
            if not token or verified is None or verified.user is None or UUID(verified.user.id) != owner:
                raise ValueError("Session owner mismatch")
            self.auth.sign_out(token, scope="global")
        except Exception:
            raise AdapterError("Owner-bound session revocation was not confirmed.") from None
        self._confirm_session_absence(owner, phase)

    def erase_storage(self, owner):
        self._execution(owner, "data")
        self._identity(owner)
        before = self._objects(owner)
        # Quiesced access and stable versioned metadata are prerequisites. Path
        # prefixes alone never establish ownership. No bucket-empty operation.
        if before != self._objects(owner):
            raise AdapterError("Storage inventory changed; review before removal.")
        try:
            buckets = {}
            for item in before:
                buckets.setdefault(item.bucket, []).append(item.name)
            for bucket, names in buckets.items():
                for offset in range(0, len(names), 1000):
                    self._execution(owner, "data")
                    self.storage.from_(bucket).remove(names[offset:offset + 1000])
            if self._objects(owner):
                raise ValueError("Objects remain")
        except AdapterError:
            raise
        except Exception:
            raise AdapterError("Storage deletion is unconfirmed; reconcile inventory before retrying.") from None

    def auth_absent(self, owner):
        self._bound(owner)
        try:
            response = self.auth.get_user_by_id(str(owner))
            if response.user is None:
                raise AdapterError("Auth absence is unconfirmed.")
            if UUID(response.user.id) != owner or response.user.created_at != self.expected_created_at:
                raise AdapterError("A different identity exists; stop.")
            return False
        except AdapterError:
            raise
        except Exception as error:
            if getattr(error, "status", None) == 404 and getattr(error, "code", None) == "user_not_found":
                return True
            raise AdapterError("Auth absence is unconfirmed.") from None

    def delete_auth(self, owner):
        self._execution(owner, "auth")
        if self.auth_absent(owner):
            return  # Reconciled retry; no duplicate irreversible request.
        if self._objects(owner):
            raise AdapterError("Owned Storage objects remain; Auth deletion is blocked.")
        try:
            self._execution(owner, "auth")
            self.auth.delete_user(str(owner), should_soft_delete=False)
        except Exception:
            raise AdapterError("Auth deletion is unconfirmed; inspect absence before retrying.") from None
        if not self.auth_absent(owner):
            raise AdapterError("Auth identity still exists; stop.")

    def assess_external_copies(self, owner):
        self._bound(owner)
        if self.review is None:
            raise AdapterError("Provider review is missing; completion is blocked.")
        return self.review.status(owner, self.operation)
