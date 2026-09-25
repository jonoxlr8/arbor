"""User-reported activity, never a transaction or holdings mutation."""
import os
from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal

from fastapi import HTTPException
from httpx import TransportError
from postgrest.exceptions import APIError
from pydantic import Field

from app.database import get_authenticated_client
from app.services.strategy_v2 import DomainModel
from app.services.arbor.v2_context import build_v2_context


def enabled():
    # Prepared migration must be deliberately installed before enabling.
    return os.getenv("MONTHLY_CHECKIN_ENABLED") == "true"


def month_key(now=None):
    return (now or datetime.now(timezone.utc)).astimezone(timezone.utc).strftime("%Y-%m")


def eligible(saved, access):
    if not saved or saved.get("strategy_engine_version") != "2.0":
        return False
    c = build_v2_context(saved)
    return ("monthly_contribution_planner" in access.features and c.contributions_allowed
            and c.path == "long_term" and c.plan_basis == "user_selected")


class Completion(DomainModel):
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    amount_php: Decimal = Field(gt=0, lt=Decimal("1000000000000"), max_digits=14, decimal_places=2, allow_inf_nan=False)


class Undo(DomainModel):
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")


class MonthlyStore:
    def __init__(self, user_id, authorization):
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(401, "Sign in to view your check-ins.")
        # RPC derives owner exclusively from this JWT. No user ID parameter.
        self.client = get_authenticated_client(authorization.split(" ", 1)[1])

    def run(self, action: Literal["read", "complete", "undo"] = "read", month=None, amount=None):
        try:
            return self.client.rpc("arbor_monthly_checkin", {
                "p_action": action, "p_month": month,
                "p_amount": str(amount) if amount is not None else None,
            }).execute().data
        except APIError as exc:
            if exc.code == "22023":
                raise HTTPException(409, "The month or profile changed. Reload your check-in before continuing.") from None
            raise HTTPException(503, "Monthly check-ins are temporarily unavailable. Please retry.") from None
        except (TransportError, ValueError, TypeError):
            raise HTTPException(503, "Monthly check-ins are temporarily unavailable. Please retry.") from None


def read_monthly(user_id, authorization, saved, access):
    if not enabled() or not eligible(saved, access):
        return None
    return MonthlyStore(user_id, authorization).run()


def explain_monthly(state):
    if state is None:
        return "Monthly check-ins are not available for this plan or environment. Your saved plan and readiness guidance remain available."
    current = state.get("current")
    if current:
        date = datetime.fromisoformat(current["completed_at"]).astimezone(timezone.utc).date().isoformat()
        return (f"For {state['month']} (UTC), you recorded a ₱{Decimal(current['amount_php']):,.2f} contribution as invested on "
                f"{date}. This is your report of activity outside Arbor, not a verified trade. "
                "Your holdings and portfolio history are tracked separately; this record does not update them.")
    return f"No completed check-in is recorded for {state['month']} (UTC). Open Home → Invest this month to review your contribution and record activity completed outside Arbor. This is not an instruction to invest."
