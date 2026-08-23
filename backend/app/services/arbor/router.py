from app.services.arbor.greetings import (
    greeting_response,
    thanks_response,
    whoami_response,
)
from app.services.arbor.investments import (
    crypto_response,
)
from app.services.arbor.planning import (
    retirement_response,
    millionaire_response,
    investing_enough_response,
)
from app.services.arbor.advisor_responses import (
    buy_more_response,
    sell_response,
    rebalance_response,
)
from app.services.arbor.health import (
    portfolio_health_response,
)
from app.services.arbor.review import (
    portfolio_review_response,
)
from app.services.arbor.dashboard import (
    dashboard_response,
)
from app.services.arbor.market import (
    market_crash_response,
    market_response,
)
from app.services.arbor.strategy import (
    investment_strategy_response,
)
from app.services.arbor.technology import (
    technology_response,
)
from app.services.arbor.progress import (
    progress_response,
)
from app.services.arbor.contributions import (
    increase_contributions_response,
)
from app.services.arbor.projection import (
    projection_response,
)
from app.services.arbor.risk import (
    portfolio_risk_response,
)
from app.services.arbor.changes import (
    portfolio_change_response,
)
from app.services.arbor.explanation import (
    explanation_response,
)
from app.services.arbor.timeline import (
    year_projection_response,
    ten_year_projection_response,
)
from app.services.arbor.semiconductor import (
    semiconductor_response,
)
from app.services.arbor.recommendation import (
    asset_recommendation_response,
)
from app.services.arbor.comparison_response import comparison_response
from app.services.arbor.ownership import (
    ownership_response,
)
from app.services.arbor.portfolio_strategy import (
    portfolio_strategy_response,
)
from app.services.arbor.overlap import overlap_response

ROUTES = {
    "greeting": lambda c: greeting_response(c["name"]),
    "thanks": lambda c: thanks_response(c["name"]),
    "whoami": lambda c: whoami_response(),
    "crypto": lambda c: crypto_response(
        c["risk"],
        c["horizon"],
        c["plan"],
    ),
    "retirement": lambda c: retirement_response(
        c["risk"],
        c["horizon"],
        c["projected_value"],
        c["investment_years"],
        c["return_percent"],
        c["currency"],
    ),
    "millionaire": lambda c: millionaire_response(
        c["projected_value"],
        c["investment_years"],
        c["current_value"],
        c["monthly_contribution"],
        c["currency"],
    ),
    "investing_enough": lambda c: investing_enough_response(
        c["current_value"],
        c["monthly_contribution"],
        c["horizon"],
        c["return_percent"],
        c["currency"],
    ),
    "buy_more": lambda c: buy_more_response(
        c["ticker"],
        c["allocation"],
        c["target_allocation"],
        c["risk"],
        c["horizon"],
    ),
    "asset_recommendation": lambda c: asset_recommendation_response(
        c["ticker"],
        c["allocation"],
        c["target_allocation"],
        c["risk"],
        c["horizon"],
    ),
    "sell": lambda c: sell_response(
        c["ticker"],
        c["allocation"],
        c["risk"],
        c["horizon"],
    ),
    "rebalance": lambda c: rebalance_response(
        c["risk"],
        c["horizon"],
    ),
    "portfolio_health": lambda c: portfolio_health_response(),
    "portfolio_review": lambda c: portfolio_review_response(
        c["plan"],
    ),
    "dashboard": lambda c: dashboard_response(
        c["plan"],
    ),
    "market_crash": lambda c: market_crash_response(
        c["risk"],
        c["horizon"],
    ),
    "investment_strategy": lambda c: investment_strategy_response(
        c["risk"],
        c["horizon"],
    ),
    "market": lambda c: market_response(
        c["risk"],
        c["horizon"],
        c["plan"],
    ),
    "technology": lambda c: technology_response(
        c["risk"],
        c["horizon"],
        c["plan"],
    ),
    "progress": lambda c: progress_response(
        c["projected_value"],
        c["investment_years"],
        c["current_value"],
        c["monthly_contribution"],
        c["return_percent"],
        c["goal_target"],
        c["currency"],
        c["required_monthly_investment"],
    ),
    "increase_contributions": lambda c: increase_contributions_response(
        c["current_value"],
        c["monthly_contribution"],
        c["horizon"],
        c["currency"],
    ),
    "projection": lambda c: projection_response(
        c["current_value"],
        c["monthly_contribution"],
        c["investment_years"],
        c["return_percent"],
        c["projected_value"],
        c["currency"],
    ),
    "portfolio_risk": lambda c: portfolio_risk_response(
        c["risk"],
        c["horizon"],
    ),
    "portfolio_change": lambda c: portfolio_change_response(
        c["risk"],
        c["horizon"],
    ),
    "explanation": lambda c: explanation_response(
        c["risk"],
        c["horizon"],
        c["goal_target"],
        c["currency"],
    ),
    "year_projection": lambda c: year_projection_response(
        c["projection_value"],
        c["requested_year"],
        c["monthly_contribution"],
        c["return_percent"],
        c["currency"],
    ),
    "ten_year_projection": lambda c: ten_year_projection_response(
        c["projection_value"],
        c["monthly_contribution"],
        c["return_percent"],
        c["currency"],
    ),
    "semiconductor": lambda c: semiconductor_response(
        c["risk"],
        c["horizon"],
        c["plan"],
    ),
    "comparison": lambda c: comparison_response(
        c.get("left"),
        c.get("right"),
        c["risk"],
        c["horizon"],
    ),
    "ownership": lambda c: ownership_response(
        c["ticker"],
        c.get("role", "Portfolio Holding"),
        c.get(
            "why_owned",
            "This investment supports your long-term investment strategy.",
        ),
        c.get("risk", "unknown"),
        c.get("horizon", "unknown"),
        c.get("portfolio", []),
    ),
    "overlap": lambda c: overlap_response(
        c["plan"],
        c.get("overlap_assets", []),
    ),
    "portfolio_strategy": lambda c: portfolio_strategy_response(
        c["risk"],
        c["horizon"],
        c["goal_target"],
        c["holdings"],
    ),
}


def route_intent(intent, context):
    handler = ROUTES.get(intent)

    if handler:
        return handler(context)

    return None
