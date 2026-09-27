"""Monthly provider continuation and owner-scoped resume controls."""
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Response

from app.auth import get_current_user_id
from app.routes.profiles import get_my_profile
from app.services.entitlements import get_entitlements
from app.services import monthly_checkin as monthly
from app.services.live_portfolio import catalog
from app.services.pending_recordings import PendingRecordingStore, StartRecording, ResolveRecording

router = APIRouter(prefix="/v2/pending-recordings", tags=["Pending recordings"])


@router.get("")
def list_pending(response: Response, user_id: str = Depends(get_current_user_id),
                 authorization: str | None = Header(default=None)):
    response.headers["Cache-Control"] = "private, no-store"
    return {"items": PendingRecordingStore(user_id, authorization).list_pending()}


@router.post("", status_code=201)
def start(request: StartRecording, user_id: str = Depends(get_current_user_id),
          authorization: str | None = Header(default=None)):
    saved = get_my_profile(user_id=user_id, authorization=authorization)
    if not monthly.enabled() or not monthly.eligible(saved, get_entitlements(user_id)):
        raise HTTPException(403, "Provider continuation is not available for your current plan or access.")
    if not any(item["product_id"] == request.product_id and item["provider"] == request.provider
               for item in catalog()):
        raise HTTPException(422, "Choose a supported investment and provider.")
    return PendingRecordingStore(user_id, authorization).start(request.product_id, request.provider)


@router.post("/{item_id}/resolve")
def resolve(item_id: UUID, request: ResolveRecording, user_id: str = Depends(get_current_user_id),
            authorization: str | None = Header(default=None)):
    # Deliberately available after a downgrade: dismissal never reveals Plus planning.
    return PendingRecordingStore(user_id, authorization).resolve(item_id, request.resolution)
