"""Authenticated, stateless contribution calculations. No profile/database orchestration."""
from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user_id
from app.schemas.contributions import (
    ContributionAPIRequest, ContributionPlanResponse, ContributionRecommendationResponse,
    plan_response, recommendation_response,
)
from app.services.contributions.engine import recommend_next_contribution
from app.services.contributions.planner import plan_monthly_contribution

router = APIRouter(prefix="/contributions", tags=["Contributions"],
                   dependencies=[Depends(get_current_user_id)])


@router.post("/recommendation", response_model=ContributionRecommendationResponse,
             summary="What should I buy next?",
             description="Calculate one next contribution from explicit inputs. Does not execute or save a trade.")
def contribution_recommendation(request: ContributionAPIRequest):
    try:
        result = recommend_next_contribution(request.to_domain())
    except ValueError:
        raise HTTPException(400, "These inputs could not produce a contribution recommendation.") from None
    return recommendation_response(result)


@router.post("/plan", response_model=ContributionPlanResponse,
             summary="How should I allocate this contribution?",
             description="Calculate a full contribution plan with executable, unverified, waiting and reserve amounts. Nothing is persisted.")
def contribution_plan(request: ContributionAPIRequest):
    try:
        result = plan_monthly_contribution(request.to_domain())
    except ValueError:
        raise HTTPException(400, "These inputs could not produce a contribution plan.") from None
    return plan_response(result)
