from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field, ConfigDict, field_validator
from app.services.ask_arbor import ask_arbor
from app.services.arbor.v2_explanations import explain_v2, classify_v2_question
from app.auth import get_current_user_id
from app.config import live_portfolio_enabled
from app.routes.profiles import get_my_profile
from app.services.entitlements import get_entitlements, subscription_explanation
from app.services.ask_usage import ask_usage, check_quota
from app.services.arbor.education import explain_education

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

    # General education is available before onboarding. No owner data is read,
    # and successful answers alone enter the existing (currently non-public) meter.
    education = explain_education(request.message)
    if education is not None:
        check_quota(ask_usage(entitlements, authorization))
        usage = ask_usage(entitlements, authorization, consume=True)
        check_quota(usage)
        return {"reply": education, "category": "investment", "intent": "education",
                **({"ask_usage": usage} if usage is not None else {})}

    # Reuse the authenticated canonical plan path. Client-supplied plans are rejected.
    try:
        plan = get_my_profile(user_id=user_id, authorization=authorization)
    except HTTPException as exc:
        if exc.status_code == 404:
            raise HTTPException(404, "Create your Arbor plan first, then return to Ask Arbor.") from None
        raise
    if plan.get("strategy_engine_version") == "2.0":
        try:
            result = explain_v2(request.message, plan, entitlements).model_dump()
            intent = result["intent"]
            portfolio = None
            basic_worth = request.message.casefold().strip(" ?.!") in ("what is my portfolio worth", "what is my current portfolio worth", "how much is my portfolio worth")
            if intent == "actual_holdings" and "ask_arbor_full" not in entitlements.features and not basic_worth:
                result["reply"] = ("Your recorded holdings and current value are available in Portfolio. "
                                   "Portfolio allocation and comparisons with your targets are part of Arbor Plus.")
            if intent == "monthly_checkin" and "monthly_contribution_planner" not in entitlements.features:
                result["reply"] = ("Monthly check-ins and contribution planning are part of Arbor Plus. "
                                   "Your investment records remain available in Portfolio.")
            if intent == "pending_recording" and "monthly_contribution_planner" in entitlements.features:
                from app.services.pending_recordings import PendingRecordingStore
                pending = PendingRecordingStore(user_id, authorization).list_pending()
                count = len(pending)
                result["reply"] = (f"You have {count} unfinished recording{'s' if count != 1 else ''} in Arbor. "
                                   "A pending item is not an investment. If you completed an investment, use your provider record to enter the actual units received; otherwise dismiss it. Planned PHP is not actual cost.")
            if intent == "projection" and "future_projection" not in entitlements.features:
                result["reply"] = ("Future-value projections and What If are part of Arbor Plus. "
                                   "Your basic portfolio graph and actual goal progress remain available.")
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
            portfolio_intents = ("holdings_help", "next_action", "overlap", "contribution", "goal_progress", "recorded_cost")
            if "ask_arbor_full" in entitlements.features:
                portfolio_intents += ("actual_holdings",)
            elif basic_worth:
                portfolio_intents += ("actual_holdings",)
            if live_portfolio_enabled() and "live_portfolio" in entitlements.features and intent in portfolio_intents:
                from app.routes.live_portfolio import optional_portfolio
                from app.services.arbor.portfolio_explanation import explain_portfolio
                from app.services.next_action import get_next_action
                portfolio = optional_portfolio(user_id, authorization, plan)
                if intent == "actual_holdings":
                    if basic_worth and "ask_arbor_full" not in entitlements.features:
                        if portfolio is None:
                            result["reply"] = "Your current portfolio records are temporarily unavailable. Please retry in Portfolio."
                        elif not portfolio.holdings:
                            result["reply"] = "No investments are recorded yet. Your portfolio value is PHP 0.00."
                        elif portfolio.complete:
                            result["reply"] = f"Your complete recorded portfolio value is PHP {portfolio.total_value_php:,.2f}. This is a reference valuation, not an execution quote."
                        else:
                            result["reply"] = f"Known recorded value is PHP {portfolio.known_value_php:,.2f}. {portfolio.unavailable_count} holding(s) need an updated value before I can give you a complete total. Missing values are not zero."
                    else:
                        result["reply"] = explain_portfolio(request.message, portfolio)
                elif intent == "recorded_cost":
                    result["reply"] = explain_portfolio(request.message, portfolio) if portfolio and portfolio.holdings else result["reply"]
                elif intent == "goal_progress":
                    from app.services.arbor.goal_explanation import explain_goal_progress
                    result["reply"] = explain_goal_progress(plan, portfolio)
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
            if intent == "projection" and "future_projection" in entitlements.features:
                from app.routes.profiles import preview_future_projection, FutureProjectionRequest
                try:
                    projection = preview_future_projection(FutureProjectionRequest(), user_id, authorization)
                    result["reply"] = (f"Your saved scenario illustrates PHP {projection['projected_value_php']} by {projection['target_date']}, "
                                       f"starting from your complete current recorded portfolio value of PHP {projection['starting_value_php']} "
                                       f"and your saved monthly contribution of PHP {projection['monthly_contribution_php']}. "
                                       f"It uses your selected plan's {projection['annual_planning_rate_pct']}% annual planning assumption. "
                                       "This is an illustration, not a forecast or guarantee. Changing a What If scenario does not change your saved plan.")
                except HTTPException as error:
                    if error.status_code not in (409, 422, 503):
                        raise
                    result["reply"] = "I can't show a complete future projection yet. Add an exact goal date and make sure all recorded holdings have usable values. Short-term or readiness paths may pause long-term contribution guidance. I won't substitute your old onboarding starting estimate."
            if intent in ("next_action", "monthly_checkin") and "monthly_contribution_planner" in entitlements.features:
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
    if result.get("intent") in ("out_of_scope", "decision_boundary"):
        return result
    # Compute first; atomically admit only successful responses. Racing requests
    # can calculate concurrently, but at most ten are admitted per UTC month.
    usage = ask_usage(entitlements, authorization, consume=True)
    check_quota(usage)
    return {**result, **({"ask_usage": usage} if usage is not None else {})}
