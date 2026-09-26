"""Authenticated V2 portfolio orchestration; financial engines stay unchanged."""
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Response, Query
from app.auth import get_current_user_id
from app.config import live_portfolio_enabled
from app.routes.profiles import get_my_profile
from app.services.entitlements import require_feature
from app.services.arbor.v2_context import build_v2_context
from app.services.live_portfolio import HoldingInput, ManualValueInput, Portfolio, InvestmentEntryInput, InvestmentRevisionInput, InvestmentVoidInput, OpeningPositionCorrection, catalog, value_portfolio, current_values
from app.services.portfolio_store import PortfolioStore
from app.services.strategy_v2 import DomainModel
from app.services.implementation.models import NonNegative, BitcoinProvider
from app.services.contributions.models import ContributionRequest
from app.services.contributions.engine import recommend_next_contribution
from app.services.contributions.planner import plan_monthly_contribution
from app.schemas.contributions import plan_response, recommendation_response


def require_portfolio(user_id: str = Depends(get_current_user_id)):
    if not live_portfolio_enabled():
        raise HTTPException(404, "Live Portfolio is not currently available.")
    require_feature(user_id, "live_portfolio")


router = APIRouter(prefix="/v2/portfolio", tags=["Live Portfolio"], dependencies=[Depends(require_portfolio)])


def load_portfolio(user_id, authorization, saved=None):
    require_portfolio(user_id)
    saved = saved or get_my_profile(user_id=user_id, authorization=authorization)
    try:
        context = build_v2_context(saved)
    except (ValueError, KeyError, TypeError):
        raise HTTPException(409, "A valid saved V2 plan is required.") from None
    store = PortfolioStore(user_id, authorization)
    result = value_portfolio(store.holdings(), store, context.target)
    return result, store


def optional_portfolio(user_id, authorization, saved):
    """Missing migration/feed must not take down saved plans or basic chat."""
    if not live_portfolio_enabled():
        return None
    try:
        return load_portfolio(user_id, authorization, saved)[0]
    except HTTPException as exc:
        if exc.status_code == 503:
            return None
        raise


@router.get("")
def get_portfolio(response: Response, user_id: str = Depends(get_current_user_id), authorization: str | None = Header(default=None)):
    response.headers["Cache-Control"] = "no-store"
    portfolio, store = load_portfolio(user_id, authorization)
    # Daily snapshot capture is explicit POST, not a write hidden in GET.
    result = portfolio.model_dump(mode="json")
    metadata = store.ledger_metadata()
    for holding in result["holdings"]:
        if holding["id"] not in metadata:
            raise HTTPException(503, "Portfolio records are temporarily unavailable. Please retry.")
        holding.update(metadata[holding["id"]])
    return {**result, "catalog": catalog(), "history": store.history()}


@router.post("/holdings", status_code=201)
def create_holding(request: HoldingInput, user_id: str = Depends(get_current_user_id), authorization: str | None = Header(default=None)):
    saved = get_my_profile(user_id=user_id, authorization=authorization)
    try:
        build_v2_context(saved)
    except (KeyError, ValueError, TypeError):
        raise HTTPException(409, "A valid saved V2 plan is required.") from None
    PortfolioStore(user_id, authorization).save(request)
    return {"saved": True}


@router.put("/holdings/{holding_id}")
def update_holding(holding_id: UUID, request: HoldingInput, user_id: str = Depends(get_current_user_id), authorization: str | None = Header(default=None)):
    PortfolioStore(user_id, authorization).save(request, holding_id)
    return {"saved": True}


@router.delete("/holdings/{holding_id}")
def delete_holding(holding_id: UUID, user_id: str = Depends(get_current_user_id), authorization: str | None = Header(default=None)):
    PortfolioStore(user_id, authorization).delete(holding_id)
    return {"deleted": True}


@router.put("/holdings/{holding_id}/manual-value")
def update_manual_value(holding_id: UUID, request: ManualValueInput,
                        user_id: str = Depends(get_current_user_id), authorization: str | None = Header(default=None)):
    PortfolioStore(user_id, authorization).save_manual_value(holding_id, request)
    return {"saved": True}


@router.post("/entries", status_code=201)
def record_investment(request: InvestmentEntryInput, user_id: str = Depends(get_current_user_id),
                      authorization: str | None = Header(default=None)):
    saved = get_my_profile(user_id=user_id, authorization=authorization)
    try:
        build_v2_context(saved)
    except (KeyError, ValueError, TypeError):
        raise HTTPException(409, "A valid saved V2 plan is required.") from None
    return PortfolioStore(user_id, authorization).record_entry(request)


@router.get("/entries")
def investment_activity(holding_id: UUID | None = None, page: int = Query(default=0, ge=0, le=10000),
                        user_id: str = Depends(get_current_user_id), authorization: str | None = Header(default=None)):
    rows = PortfolioStore(user_id, authorization).activity(holding_id, page)
    return {"entries": rows, "page": page, "has_more": len(rows) == 20}


@router.put("/entries/{entry_id}")
def revise_investment(entry_id: UUID, request: InvestmentRevisionInput,
                      user_id: str = Depends(get_current_user_id), authorization: str | None = Header(default=None)):
    return PortfolioStore(user_id, authorization).revise_entry(entry_id, request, request.expected_revision, False)


@router.post("/entries/{entry_id}/void")
def void_investment(entry_id: UUID, request: InvestmentVoidInput,
                    user_id: str = Depends(get_current_user_id), authorization: str | None = Header(default=None)):
    return PortfolioStore(user_id, authorization).revise_entry(entry_id, None, request.expected_revision, True)


@router.put("/holdings/{holding_id}/opening-position")
def correct_opening_position(holding_id: UUID, request: OpeningPositionCorrection,
                             user_id: str = Depends(get_current_user_id), authorization: str | None = Header(default=None)):
    return PortfolioStore(user_id, authorization).correct_opening(holding_id, request)


@router.post("/snapshot")
def capture_snapshot(user_id: str = Depends(get_current_user_id), authorization: str | None = Header(default=None)):
    store = PortfolioStore(user_id, authorization)
    return {"recorded": store.capture(), "history": store.history()}


class PortfolioScenario(DomainModel):
    contribution_amount: NonNegative
    route_id: Literal["gcash", "dragonfi", "gotrade"]
    bitcoin_provider: BitcoinProvider | None = None


def scenario_request(request, saved, portfolio):
    context = build_v2_context(saved)
    if context.path == "short_term" or context.plan_basis != "user_selected":
        raise ValueError("Select an active long-term approach before exploring contribution scenarios")
    plan, profile = saved["plan"], saved["profile"]
    return ContributionRequest(contribution_amount=request.contribution_amount, contribution_currency="PHP",
        current_portfolio=current_values(portfolio),
        context={"route_id": request.route_id, "path": plan["path"],
                 "effective_target_allocation": plan["preference_result"]["effective_target"],
                 "readiness": plan["readiness"], "selection_mode": "explicit",
                 "bitcoin_provider": request.bitcoin_provider},
        readiness_inputs={"emergency_savings": profile["emergency_savings"], "high_interest_debt": profile["high_interest_debt"]})


@router.post("/scenarios/{mode}")
def scenario(mode: Literal["plan", "recommendation"], request: PortfolioScenario,
             user_id: str = Depends(get_current_user_id), authorization: str | None = Header(default=None)):
    require_feature(user_id, "monthly_contribution_planner")
    saved = get_my_profile(user_id=user_id, authorization=authorization)
    portfolio, _ = load_portfolio(user_id, authorization, saved)
    try:
        domain = scenario_request(request, saved, portfolio)
        result = (plan_response(plan_monthly_contribution(domain)) if mode == "plan"
                  else recommendation_response(recommend_next_contribution(domain)))
        return result.model_dump(mode="json")
    except ValueError:
        raise HTTPException(409, "Refresh your complete portfolio and review your selected plan before calculating a scenario.") from None
