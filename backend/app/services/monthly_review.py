"""Recorded activity only: no return attribution, targets or investment advice."""
from datetime import datetime
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo

from fastapi import HTTPException


def shift_month(month, offset):
    year, number = map(int, month.split("-"))
    index = year * 12 + number - 1 + offset
    return f"{index // 12:04d}-{index % 12 + 1:02d}"


def review_window(month=None, now=None):
    current = (now or datetime.now(ZoneInfo("Asia/Manila"))).astimezone(ZoneInfo("Asia/Manila")).strftime("%Y-%m")
    month = month or shift_month(current, -1)
    if not 1900 <= int(month[:4]) <= 9999 or month > current:
        raise HTTPException(422, "Choose a recorded month on or before the current Philippine month.")
    return month, current, [shift_month(month, offset) for offset in range(-5, 1)]


def monthly_review(store, month=None, now=None):
    selected, current, months = review_window(month, now)
    start, end = months[0] + "-01", shift_month(selected, 1) + "-01"
    rows = store.review_activity(start, end)
    # Offset pagination is not an atomic snapshot. A second full read detects
    # ordinary concurrent revisions/inserts/voids; refuse a mixed result.
    if rows != store.review_activity(start, end):
        raise HTTPException(409, "Your investment records changed. Refresh this review.")
    ids = set()
    for row in rows:
        if row["id"] in ids or not start <= row["investment_date"] < end:
            raise HTTPException(503, "The complete recorded activity could not be verified.")
        ids.add(row["id"])
    def total(items):
        active = [r for r in items if r.get("voided_at") is None]
        try:
            known = [Decimal(str(r["amount_paid_php"])) for r in active if r["amount_paid_php"] is not None]
        except (InvalidOperation, ValueError, TypeError):
            raise HTTPException(503, "Recorded PHP amounts are unavailable.") from None
        if any(not a.is_finite() or a < 0 or a != a.quantize(Decimal(".01")) for a in known):
            raise HTTPException(503, "Recorded PHP amounts are unavailable.")
        return {"amount_php": f"{sum(known, Decimal(0)):.2f}" if known else None,
                "record_count": len(active), "missing_amount_count": len(active) - len(known)}
    from app.services.insights_history import budget_comparison
    versions = store.budget_versions() if hasattr(store, "budget_versions") else None
    pattern = [{"month": key, **total([r for r in rows if r["investment_date"][:7] == key])} for key in months]
    if rows != store.review_activity(start, end):
        raise HTTPException(409, "Your investment records changed. Refresh this review.")
    for item in pattern:
        item["budget"] = budget_comparison(item, item["month"], versions)
    chosen = [r for r in rows if r["investment_date"][:7] == selected and r.get("voided_at") is None]
    investments = sorted({(r["product_id"], r["provider"], r["holding_id"]) for r in chosen})
    breakdown = [{"product_id": p, "provider": provider, "holding_id": holding,
                  **total([r for r in chosen if r["holding_id"] == holding])} for p, provider, holding in investments]
    breakdown.sort(key=lambda r: (-(Decimal(r["amount_php"]) if r["amount_php"] else 0), r["product_id"], r["holding_id"]))
    return {"month": selected, "current_month": current, "in_progress": selected == current,
            "currency": "PHP", **total(chosen), "budget": pattern[-1]["budget"], "breakdown": breakdown, "pattern": pattern,
            "available_months": sorted(set([selected] + [shift_month(current, offset) for offset in range(0, -7, -1)]), reverse=True)}
