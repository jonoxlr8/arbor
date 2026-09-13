from pydantic import BaseModel
from app.schemas.validation import Money, Goal, Years, RiskCategory
from app.schemas.currency import Currency


class ProfileCreate(BaseModel):
    full_name: str
    country: str
    goal_target: Goal
    investment_horizon: Years
    monthly_investment: Money
    current_portfolio_value: Money
    risk_tolerance: RiskCategory
    risk_score: int | None = None
    currency: Currency = "USD"
