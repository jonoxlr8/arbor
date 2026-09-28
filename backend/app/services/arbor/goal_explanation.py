"""Owner-goal explanation from the saved goal and canonical valued portfolio."""
from decimal import Decimal, localcontext


def explain_goal_progress(saved: dict, portfolio) -> str:
    goal = saved["profile"].get("goal_target")
    if goal is None or Decimal(str(goal)) <= 0:
        return "You haven't saved a positive goal target yet. Set or edit your primary goal on Home to see actual progress."
    if portfolio is None:
        return "Your current portfolio records are temporarily unavailable, so I can't explain complete goal progress right now."
    target = Decimal(str(goal))
    known = portfolio.known_value_php
    if not portfolio.complete:
        return (f"Known progress: PHP {known:,.2f} toward your PHP {target:,.2f} goal. "
                f"{portfolio.unavailable_count} holding(s) need an updated value before Arbor can show a complete percentage. Missing values are not zero.")
    with localcontext() as ctx:
        ctx.prec = 50
        percentage = (known / target * Decimal(100)).quantize(Decimal("0.1"))
    return (f"Your recorded portfolio is PHP {known:,.2f} toward your PHP {target:,.2f} goal, "
            f"or {percentage}% complete. This is actual current progress, not a future projection.")
