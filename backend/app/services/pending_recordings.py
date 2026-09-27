"""Owner-scoped resume tasks. These never change holdings or financial values."""
from typing import Literal
from uuid import UUID

from fastapi import HTTPException
from httpx import TransportError
from postgrest.exceptions import APIError

from app.database import get_authenticated_client
from app.services.strategy_v2 import DomainModel


class StartRecording(DomainModel):
    product_id: str
    provider: str


class ResolveRecording(DomainModel):
    resolution: Literal["recorded", "dismissed"]


class PendingRecordingStore:
    def __init__(self, owner: str, authorization: str | None):
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(401, "Sign in to view your unfinished recordings.")
        self.owner = owner
        self.client = get_authenticated_client(authorization.split(" ", 1)[1])

    def list_pending(self):
        try:
            return (self.client.table("arbor_pending_investment_recordings")
                    .select("id,product_id,provider,source,status,started_at,resolved_at")
                    .eq("user_id", self.owner).eq("status", "pending")
                    .order("started_at", desc=True).order("id", desc=True).limit(20).execute().data)
        except (APIError, TransportError, ValueError, TypeError):
            raise HTTPException(503, "Unfinished recordings are temporarily unavailable. Please retry.") from None

    def start(self, product_id: str, provider: str):
        return self._rpc("arbor_start_pending_recording", {"p_product_id": product_id, "p_provider": provider})

    def resolve(self, item_id: UUID, resolution: str):
        return self._rpc("arbor_resolve_pending_recording", {"p_id": str(item_id), "p_resolution": resolution})

    def _rpc(self, name: str, params: dict):
        try:
            return self.client.rpc(name, params).execute().data
        except APIError as exc:
            if exc.code == "22023":
                raise HTTPException(409, "This unfinished recording changed or is not available. Reload and try again.") from None
            raise HTTPException(503, "Unfinished recordings are temporarily unavailable. Please retry.") from None
        except (TransportError, ValueError, TypeError):
            raise HTTPException(503, "Unfinished recordings are temporarily unavailable. Please retry.") from None
