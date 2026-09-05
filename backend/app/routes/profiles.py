from fastapi import APIRouter, Depends, Header, HTTPException

from app.auth import get_current_user_id
from app.database import get_authenticated_client
from app.schemas.profile import ProfileCreate
from app.schemas.projection import ProjectionRequest
from app.services.arbor.insights import PortfolioInsights
from app.services.investment_plan_service import build_investment_plan
from app.services.projection_engine import calculate_projection

router = APIRouter()


@router.get("/profiles/me")
def get_my_profile(
    user_id: str = Depends(get_current_user_id),
    authorization: str | None = Header(default=None),
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Missing authorization token",
        )

    access_token = authorization.split(" ", 1)[1]

    authenticated_supabase = get_authenticated_client(access_token)

    response = (
        authenticated_supabase.table("profiles")
        .select("*")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )

    if not response.data:
        raise HTTPException(
            status_code=404,
            detail="Profile not found",
        )

    saved_profile = response.data[0]

    profile = ProfileCreate(
        full_name=saved_profile["full_name"],
        country=saved_profile["country"],
        goal_target=saved_profile["goal_target"],
        investment_horizon=saved_profile["investment_horizon"],
        monthly_investment=saved_profile["monthly_investment"],
        current_portfolio_value=saved_profile["current_portfolio_value"],
        risk_tolerance=saved_profile["risk_tolerance"],
        risk_score=saved_profile.get("risk_score"),
        currency=saved_profile.get("currency", "USD"),
    )

    plan = build_investment_plan(profile)

    PortfolioInsights(
        {
            "profile": plan.profile_data,
            "portfolio": plan.portfolio,
            "projection": plan.projection,
            "health": plan.health,
        }
    ).generate()

    return {
        "message": "Profile loaded successfully",
        "profile": {
            **plan.profile_data,
            "goal_target": plan.profile_data.get("goal_target"),
        },
        "portfolio": plan.portfolio,
        "explanation": plan.explanation,
        "projection": plan.projection,
        "health": plan.health,
    }


@router.put("/profiles/me")
def update_my_profile(
    profile: ProfileCreate,
    user_id: str = Depends(get_current_user_id),
    authorization: str | None = Header(default=None),
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Missing authorization token",
        )

    access_token = authorization.split(" ", 1)[1]

    plan = build_investment_plan(profile)

    data = {
        **plan.profile_data,
        "user_id": user_id,
    }

    authenticated_supabase = get_authenticated_client(access_token)

    response = (
        authenticated_supabase.table("profiles")
        .update(data)
        .eq("user_id", user_id)
        .execute()
    )

    if not response.data:
        raise HTTPException(
            status_code=404,
            detail="Profile not found",
        )

    return {
        "message": "Profile updated successfully",
        "profile": {
            **response.data[0],
            "goal_target": plan.profile_data.get("goal_target"),
        },
        "portfolio": plan.portfolio,
        "explanation": plan.explanation,
        "projection": plan.projection,
        "health": plan.health,
    }


@router.post("/profiles")
def create_profile(
    profile: ProfileCreate,
    user_id: str = Depends(get_current_user_id),
    authorization: str | None = Header(default=None),
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Missing authorization token",
        )

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

    response = authenticated_supabase.table("profiles").insert(data).execute()

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
