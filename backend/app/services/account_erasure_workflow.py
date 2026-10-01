"""Local integration contract. No client factory, credentials or production route.

The repository adapter owns durable compare/version and owner locking. Holding
that lock across one phase prevents overlapping operator actions; it is not a
distributed transaction with Auth/Storage. Provider uncertainty remains pending.
"""
from contextlib import AbstractContextManager
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol
from uuid import UUID

from app.services.account_erasure import Approval, Providers, advance


@dataclass(frozen=True)
class ReviewEvidence:
    owner_id: UUID
    request_id: UUID
    request_version: int
    verified_at: datetime
    identity_method: str
    operator: str
    completion_channel_confirmed: bool


class Repository(Protocol):
    def locked(self, owner: UUID) -> AbstractContextManager: ...
    def request(self, owner: UUID) -> dict: ...
    def inventory(self, owner: UUID) -> dict[str, int]: ...
    def review(self, evidence: ReviewEvidence, counts: dict[str, int]) -> dict: ...
    def read(self, operation_id: UUID) -> dict: ...
    def begin(self, operation: dict) -> dict: ...
    def erase_data(self, operation: dict) -> dict: ...
    def mark_auth_erased(self, operation: dict) -> dict: ...
    def complete(self, operation: dict) -> dict: ...


class LocalWorkflow:
    """One resumable phase per fresh approval, synthetic execution only.

    A completion channel is verified before admission, but this class never
    sends a message. Preparing a receipt does not imply successful delivery.
    """
    def __init__(self, repository: Repository, providers: Providers, *, synthetic: bool):
        if synthetic is not True:
            raise ValueError("Production execution is not enabled.")
        self.repository = repository
        self.providers = providers

    def review(self, evidence: ReviewEvidence, now: datetime) -> dict:
        if (not evidence.operator.strip() or evidence.identity_method not in
                {"recent_owner_session", "verified_existing_channel"}
                or evidence.verified_at.tzinfo is None or now.tzinfo is None
                or evidence.verified_at > now or not evidence.completion_channel_confirmed):
            raise ValueError("Identity, accountable review and completion channel required.")
        with self.repository.locked(evidence.owner_id):
            request = self.repository.request(evidence.owner_id)
            if (request["request_id"] != evidence.request_id
                    or request["version"] != evidence.request_version
                    or request["state"] != "deletion_pending"):
                raise ValueError("Request changed; review current status.")
            counts = self.repository.inventory(evidence.owner_id)
            if not counts or any(type(n) is not int or n < 0 for n in counts.values()):
                raise ValueError("Complete count-only inventory required.")
            return self.repository.review(evidence, counts)

    def step(self, approval: Approval, now: datetime) -> dict:
        with self.repository.locked(approval.owner_id):
            operation = self.repository.read(approval.operation_id)
            if operation["owner_id"] != approval.owner_id:
                raise ValueError("Owner mismatch.")
            if operation["state"] == "reviewed":
                request = self.repository.request(approval.owner_id)
                if (request["state"] != "deletion_pending"
                        or request["request_id"] != operation["request_id"]
                        or request["version"] != operation["request_version"]):
                    raise ValueError("Request changed; execution blocked.")
                if self.repository.inventory(approval.owner_id) != operation["counts"]:
                    raise ValueError("Inventory changed; repeat review.")
            return advance(self.repository, self.providers, approval.operation_id, approval, now)

    def receipt(self, operation_id: UUID) -> dict:
        operation = self.repository.read(operation_id)
        if operation["state"] != "completed":
            raise ValueError("Erasure not confirmed.")
        if operation.get("provider_status") not in {"pending_copies", "confirmed"}:
            raise ValueError("Provider assessment missing.")
        return {"receipt_id": operation["id"], "active_system_data_erased": True,
                "provider_status": operation["provider_status"],
                "whole_account_erasure_claim": False,
                "communication_status": "not_sent"}
