from fastapi import APIRouter, Depends, Header, HTTPException, Response
from app.auth import get_current_user_id
from app.config import live_portfolio_enabled
from app.services.entitlements import get_entitlements
from app.services.ask_usage import ask_usage

router = APIRouter()


@router.get("/account/entitlements")
def account_entitlements(response: Response, user_id: str = Depends(get_current_user_id), authorization: str | None = Header(default=None)):
    value = get_entitlements(user_id)
    from app.services.monthly_checkin import enabled
    availability = {"live_portfolio": live_portfolio_enabled(), "monthly_checkin": enabled()}
    response.headers["Cache-Control"] = "private, no-store"
    try:
        usage = ask_usage(value, authorization)
    except HTTPException as exc:
        if exc.status_code != 503:
            raise
        return {**value.model_dump(), "availability": availability, "ask_usage": None, "ask_usage_available": False}
    return {**value.model_dump(), "availability": availability, "ask_usage": usage, "ask_usage_available": True}
