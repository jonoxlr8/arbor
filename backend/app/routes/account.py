from fastapi import APIRouter, Depends, Header, HTTPException, Response, Request
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


@router.get("/account/export")
def account_export(request: Request, authorization: str | None = Header(default=None)):
    from datetime import datetime, timezone
    from fastapi.responses import JSONResponse
    from app.services.account_export import verified_identity, limits, read_export
    from app.schemas.account_export import validate_export
    headers = {"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"}
    try:
        if request.query_params:
            raise HTTPException(400, "Export does not accept account selectors.")
        owner, session = verified_identity(authorization)
        with limits.acquire(owner):
            try:
                body = validate_export(read_export(authorization), owner)
            except ValueError:
                raise HTTPException(503, "A complete export could not be verified. Please retry.") from None
        day = datetime.now(timezone.utc).date().isoformat()
        headers["Content-Disposition"] = f'attachment; filename="arbor-account-export-{day}.json"'
        return JSONResponse(body, headers=headers)
    except HTTPException as exc:
        return JSONResponse({"detail": exc.detail}, status_code=exc.status_code,
                            headers={**headers, **(exc.headers or {})})


from app.schemas.account_lifecycle import LifecycleAction


def lifecycle_response(request, authorization, action="status", body=None):
    from fastapi.responses import JSONResponse
    from app.services.account_lifecycle import lifecycle
    headers = {"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"}
    try:
        if request.query_params:
            raise HTTPException(400, "Account actions do not accept selectors.")
        result = lifecycle(authorization, action,
                           body.expected_version if body else None,
                           body.action_id if body else None,
                           body.confirm if body else False)
        return JSONResponse(result, headers=headers)
    except HTTPException as error:
        return JSONResponse({"detail": error.detail}, status_code=error.status_code, headers=headers)


@router.get("/account/lifecycle")
def account_lifecycle(request: Request, authorization: str | None = Header(default=None)):
    return lifecycle_response(request, authorization)


@router.post("/account/lifecycle/login")
def lifecycle_login(request: Request, authorization: str | None = Header(default=None)):
    return lifecycle_response(request, authorization, "login")


@router.post("/account/deactivate")
def deactivate(request: Request, body: LifecycleAction, authorization: str | None = Header(default=None)):
    return lifecycle_response(request, authorization, "deactivate", body)


@router.post("/account/deletion-requests")
def request_deletion(request: Request, body: LifecycleAction, authorization: str | None = Header(default=None)):
    return lifecycle_response(request, authorization, "request_deletion", body)


@router.post("/account/deletion-requests/current/withdraw")
def withdraw_deletion(request: Request, body: LifecycleAction, authorization: str | None = Header(default=None)):
    return lifecycle_response(request, authorization, "cancel_deletion", body)
