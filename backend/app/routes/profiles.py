from fastapi import APIRouter, Depends, Header
from app.database import get_authenticated_client
from app.auth import get_current_user_id
from app.schemas.profile import ProfileCreate
from app.services.projection_engine import calculate_projection
from app.services.investment_plan_service import build_investment_plan
from app.services.arbor.insights import PortfolioInsights
from app.schemas.projection import ProjectionRequest

router = APIRouter()


@router.get("/profiles")
def get_profiles():
    return {"message": "Profile lookup requires authentication."}


@router.post("/profiles")
def create_profile(
    profile: ProfileCreate,
    user_id: str = Depends(get_current_user_id),
    authorization: str | None = Header(default=None),
):
    if not authorization or not authorization.startswith("Bearer "):
        raise ValueError("Missing authorization token")

    access_token = authorization.split(" ", 1)[1]

    plan = build_investment_plan(profile)

    PortfolioInsights(
        {
            "profile": plan.profile_data,
            "portfolio": plan.portfolio,
            "projection": plan.projection,
            "health": plan.health,
        }
    ).generate()

    data = {
        **plan.profile_data,
        "user_id": user_id,
    }

    authenticated_supabase = get_authenticated_client(access_token)

    response = (
        authenticated_supabase
        .table("profiles")
        .insert(data)
        .execute()
    )

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


@router.post("/projection")
def create_projection(request: ProjectionRequest):
    projection = calculate_projection(
        request.current_value,
        request.monthly_investment,
        request.years,
        request.annual_return,
    )
    return projection
