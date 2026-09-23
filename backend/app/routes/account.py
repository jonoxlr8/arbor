from fastapi import APIRouter, Depends, Header, HTTPException, Response
from app.auth import get_current_user_id
from app.services.entitlements import get_entitlements
from app.services.ask_usage import ask_usage

router = APIRouter()


@router.get("/account/entitlements")
def account_entitlements(response: Response, user_id: str = Depends(get_current_user_id), authorization: str | None = Header(default=None)):
    value = get_entitlements(user_id)
    response.headers["Cache-Control"] = "private, no-store"
    try:
        usage = ask_usage(value, authorization)
    except HTTPException as exc:
        if exc.status_code != 503:
            raise
        return {**value.model_dump(), "ask_usage": None, "ask_usage_available": False}
    return {**value.model_dump(), "ask_usage": usage, "ask_usage_available": True}
