"""JWT-bound lifecycle operations. No admin key, erasure or personal-data logging."""
from fastapi import HTTPException


def lifecycle(authorization: str | None, action="status", expected_version=None,
              action_id=None, confirm=False):
    from app.auth import get_verified_user_id
    get_verified_user_id(authorization)
    try:
        from app.database import get_authenticated_client
        client = get_authenticated_client(authorization.split(" ", 1)[1])
        result = client.rpc("arbor_account_lifecycle_v1", {
            "p_action": action, "p_expected_version": expected_version,
            "p_action_id": str(action_id) if action_id else None, "p_confirm": confirm,
        }).execute().data
    except Exception as error:
        code = getattr(error, "code", "")
        message = getattr(error, "message", "")
        if code == "PT401":
            raise HTTPException(401, "Your session has ended. Sign in again.") from None
        if code == "PT403":
            raise HTTPException(403, "Sign out and sign in again before changing account status.") from None
        if code == "PT400":
            raise HTTPException(400, "Confirm the account action before continuing.") from None
        if code == "PT409":
            raise HTTPException(409, "Account status changed. Refresh and review it before continuing.") from None
        if code in ("PT429", "55P03", "57014"):
            raise HTTPException(429, "The account is busy. Please retry shortly.") from None
        # Never echo database errors, claims or provider details.
        raise HTTPException(503, "Account status is unavailable. Please retry or contact support@arbor.ph.") from None
    if (not isinstance(result, dict) or result.get("state") not in
            ("active", "deactivated", "deletion_pending", "erasing")
            or type(result.get("version")) is not int or result["version"] < 0
            or type(result.get("access_allowed")) is not bool
            or type(result.get("in_flight_reminders")) is not int
            or result.get("erasure_available") is not False):
        raise HTTPException(503, "Account status could not be verified.")
    processing = result.get("processing")
    if processing is not None:
        from datetime import datetime
        try:
            if (not isinstance(processing, dict) or set(processing) != {"state", "verified_at", "completion_target", "held"}
                    or processing["state"] not in ("reviewed", "erasing", "data_erased", "auth_erased", "completed")
                    or type(processing["held"]) is not bool
                    or any(datetime.fromisoformat(processing[key]).tzinfo is None for key in ("verified_at", "completion_target"))):
                raise ValueError("Invalid processing status")
        except (ValueError, TypeError, KeyError):
            raise HTTPException(503, "Deletion processing status could not be verified.") from None
    return result


def require_active(authorization):
    status = lifecycle(authorization)
    if not status["access_allowed"]:
        raise HTTPException(403, "Your account is restricted. Open account status or sign in again.")
