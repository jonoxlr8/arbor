"""Operator-coordinated erasure. No web endpoint, credentials, or live adapter.

The store/provider interfaces deliberately require a separately qualified adapter.
Local qualification supplies synthetic implementations. Every irreversible phase
requires a fresh, matching operation approval; a timeout never means success.
"""
from calendar import monthrange
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Protocol
from uuid import UUID


class ApprovalFailure(ValueError):
    def __init__(self, code):
        self.code = code
        super().__init__("A current approval for this owner, operation and phase is required.")


class PhaseFailure(RuntimeError):
    """Only fixed local classifications; never carries provider error payloads."""
    def __init__(self, phase, stage, code):
        self.phase, self.stage, self.code = phase, stage, code
        super().__init__(f"Phase not confirmed: {phase}/{stage}/{code}. Review status before retrying; access remains restricted.")


@dataclass(frozen=True)
class Approval:
    operation_id: UUID
    owner_id: UUID
    phase: str
    expires_at: datetime

    def require(self, operation, phase, now):
        if (self.operation_id != operation["id"] or self.owner_id != operation["owner_id"]
                or self.phase != phase or self.expires_at.tzinfo is None or now.tzinfo is None):
            raise ApprovalFailure("approval_mismatch")
        if self.expires_at <= now:
            raise ApprovalFailure("approval_expired")


class Store(Protocol):
    def read(self, operation_id: UUID) -> dict: ...
    def begin(self, operation: dict) -> dict: ...
    def erase_data(self, operation: dict) -> dict: ...
    def mark_auth_erased(self, operation: dict) -> dict: ...
    def complete(self, operation: dict) -> dict: ...


class Providers(Protocol):
    def revoke_sessions(self, owner: UUID) -> None: ...
    def erase_storage(self, owner: UUID) -> None: ...
    def delete_auth(self, owner: UUID) -> None: ...
    def auth_absent(self, owner: UUID) -> bool: ...
    def assess_external_copies(self, owner: UUID) -> str | bool: ...


def advance(store: Store, providers: Providers, operation_id: UUID,
            approval: Approval, now: datetime | None = None) -> dict:
    """Advance one phase only. Operator adapters must serialize/version writes.

    A repeated external deletion must be idempotent. Failed calls leave the last
    committed phase intact; the caller gets a safe error, never provider payloads.
    Provider-copy assessment is mandatory before a completion receipt, even when
    it reports pending copies. Completion is scoped active-system completion.
    """
    now = now or datetime.now(timezone.utc)
    operation = store.read(operation_id)
    if operation["state"] == "completed":
        return operation
    if operation.get("holds"):
        raise ValueError("A scoped hold requires operator review before execution.")
    phase = {"reviewed": "begin", "erasing": "data", "data_erased": "auth",
             "auth_erased": "complete"}.get(operation["state"])
    if phase is None:
        raise ValueError("Operation is not ready for execution.")
    approval.require(operation, phase, now)
    authorize = getattr(providers, "authorize", None)
    if authorize is not None:
        authorize(approval)
    stage = "admission"
    try:
        if phase == "begin":
            operation = store.begin(operation)
            # A failure here leaves the durable erasing barrier in place. Retry
            # the data phase revokes again before any data/Storage removal.
            stage = "session_revocation"
            providers.revoke_sessions(operation["owner_id"])
            return operation
        if phase == "data":
            stage = "session_revocation"
            providers.revoke_sessions(operation["owner_id"])
            stage = "storage_removal"
            providers.erase_storage(operation["owner_id"])
            stage = "database_erasure"
            return store.erase_data(operation)
        if phase == "auth":
            stage = "auth_removal"
            providers.delete_auth(operation["owner_id"])
            if not providers.auth_absent(operation["owner_id"]):
                raise RuntimeError("Auth absence unverified")
            stage = "auth_confirmation"
            return store.mark_auth_erased(operation)
        if not providers.auth_absent(operation["owner_id"]):
            raise RuntimeError("Auth absence unverified")
        stage = "provider_assessment"
        assessment = providers.assess_external_copies(operation["owner_id"])
        if assessment is True:
            assessment = "pending_copies"  # Legacy synthetic boolean is not proof of full erasure.
        if assessment not in ("pending_copies", "confirmed"):
            raise RuntimeError("External copies have not been assessed")
        stage = "completion"
        return store.complete({**operation, "provider_status": assessment})
    except Exception as error:
        code = getattr(error, "code", None)
        if code not in {"approval_expired", "approval_mismatch", "execution_disabled", "guard_unconfirmed"}:
            code = "phase_unconfirmed"
        raise PhaseFailure(phase, stage, code) from None


def add_calendar_months(day: datetime, months: int) -> datetime:
    index = day.year * 12 + day.month - 1 + months
    year, zero_month = divmod(index, 12)
    month = zero_month + 1
    return day.replace(year=year, month=month, day=min(day.day, monthrange(year, month)[1]))


def support_cleanup_due(resolved_at: datetime, now: datetime, *, reopened=False, held=False) -> bool:
    """Manual Zoho checklist only, not a mailbox purge or new integration."""
    return not reopened and not held and add_calendar_months(resolved_at, 6) <= now


def review_targets(received_at: datetime, verified_at: datetime | None = None) -> dict:
    """Weekends excluded for acknowledgment; holidays require operator adjustment.

    Approved operating targets, never a statutory deadline. No email is sent.
    """
    acknowledgement = received_at
    business_days = 0
    while business_days < 2:
        acknowledgement += timedelta(days=1)
        if acknowledgement.weekday() < 5:
            business_days += 1
    return {"acknowledge_by": acknowledgement, "assess_by": received_at + timedelta(days=7),
            "complete_target": verified_at + timedelta(days=30) if verified_at else None,
            "next_update_by": received_at + timedelta(days=7)}
