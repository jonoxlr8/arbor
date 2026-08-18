from pydantic import BaseModel


class ProfileCreate(BaseModel):
    full_name: str
    country: str
    goal_target: float
    investment_horizon: int
    monthly_investment: float
    current_portfolio_value: float
    risk_tolerance: str
    risk_score: int | None = None
    currency: str = "USD"
