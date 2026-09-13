"""Validate configured targets without changing allocation weights."""
import math
from fastapi import HTTPException

TARGET_TOTAL_TOLERANCE = 0.01  # Percentage points, for stored rounding only.
PLAN_UNAVAILABLE = "Your Arbor plan is temporarily unavailable. Please try again later."


def validate_targets(rows):
    if not isinstance(rows, list) or not rows:
        raise HTTPException(503, PLAN_UNAVAILABLE)
    seen = set()
    result = []
    for row in rows:
        if not isinstance(row, dict):
            raise HTTPException(503, PLAN_UNAVAILABLE)
        ticker, name, allocation = row.get("ticker"), row.get("asset_name"), row.get("allocation")
        if (not isinstance(ticker, str) or not ticker.strip()
                or not isinstance(name, str) or not name.strip()
                or isinstance(allocation, bool) or not isinstance(allocation, (int, float))
                or not math.isfinite(allocation) or allocation < 0 or allocation > 100):
            raise HTTPException(503, PLAN_UNAVAILABLE)
        ticker = ticker.strip().upper()
        if ticker in seen:
            raise HTTPException(503, PLAN_UNAVAILABLE)
        seen.add(ticker)
        result.append({**row, "ticker": ticker, "asset_name": name.strip()})
    if abs(math.fsum(row["allocation"] for row in result) - 100) > TARGET_TOTAL_TOLERANCE + 1e-10:
        raise HTTPException(503, PLAN_UNAVAILABLE)
    return result
