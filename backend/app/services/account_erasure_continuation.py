"""Local database-only continuation after independently verified Storage absence.

No client factory, credentials, route, production executor or automatic renewal.
The existing durable data_erased state remains the checkpoint for the subsequent
Auth phase. Never replay Storage removal merely to resume database work.
"""
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from typing import Callable, Protocol
from uuid import UUID
from app.services.account_erasure import Approval, ApprovalFailure, PhaseFailure


@dataclass(frozen=True)
class DatabaseEvidence:
    owner_id: UUID
    operation_id: UUID
    created_at: datetime
    captured_at: datetime
    complete: bool
    barrier_valid: bool
    sessions: int
    owned_objects: int
    counts: dict[str, int]


class Repository(Protocol):
    def read(self, operation_id: UUID) -> dict: ...
    def evidence(self, owner_id: UUID, operation_id: UUID) -> DatabaseEvidence: ...
    def erase_database_bound(self, approval: Approval, evidence: DatabaseEvidence) -> dict: ...


class DatabaseContinuation:
    def __init__(self, repository: Repository, verify_identity: Callable[[UUID], None],
                 expected_created_at: datetime, *, synthetic: bool,
                 clock: Callable[[], datetime] = lambda: datetime.now(timezone.utc)):
        if synthetic is not True or expected_created_at.tzinfo is None:
            raise ValueError("Only explicitly isolated synthetic continuation is enabled.")
        self.repository, self.verify_identity = repository, verify_identity
        self.created_at, self.clock = expected_created_at, clock

    def step(self, approval: Approval) -> dict:
        stage = "database_preflight"
        try:
            operation = self.repository.read(approval.operation_id)
            if operation['owner_id'] != approval.owner_id:
                raise ApprovalFailure("approval_mismatch")
            # Read-only reconciliation of a committed phase, never repeat DELETE.
            if operation['state'] in {'data_erased', 'auth_erased', 'completed'}:
                return operation
            approval.require(operation, 'database', self.clock())
            if operation['state'] != 'erasing' or operation.get('holds'):
                raise ValueError("Current erasing barrier required")
            evidence = self.repository.evidence(approval.owner_id, approval.operation_id)
            now = self.clock()
            if (not isinstance(evidence, DatabaseEvidence) or evidence.complete is not True
                    or evidence.barrier_valid is not True or evidence.owner_id != approval.owner_id
                    or evidence.operation_id != approval.operation_id or evidence.created_at != self.created_at
                    or evidence.captured_at.tzinfo is None or evidence.captured_at > now
                    or now - evidence.captured_at > timedelta(seconds=30)
                    or type(evidence.sessions) is not int or evidence.sessions != 0
                    or type(evidence.owned_objects) is not int or evidence.owned_objects != 0
                    or evidence.counts != operation['counts']
                    or any(type(n) is not int or n < 0 for n in evidence.counts.values())):
                raise ValueError("Complete current checkpoint evidence required")
            self.verify_identity(approval.owner_id)
            stage = "database_dispatch"
            # Slow preflight cannot extend the approval or evidence freshness.
            now = self.clock()
            approval.require(operation, 'database', now)
            if now - evidence.captured_at > timedelta(seconds=30):
                raise ValueError("Checkpoint evidence expired")
            # Repository MUST atomically recheck owner/barrier/identity/session/
            # Storage/counts and approval expiry in its dispatch transaction.
            result = self.repository.erase_database_bound(approval, evidence)
            if result['state'] != 'data_erased' or result['owner_id'] != approval.owner_id:
                raise ValueError("Database phase unconfirmed")
            return result
        except Exception as error:
            code = getattr(error, 'code', None)
            if code not in {'approval_expired', 'approval_mismatch'}:
                code = 'phase_unconfirmed'
            raise PhaseFailure('database', stage, code) from None


def database_dispatch_sql(approval: Approval, evidence: DatabaseEvidence) -> str:
    """Reviewed transaction text only; never executes SQL or acquires credentials.

    Same owner lock as existing lifecycle transitions; expiry is checked AFTER
    lock admission. Session/Storage/count guards are reevaluated in that
    transaction. Auth can still create a session outside that lock; subsequent
    phase checks must stop if it does, rather than claim an atomic Auth lease.
    """
    import json
    tables = {'holdings','profiles','arbor_monthly_checkins','arbor_investment_entries',
              'arbor_portfolio_holdings','arbor_portfolio_snapshots',
              'arbor_portfolio_history_changes','arbor_pending_recording_reminders',
              'arbor_pending_investment_recordings','arbor_ask_usage_monthly'}
    if (approval.phase != 'database' or approval.owner_id != evidence.owner_id
            or approval.operation_id != evidence.operation_id
            or approval.expires_at.tzinfo is None or evidence.created_at.tzinfo is None
            or not evidence.counts or not set(evidence.counts) <= tables
            or any(type(n) is not int or n < 0 for n in evidence.counts.values())):
        raise ApprovalFailure('approval_mismatch')
    owner, operation = UUID(str(approval.owner_id)), UUID(str(approval.operation_id))
    counts = json.dumps(evidence.counts, sort_keys=True, separators=(',',':'))
    return f"""BEGIN;
SET LOCAL statement_timeout='8s'; SET LOCAL lock_timeout='2s';
DO $erasure$ DECLARE o arbor_private.account_erasure_operations%rowtype;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('arbor-account-lifecycle:{owner}',0));
 SELECT * INTO o FROM arbor_private.account_erasure_operations WHERE id='{operation}' AND owner_id='{owner}' FOR UPDATE;
 IF NOT FOUND OR o.state<>'erasing' OR o.holds<>'[]'::jsonb THEN RAISE EXCEPTION 'erasure_checkpoint_changed'; END IF;
 IF clock_timestamp()>='{approval.expires_at.isoformat()}'::timestamptz THEN RAISE EXCEPTION 'erasure_approval_expired'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users u JOIN arbor_private.account_lifecycle l ON l.user_id=u.id JOIN arbor_private.account_deletion_requests q ON q.user_id=u.id WHERE u.id='{owner}' AND u.created_at='{evidence.created_at.isoformat()}'::timestamptz AND l.state='erasing' AND l.version=o.request_version+1 AND q.request_id=o.request_id AND q.status='pending') THEN RAISE EXCEPTION 'erasure_identity_or_request_changed'; END IF;
 IF EXISTS(SELECT 1 FROM auth.sessions WHERE user_id='{owner}') OR EXISTS(SELECT 1 FROM storage.objects WHERE owner_id='{owner}') THEN RAISE EXCEPTION 'erasure_provider_checkpoint_changed'; END IF;
 IF jsonb_strip_nulls(arbor_private.erasure_inventory('{owner}'))<>'{counts}'::jsonb THEN RAISE EXCEPTION 'erasure_inventory_changed'; END IF;
 PERFORM arbor_private.erasure_data('{operation}');
END $erasure$;
SELECT to_jsonb(o) AS result FROM arbor_private.account_erasure_operations o WHERE id='{operation}' AND owner_id='{owner}';
COMMIT;"""
