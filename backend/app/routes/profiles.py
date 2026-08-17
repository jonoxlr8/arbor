from fastapi import APIRouter
from app.database import supabase
from app.schemas.profile import ProfileCreate
from app.services.risk_engine import calculate_risk_score, classify_risk
from app.services.portfolio_engine import get_portfolio_recommendation
from app.services.explanation_engine import generate_explanation
from app.services.projection_engine import calculate_projection
from app.services.investment_plan_service import build_investment_plan
from app.services.arbor.insights import PortfolioInsights

router = APIRouter()


@router.get("/profiles")
def get_profiles():
    response = supabase.table("profiles").select("*").execute()
    return response.data


@router.post("/profiles")
def create_profile(profile: ProfileCreate):

    plan = build_investment_plan(profile)

    insights = PortfolioInsights(
        {
            "profile": plan.profile_data,
            "portfolio": plan.portfolio,
            "projection": plan.projection,
            "health": plan.health,
        }
    ).generate()

    data = plan.profile_data

    response = supabase.table("profiles").insert(data).execute()

    return {
        "message": "Profile created successfully",
        "profile": {
            **response.data[0],
            "goal_target": plan.profile_data.get("goal_target"),
        },
        "portfolio": plan.portfolio,
        "explanation": plan.explanation,
        "projection": plan.projection,
        "health": plan.health,
    }
