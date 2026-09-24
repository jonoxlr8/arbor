"""Product navigation only. No investment calculations or session-state guesses."""
from typing import Literal

from app.services.strategy_v2 import DomainModel
from app.services.arbor.v2_context import build_v2_context
from app.services.entitlements import Entitlements
from app.services.live_portfolio import Portfolio


class NextAction(DomainModel):
    key: Literal["financial_foundation", "complete_profile", "review_short_term_path",
                 "review_historical_plan", "review_monthly_contribution", "add_first_holding", "update_portfolio"]
    title: str
    explanation: str
    destination: Literal["investment_profile", "onboarding", "plan", "portfolio", "settings"]
    button_label: str
    blocking: bool = False


def get_next_action(saved: dict | None, entitlements: Entitlements | None = None, portfolio: Portfolio | None = None) -> NextAction:
    action = _plan_action(saved)
    if action.key == "review_monthly_contribution" and portfolio is not None:
        if not portfolio.holdings:
            action = NextAction(key="add_first_holding", title="Add your first holding",
                explanation="Record investments you already own to compare current values with your selected plan.",
                destination="portfolio", button_label="Add holding")
        elif not portfolio.complete or portfolio.stale_count:
            action = NextAction(key="update_portfolio", title="Review portfolio data",
                explanation="Some portfolio values are stale or unavailable. Review your records and update any fund values before calculating a contribution scenario.",
                destination="portfolio", button_label="Review portfolio")
    if entitlements is not None:
        if action.destination == "portfolio" and "monthly_contribution_planner" not in entitlements.features:
            return action.model_copy(update={"title": "Explore contribution planning", "explanation": "Contribution scenarios are part of Arbor Plus. Your selected plan and basic planning tools remain available on Free.", "destination": "settings", "button_label": "Explore Arbor Plus"})
        if action.destination == "investment_profile" and "profile_rebuild" not in entitlements.features:
            return action.model_copy(update={"destination": "plan", "button_label": "Review saved plan"})
    return action


def _plan_action(saved: dict | None) -> NextAction:
    """Consume an owner-restored canonical response. None means verified absence.

    Corrupt records raise; they are not interpreted as new/incomplete profiles.
    Implementation choices are not persisted, so no completion claim is made.
    """
    if saved is None:
        return NextAction(key="complete_profile", title="Complete your investment profile",
            explanation="Add your planning answers, then review the available approaches.",
            destination="onboarding", button_label="Complete profile")
    context = build_v2_context(saved)
    if not context.contributions_allowed:
        return NextAction(key="financial_foundation", title="Review your financial foundation",
            explanation="Your saved readiness check pauses contribution scenarios. Review your financial-foundation answers; your plan remains saved.",
            destination="investment_profile", button_label="Review investment profile", blocking=True)
    if context.path == "short_term":
        return NextAction(key="review_short_term_path", title="Review your short-term path",
            explanation="Your current horizon has no active long-term allocation. Any dormant approach remains saved.",
            destination="plan", button_label="Review plan", blocking=True)
    if context.plan_basis == "historical_assessment":
        return NextAction(key="review_historical_plan", title="Review your existing investment plan",
            explanation="Your historical plan remains saved. Review it and compare standardized approaches before starting new contribution scenarios.",
            destination="investment_profile", button_label="Review existing plan")
    return NextAction(key="review_monthly_contribution", title="Review this month’s contribution",
        explanation="Explore how a contribution could affect your selected targets. Implementation choices and current values are entered for each session; nothing is invested automatically.",
        destination="portfolio", button_label="Review contribution")
