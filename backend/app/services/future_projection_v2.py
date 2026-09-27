"""Illustrative V2 future value; never a market forecast or portfolio history."""
from calendar import monthrange
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP, localcontext
from zoneinfo import ZoneInfo

from app.services.strategy_v2 import StrategyType, get_base_strategy


def manila_today() -> date:
    return datetime.now(ZoneInfo("Asia/Manila")).date()


def whole_months_until(today: date, target: date) -> int:
    """Count whole calendar-month anniversaries, clamping month-end dates."""
    months = (target.year - today.year) * 12 + target.month - today.month
    if months <= 0:
        return 0
    anniversary = min(today.day, monthrange(target.year, target.month)[1])
    return months - int(target.day < anniversary)


def future_value(starting_value: Decimal, monthly: Decimal, strategy: StrategyType,
                 today: date, target: date, goal: Decimal | None = None) -> dict:
    months = whole_months_until(today, target)
    if months <= 0 or months > 1200 or starting_value < 0 or monthly < 0:
        raise ValueError("Choose a future date with at least one whole contribution month")
    annual = get_base_strategy(strategy).planning_annual_rate
    with localcontext() as ctx:
        ctx.prec = 45
        monthly_rate = ((Decimal(1) + annual).ln() / Decimal(12)).exp() - Decimal(1)
        growth = (Decimal(1) + monthly_rate) ** months
        value = starting_value * growth + (monthly * (growth - Decimal(1)) / monthly_rate if monthly_rate else monthly * months)
        value = value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    result = {"starting_value_php": str(starting_value.quantize(Decimal("0.01"))),
              "monthly_contribution_php": str(monthly.quantize(Decimal("0.01"))),
              "annual_planning_rate_pct": str(annual * 100),
              "inflation_planning_rate_pct": "3.0",
              "whole_months": months, "target_date": target.isoformat(),
              "projected_value_php": str(value),
              "illustrative": True}
    if goal is not None:
        result["goal_target_php"] = str(goal.quantize(Decimal("0.01")))
        result["difference_to_goal_php"] = str((value - goal).quantize(Decimal("0.01")))
    return result
