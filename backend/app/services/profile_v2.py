"""Persistence mapping and numeric API presentation, not new financial rules."""
from app.schemas.profile_v2 import (
    ProfileV2Create, ProfileV2Response, LongTermPlanDTO, ShortTermPlanDTO,
)
from app.services.portfolio_plan_v2 import build_portfolio_plan
from app.services.strategy_v2 import StrategyType, SavedPreferences, get_base_strategy
from app.services.preferences_v2 import apply_preferences

V2_ANSWER_FIELDS = ("emergency_savings", "high_interest_debt", "horizon", "risk_response")
SHARED_FIELDS = ("full_name", "country", "currency", "goal_target",
                 "current_portfolio_value", "monthly_investment")


def profile_v2_row(profile: ProfileV2Create, user_id: str) -> dict:
    data = profile.model_dump(mode="json")
    inputs = {key: data[key] for key in V2_ANSWER_FIELDS}
    if "saved_preferences" in profile.model_fields_set:
        inputs["saved_preferences"] = data["saved_preferences"]
    if profile.selected_approach is not None:
        inputs["selected_approach"] = data["selected_approach"]
    return {"user_id": user_id, "strategy_engine_version": "2.0",
            **{key: data[key] for key in SHARED_FIELDS},
            "v2_inputs": inputs,
            # Do not store fake legacy classifications or numeric horizon years.
            "risk_tolerance": None, "risk_score": None, "risk_level": None,
            "investment_horizon": None}


def restore_profile_v2(row: dict) -> dict:
    inputs = row.get("v2_inputs")
    if (not isinstance(inputs, dict) or not set(V2_ANSWER_FIELDS).issubset(inputs)
            or set(inputs) - set(V2_ANSWER_FIELDS) - {"saved_preferences", "selected_approach"}
            or ("selected_approach" in inputs and inputs["selected_approach"] is None)):
        raise ValueError("Invalid saved v2 input shape")
    profile = ProfileV2Create.model_validate({
        "strategy_engine_version": row["strategy_engine_version"],
        **{key: row[key] for key in SHARED_FIELDS},
        **row["v2_inputs"],
    })
    domain = build_portfolio_plan(profile.risk_response, profile.horizon,
                                  profile.emergency_savings, profile.high_interest_debt, profile.saved_preferences)
    common = dict(selection=domain.selection, readiness=domain.readiness,
                  inflation_pct=float(domain.inflation_annual_rate * 100),
                  preference_result=domain.preference_result)
    if profile.selected_approach is not None:
        common["plan_basis"] = "user_selected"
        chosen = None if profile.selected_approach == "short_term" else StrategyType(profile.selected_approach)
        # Assessment remains informational. Standard models never apply historical satellites.
        common["preference_result"] = apply_preferences(chosen, domain.readiness, SavedPreferences())
        if chosen is None:
            plan = ShortTermPlanDTO(**common)
        else:
            definition = get_base_strategy(chosen)
            plan = LongTermPlanDTO(**common, selected_strategy=chosen,
                planning_return_pct=float(definition.planning_annual_rate * 100),
                base_allocation=list(definition.allocation.weights))
        return ProfileV2Response(profile=profile, plan=plan).model_dump(mode="json")
    if domain.path == "short_term":
        plan = ShortTermPlanDTO(**common)
    else:
        plan = LongTermPlanDTO(
            **common, selected_strategy=domain.selected_strategy,
            planning_return_pct=float(domain.planning_annual_rate * 100),
            base_allocation=[{"role": item.role.value, "percentage_points": item.percentage_points}
                             for item in domain.base_allocation.weights],
        )
    return ProfileV2Response(profile=profile, plan=plan).model_dump(mode="json")
