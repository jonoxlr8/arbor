from pydantic import BaseModel


class ProfileCreate(BaseModel):
    full_name: str
    country: str
    investment_goal: str
    investment_horizon: int
    experience_level: str
    age: int
    monthly_investment: float
    current_portfolio_value: float
    risk_tolerance: str
    risk_score: int | None = None