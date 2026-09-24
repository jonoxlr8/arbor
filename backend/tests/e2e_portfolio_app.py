"""Explicit local E2E entrypoint, NEVER imported by app.main.

Real JWT authentication and real read-only profile restoration. Only portfolio
records/quotes/history use isolated process fixtures. No hosted portfolio writes.
"""
import os
from datetime import datetime, timezone
from uuid import uuid4
from threading import RLock
from fastapi import HTTPException

if (os.getenv("APP_ENV") != "test" or os.getenv("ARBOR_PORTFOLIO_E2E") != "true"
        or not os.getenv("ARBOR_E2E_USER_ID") or os.getenv("RENDER") or os.getenv("VERCEL")):
    raise RuntimeError("Portfolio fixture server requires explicit local test configuration")

from app.main import app
from app.routes import live_portfolio
from app.services.live_portfolio import Holding, Price, value_portfolio

rows = {}
history = {}
lock = RLock()


class LocalFixtureStore:
    def __init__(self, user_id, authorization):
        from app.config import live_portfolio_enabled
        if not live_portfolio_enabled():
            raise RuntimeError("Disabled portfolio must never access storage")
        if user_id != os.environ["ARBOR_E2E_USER_ID"] or not authorization:
            raise HTTPException(403, "Dedicated test account required")

    def holdings(self):
        with lock: return list(rows.values())

    def prices(self, keys):
        return {key: Price(price_key=key, value="56" if key == "usd_php" else
                          "3000000" if key == "btc_php" else "100", as_of=datetime.now(timezone.utc)) for key in keys}

    def save(self, request, holding_id=None):
        with lock:
            key = str(holding_id) if holding_id else str(uuid4())
            if holding_id and key not in rows: raise HTTPException(404, "Holding not found")
            if not holding_id and any(h.product_id == request.product_id for h in rows.values()):
                raise HTTPException(409, "Already recorded")
            now = datetime.now(timezone.utc)
            rows[key] = Holding(**request.model_dump(), id=key, created_at=rows[key].created_at if key in rows else now, updated_at=now)

    def delete(self, holding_id):
        with lock:
            if str(holding_id) not in rows: raise HTTPException(404, "Holding not found")
            del rows[str(holding_id)]

    def capture(self):
        with lock:
            result = value_portfolio(self.holdings(), self, None)
            if not result.holdings or not result.complete or result.stale_count: return False
            today = result.valued_at.date().isoformat()
            history.setdefault(today, {"day": today, "value_php": str(result.total_value_php), "captured_at": result.valued_at.isoformat()})
            return True

    def history(self):
        with lock: return list(history.values())


live_portfolio.PortfolioStore = LocalFixtureStore


@app.middleware("http")
async def fixture_marker(request, call_next):
    response = await call_next(request)
    response.headers["X-Arbor-Portfolio-Fixture"] = "isolated"
    return response
