from app.services.risk_engine import (
    calculate_risk_score,
    classify_risk,
)

from app.services.portfolio_engine import (
    get_portfolio_recommendation,
)

from app.services.explanation_engine import (
    generate_explanation,
)

from app.services.projection_engine import (
    calculate_projection,
)
from app.schemas.investment_plan import InvestmentPlan


def build_investment_plan(profile):

    # Calculate risk
    risk_score = calculate_risk_score(profile)
    risk_level = classify_risk(risk_score)

    # Prepare data for database
    data = profile.model_dump()

    data["risk_score"] = risk_score
    data["risk_level"] = risk_level

    # Portfolio
    portfolio = get_portfolio_recommendation(risk_level)

    # Explanation
    explanation = generate_explanation(
        profile,
        portfolio,
    )

    # Projection
    projection = calculate_projection(
        profile.current_portfolio_value,
        profile.monthly_investment,
        profile.investment_horizon,
    )

    return InvestmentPlan(
        profile_data=data,
        portfolio=portfolio,
        explanation=explanation,
        projection=projection,
    )