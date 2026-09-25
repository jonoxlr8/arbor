from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field, ConfigDict, field_validator
from app.services.ask_arbor import ask_arbor
from app.services.arbor.v2_explanations import explain_v2, classify_v2_question
from app.auth import get_current_user_id
from app.config import live_portfolio_enabled
from app.routes.profiles import get_my_profile
from app.services.entitlements import get_entitlements, subscription_explanation
from app.services.ask_usage import ask_usage, check_quota

router = APIRouter()


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str = Field(min_length=1, max_length=1000)

    @field_validator("message")
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError("Please enter a question")
        return value.strip()


@router.post("/chat")
def chat(request: ChatRequest, user_id: str = Depends(get_current_user_id), authorization: str | None = Header(default=None)):
    entitlements = get_entitlements(user_id)

    # Reuse the authenticated canonical plan path. Client-supplied plans are rejected.
    try:
        plan = get_my_profile(user_id=user_id, authorization=authorization)
    except HTTPException as exc:
        if exc.status_code == 404:
            raise HTTPException(404, "Create your Arbor plan first, then return to Ask Arbor.") from None
        raise
    check_quota(ask_usage(entitlements, authorization))
    if plan.get("strategy_engine_version") == "2.0":
        try:
            result = explain_v2(request.message, plan, entitlements).model_dump()
            intent = result["intent"]
            portfolio = None
            if intent == "monthly_plan" and "monthly_contribution_planner" in entitlements.features:
                from app.routes.monthly_plan import owner_monthly_plan
                from app.services.monthly_plan import explain_monthly_plan
                try:
                    monthly_plan = owner_monthly_plan(user_id, authorization, saved=plan)
                    result["reply"] = explain_monthly_plan(request.message, monthly_plan)
                except HTTPException as error:
                    if error.status_code not in (409, 503):
                        raise
                    result["reply"] = "I can’t calculate a complete monthly breakdown from the current data. I can’t reconstruct unsaved current-value inputs or a previous preview amount from chat. Open Invest this month on Home to review your current values and investment choices. Missing or stale values are not treated as zero."
            if intent == "actual_holdings" and not live_portfolio_enabled():
                result["reply"] = "I can explain your selected plan, but Live Portfolio is not currently available, so I don’t have canonical current holdings to compare with it. Plan targets are not actual holdings. On Home, Invest this month lets you explicitly enter current sleeve values to calculate a breakdown. These inputs do not create recorded holdings."
            if live_portfolio_enabled() and "live_portfolio" in entitlements.features and intent in ("actual_holdings", "holdings_help", "next_action", "overlap", "contribution"):
                from app.routes.live_portfolio import optional_portfolio
                from app.services.arbor.portfolio_explanation import explain_portfolio
                from app.services.next_action import get_next_action
                portfolio = optional_portfolio(user_id, authorization, plan)
                if intent == "actual_holdings":
                    result["reply"] = explain_portfolio(request.message, portfolio)
                elif intent == "holdings_help":
                    result["reply"] = "Open Portfolio → Add Investment and choose a supported investment. Funds can use the current PHP value shown in your provider app; units are optional. ETFs use shares and Bitcoin uses its amount. Editing or deleting a record changes Arbor only, not your provider account."
                elif intent == "next_action":
                    action = get_next_action(plan, entitlements, portfolio)
                    destination = "Home → Invest this month" if action.key == "review_monthly_contribution" and action.destination == "portfolio" else action.destination.replace('_', ' ')
                    result["reply"] = f"{action.title}. {action.explanation} Open {destination}."
                elif intent == "overlap":
                    result["reply"] = "Recorded product quantities do not include current fund constituents. I can explain named products, but cannot measure underlying holdings overlap from sleeve targets or units alone."
                elif portfolio is not None and portfolio.holdings:
                    result["reply"] = "On Home, Invest this month uses your recorded portfolio and available reference prices for contribution calculations. Choose implementation options yourself. Incomplete or stale values must be refreshed first. Readiness and your selected plan still control availability. I don’t select securities, calculate a separate scenario, or execute trades."
            if intent in ("next_action", "monthly_checkin"):
                from app.services.monthly_checkin import read_monthly, explain_monthly
                from app.services.next_action import get_next_action
                monthly = read_monthly(user_id, authorization, plan, entitlements)
                if intent == "monthly_checkin":
                    result["reply"] = explain_monthly(monthly)
                elif monthly is not None:
                    action = get_next_action(plan, entitlements, portfolio, monthly)
                    destination = "Home → Invest this month" if action.key == "review_monthly_contribution" and action.destination == "portfolio" else action.destination.replace('_', ' ')
                    result["reply"] = f"{action.title}. {action.explanation} Open {destination}."
        except (KeyError, ValueError, TypeError):
            raise HTTPException(503, "Your saved plan could not be loaded for this explanation. Please retry.") from None
    elif plan.get("strategy_engine_version") not in (None, "1.0"):
        raise HTTPException(409, "This plan version is not supported by Ask Arbor yet.")
    elif classify_v2_question(request.message)[1] == "plus":
        result = {"reply": subscription_explanation(entitlements), "category": "product_support", "intent": "plus"}
    else:
        result = {"reply": ask_arbor(request.message, plan)}
    if not isinstance(result.get("reply"), str) or not result["reply"].strip():
        raise HTTPException(503, "We couldn’t explain your plan. Please retry.")
    # Compute first; atomically admit only successful responses. Racing requests
    # can calculate concurrently, but at most ten are admitted per UTC month.
    usage = ask_usage(entitlements, authorization, consume=True)
    check_quota(usage)
    return {**result, **({"ask_usage": usage} if usage is not None else {})}
