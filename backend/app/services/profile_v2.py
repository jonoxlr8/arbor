"""Persistence mapping and numeric API presentation, not new financial rules."""
from app.schemas.profile_v2 import (
    ProfileV2Create, ProfileV2Response, LongTermPlanDTO, ShortTermPlanDTO,
)
from app.services.portfolio_plan_v2 import build_portfolio_plan

V2_ANSWER_FIELDS = ("emergency_savings", "high_interest_debt", "horizon", "risk_response")
SHARED_FIELDS = ("full_name", "country", "currency", "goal_target",
                 "current_portfolio_value", "monthly_investment")


def profile_v2_row(profile: ProfileV2Create, user_id: str) -> dict:
    data = profile.model_dump(mode="json")
    return {"user_id": user_id, "strategy_engine_version": "2.0",
            **{key: data[key] for key in SHARED_FIELDS},
            "v2_inputs": {key: data[key] for key in V2_ANSWER_FIELDS},
            # Do not store fake legacy classifications or numeric horizon years.
            "risk_tolerance": None, "risk_score": None, "risk_level": None,
            "investment_horizon": None}


def restore_profile_v2(row: dict) -> dict:
    if not isinstance(row.get("v2_inputs"), dict) or set(row["v2_inputs"]) != set(V2_ANSWER_FIELDS):
        raise ValueError("Invalid saved v2 input shape")
    profile = ProfileV2Create.model_validate({
        "strategy_engine_version": row["strategy_engine_version"],
        **{key: row[key] for key in SHARED_FIELDS},
        **row["v2_inputs"],
    })
    domain = build_portfolio_plan(profile.risk_response, profile.horizon,
                                  profile.emergency_savings, profile.high_interest_debt)
    common = dict(selection=domain.selection, readiness=domain.readiness,
                  inflation_pct=float(domain.inflation_annual_rate * 100))
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
