from pydantic import BaseModel
from app.schemas.validation import Money, Years, AnnualReturn


class ProjectionRequest(BaseModel):
    current_value: Money
    monthly_investment: Money
    years: Years
    annual_return: AnnualReturn = 0.08
