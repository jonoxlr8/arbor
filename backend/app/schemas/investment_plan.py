from pydantic import BaseModel


class InvestmentPlan(BaseModel):
    profile_data: dict
    portfolio: list
    explanation: dict
    projection: dict