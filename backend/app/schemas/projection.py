from pydantic import BaseModel


class ProjectionRequest(BaseModel):
    current_value: float
    monthly_investment: float
    years: int
    annual_return: float = 0.08