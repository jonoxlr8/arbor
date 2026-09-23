"""Authenticated, stateless contribution calculations. No profile/database orchestration."""
from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user_id
from app.services.entitlements import require_contributions
from app.schemas.contributions import (
    ContributionAPIRequest, ContributionPlanResponse, ContributionRecommendationResponse,
    plan_response, recommendation_response,
)
from app.services.contributions.engine import recommend_next_contribution
from app.services.contributions.planner import plan_monthly_contribution

router = APIRouter(prefix="/contributions", tags=["Contributions"],
                   dependencies=[Depends(get_current_user_id), Depends(require_contributions)])


@router.post("/recommendation", response_model=ContributionRecommendationResponse,
             summary="Explore the largest eligible target gap",
             description="Calculate a target-alignment scenario from user-selected inputs. Products are catalog options, not instructions. Nothing is traded or saved.")
def contribution_recommendation(request: ContributionAPIRequest):
    try:
        result = recommend_next_contribution(request.to_domain())
    except ValueError:
        raise HTTPException(400, "These inputs could not produce a contribution recommendation.") from None
    return recommendation_response(result)


@router.post("/plan", response_model=ContributionPlanResponse,
             summary="Explore a monthly contribution scenario",
             description="Calculate target alignment with minimum-checked, unverified, waiting and reserve amounts. Nothing is invested or persisted.")
def contribution_plan(request: ContributionAPIRequest):
    try:
        result = plan_monthly_contribution(request.to_domain())
    except ValueError:
        raise HTTPException(400, "These inputs could not produce a contribution plan.") from None
    return plan_response(result)
