"""Local-only monthly fixture, sharing normal auth and isolated portfolio store.

Never imported by production. No hosted monthly/profile/portfolio writes.
"""
import os
from copy import deepcopy
from datetime import datetime, timezone
from threading import RLock
from fastapi import HTTPException

if (os.getenv("APP_ENV") != "test" or os.getenv("ARBOR_MONTHLY_E2E") != "true"
        or os.getenv("MONTHLY_CHECKIN_ENABLED") != "true" or os.getenv("RENDER") or os.getenv("VERCEL")):
    raise RuntimeError("Monthly fixture requires explicit local test environment")

from e2e_portfolio_app import app
from app.services import monthly_checkin as monthly

records = {}
lock = RLock()


class LocalMonthlyStore:
    def __init__(self, user_id, authorization):
        if user_id != os.environ["ARBOR_E2E_USER_ID"] or not authorization:
            raise HTTPException(403, "Dedicated fixture account required")
        self.owner = user_id

    def run(self, action="read", month=None, amount=None):
        with lock:
            now = datetime.now(timezone.utc)
            current = monthly.month_key(now)
            key = (self.owner, current)
            if action != "read" and month != current:
                raise HTTPException(409, "Month changed")
            row = records.get(key)
            if action == "complete" and (row is None or row["undone_at"]):
                records[key] = {"month": current, "amount_php": str(amount), "completed_at": now.isoformat(), "undone_at": None}
            if action == "undo" and row and not row["undone_at"]:
                row["undone_at"] = now.isoformat()
            row = records.get(key)
            return {"month": current, "current": deepcopy(row) if row and not row["undone_at"] else None,
                    "history": [deepcopy(v) for (u,m),v in sorted(records.items(),reverse=True) if u == self.owner][:12]}


monthly.MonthlyStore = LocalMonthlyStore


@app.middleware("http")
async def monthly_fixture_marker(request, call_next):
    response = await call_next(request)
    response.headers["X-Arbor-Monthly-Fixture"] = "isolated"
    return response
