"""Durable Free metering. Plus returns before constructing any storage client."""
from fastapi import HTTPException
from datetime import datetime, timezone
from app.database import get_authenticated_client
from app.services.entitlements import Entitlements

LIMIT_MESSAGE = "You’ve used your Free Ask Arbor questions for this month."


def ask_usage(entitlements: Entitlements, authorization: str | None, *, consume=False):
    if entitlements.ask_monthly_limit is None:
        return None
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing authorization token")
    if entitlements.qa_exhausted:
        return {"used": 10, "remaining": 0, "allowed": False,
                "period": datetime.now(timezone.utc).strftime("%Y-%m-01")}
    try:
        result = get_authenticated_client(authorization.split(" ", 1)[1]).rpc(
            "arbor_ask_usage", {"p_consume": consume}).execute().data
        if (not isinstance(result, dict) or type(result.get("used")) is not int
                or not 0 <= result["used"] <= 10 or type(result.get("allowed")) is not bool
                or result.get("remaining") != 10 - result["used"] or not isinstance(result.get("period"), str)):
            raise ValueError("Invalid usage response")
        return result
    except Exception:
        raise HTTPException(503, "Ask Arbor usage could not be verified. Please try again later.") from None


def check_quota(usage):
    if usage is not None and not usage["allowed"]:
        raise HTTPException(429, {"code": "ask_arbor_limit", "message": LIMIT_MESSAGE,
                                 "usage": usage, "destination": "settings"})
