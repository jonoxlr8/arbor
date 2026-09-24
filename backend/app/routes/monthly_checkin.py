from fastapi import APIRouter, Depends, Header, HTTPException, Response
from app.auth import get_current_user_id
from app.routes.profiles import get_my_profile
from app.services.entitlements import get_entitlements
from app.services import monthly_checkin as monthly

router = APIRouter(prefix="/v2/monthly-checkin")


def context(user_id, authorization):
    if not monthly.enabled():
        raise HTTPException(404, "Monthly check-ins are not currently available.")
    saved = get_my_profile(user_id=user_id, authorization=authorization)
    if not monthly.eligible(saved, get_entitlements(user_id)):
        raise HTTPException(403, "Monthly completion is not available for your current plan or access. Review your next step on Home.")
    return monthly.MonthlyStore(user_id, authorization)


@router.get("")
def read(response: Response, user_id: str = Depends(get_current_user_id), authorization: str | None = Header(default=None)):
    response.headers["Cache-Control"] = "private, no-store"
    return context(user_id, authorization).run()


@router.post("")
def complete(request: monthly.Completion, user_id: str = Depends(get_current_user_id), authorization: str | None = Header(default=None)):
    return context(user_id, authorization).run("complete", request.month, request.amount_php)


@router.post("/undo")
def undo(request: monthly.Undo, user_id: str = Depends(get_current_user_id), authorization: str | None = Header(default=None)):
    return context(user_id, authorization).run("undo", request.month)
