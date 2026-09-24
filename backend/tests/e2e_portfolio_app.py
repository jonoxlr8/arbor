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
from app.services.live_portfolio import Holding, Price, value_portfolio, MANUAL_FUNDS

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
                          "3000000" if key == "btc_php" else "100", as_of=datetime.now(timezone.utc),
                          source="exchangerate_api" if key == "usd_php" else "coinranking" if key == "btc_php" else "marketstack" if key.startswith("gotrade_") else "official_nav") for key in keys
                if not (os.getenv("ARBOR_MANUAL_VALUE_E2E") == "true" and key in MANUAL_FUNDS)}

    def save(self, request, holding_id=None):
        with lock:
            key = str(holding_id) if holding_id else str(uuid4())
            if holding_id and key not in rows: raise HTTPException(404, "Holding not found")
            if not holding_id and any(h.product_id == request.product_id for h in rows.values()):
                raise HTTPException(409, "Already recorded")
            now = datetime.now(timezone.utc)
            previous = rows.get(key)
            payload = request.model_dump()
            if previous and "manual_value_php" not in request.model_fields_set:
                payload["manual_value_php"] = previous.manual_value_php
            stamp = (previous.manual_value_updated_at if previous and payload["manual_value_php"] == previous.manual_value_php
                     else now if payload["manual_value_php"] is not None else None)
            rows[key] = Holding(**payload, id=key, created_at=previous.created_at if previous else now,
                                updated_at=now, manual_value_updated_at=stamp)

    def save_manual_value(self, holding_id, request):
        with lock:
            key = str(holding_id)
            if key not in rows: raise HTTPException(404, "Holding not found")
            if rows[key].product_id not in MANUAL_FUNDS: raise HTTPException(422, "Supported PHP funds only")
            if request.manual_value_php is None and rows[key].units is None:
                raise HTTPException(422, "Keep units or a current value")
            now = datetime.now(timezone.utc)
            rows[key] = Holding(**{**rows[key].model_dump(), **request.model_dump(),
                "manual_value_updated_at": now if request.manual_value_php is not None else None, "updated_at": now})

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
