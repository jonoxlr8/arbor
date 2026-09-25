"""Persistence mapping and numeric API presentation, not new financial rules."""
from app.schemas.profile_v2 import (
    ProfileV2Create, ProfileV2Data, ProfilePlanState, ProfileV2Response, LongTermPlanDTO, ShortTermPlanDTO,
)
import hashlib
import json
from uuid import uuid4
from app.services.portfolio_plan_v2 import build_portfolio_plan
from app.services.strategy_v2 import StrategyType, SavedPreferences, get_base_strategy
from app.services.preferences_v2 import apply_preferences
from app.services.readiness_v2 import evaluate_readiness
from app.services.strategy_selection_v2 import select_strategy
from app.services.strategy_v2 import INFLATION_ANNUAL_RATE
from app.services.plan_customization import PlanCustomization, explicit_target

V2_ANSWER_FIELDS = ("emergency_savings", "high_interest_debt", "horizon", "risk_response")
SHARED_FIELDS = ("full_name", "country", "currency", "goal_target",
                 "current_portfolio_value", "monthly_investment")


def profile_v2_row(profile: ProfileV2Data, user_id: str) -> dict:
    data = profile.model_dump(mode="json")
    inputs = {key: data[key] for key in V2_ANSWER_FIELDS}
    if "saved_preferences" in profile.model_fields_set:
        inputs["saved_preferences"] = data["saved_preferences"]
    if profile.selected_approach is not None:
        inputs["selected_approach"] = data["selected_approach"]
    if profile.explicit_customization is not None:
        inputs["explicit_customization"] = data["explicit_customization"]
        target = explicit_target(profile.selected_approach, profile.explicit_customization)
        inputs["plan_state"] = ProfilePlanState(revision_nonce=uuid4().hex,
            explicit_target=target, customization_provenance="user_selected").model_dump(mode="json", exclude_computed_fields=True)
    if profile.implementation_choices or "implementation_choices" in profile.model_fields_set:
        inputs["implementation_choices"] = data["implementation_choices"]
    return {"user_id": user_id, "strategy_engine_version": "2.0",
            **{key: data[key] for key in SHARED_FIELDS},
            "v2_inputs": inputs,
            # Do not store fake legacy classifications or numeric horizon years.
            "risk_tolerance": None, "risk_score": None, "risk_level": None,
            "investment_horizon": None}


def restore_profile_v2(row: dict) -> dict:
    inputs = row.get("v2_inputs")
    if (not isinstance(inputs, dict) or not set(V2_ANSWER_FIELDS).issubset(inputs)
            or set(inputs) - set(V2_ANSWER_FIELDS) - {"saved_preferences", "selected_approach", "plan_state",
                                                    "explicit_customization", "implementation_choices"}
            or ("selected_approach" in inputs and inputs["selected_approach"] is None)):
        raise ValueError("Invalid saved v2 input shape")
    state = ProfilePlanState.model_validate(inputs["plan_state"]) if "plan_state" in inputs else None
    profile = (ProfileV2Data if state else ProfileV2Create).model_validate({
        "strategy_engine_version": row["strategy_engine_version"],
        **{key: row[key] for key in SHARED_FIELDS},
        **{k:v for k,v in inputs.items() if k != "plan_state"},
    })
    customized = (explicit_target(profile.selected_approach, profile.explicit_customization)
                  if profile.explicit_customization is not None else None)
    # Do not trust a final allocation written directly to the profile JSON. It
    # must agree with the backend calculation from the explicit saved choices.
    if customized is not None:
        if state is None or state.explicit_target != customized or state.customization_provenance != "user_selected":
            raise ValueError("Saved customization does not match its canonical final allocation")
    elif state is not None and (state.explicit_target is not None or state.customization_provenance is not None):
        raise ValueError("Saved final allocation has no explicit choices")
    customization = (PlanCustomization(**profile.explicit_customization.model_dump())
                     if profile.explicit_customization is not None else None)
    revision = hashlib.sha256(json.dumps({"profile":profile.model_dump(mode="json"),
        "state":state.model_dump(mode="json") if state else None}, sort_keys=True).encode()).hexdigest()
    def response(plan):
        return ProfileV2Response(profile=profile, plan=plan, revision=revision,
            historical_plan=state.historical_plan if state else None).model_dump(mode="json")

    if state:
        selection = select_strategy(profile.risk_response, profile.horizon)
        readiness = evaluate_readiness(profile.emergency_savings, profile.high_interest_debt)
        common = dict(selection=selection, readiness=readiness,
                      inflation_pct=float(INFLATION_ANNUAL_RATE * 100))
        if profile.selected_approach is not None:
            chosen = None if profile.selected_approach == "short_term" else StrategyType(profile.selected_approach)
            short = selection.is_short_term or chosen is None
            common.update(plan_basis="user_selected", preference_result=apply_preferences(
                None if short else chosen, readiness, SavedPreferences()), customization=customization,
                final_allocation=list(customized.allocation.weights) if customized and not short else None)
            if short:
                return response(ShortTermPlanDTO(**common, dormant_selected_approach=chosen))
            definition = get_base_strategy(chosen)
            return response(LongTermPlanDTO(**common, selected_strategy=chosen,
                base_allocation=list(definition.allocation.weights),
                planning_return_pct=float(definition.planning_annual_rate * 100)))
        snapshot = state.historical_plan
        if snapshot is None:
            raise ValueError("Historical edit requires a preserved plan")
        # Snapshot values are server-saved, not recomputed from edited risk/preferences.
        if selection.is_short_term:
            return response(ShortTermPlanDTO(**common, historical_allocation_preserved=True,
                preference_result=apply_preferences(None, readiness, profile.saved_preferences)))
        return response(snapshot.model_copy(update={"selection":selection, "readiness":readiness,
            "historical_allocation_preserved":True}))
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
        return response(plan)
    if domain.path == "short_term":
        plan = ShortTermPlanDTO(**common)
    else:
        plan = LongTermPlanDTO(
            **common, selected_strategy=domain.selected_strategy,
            planning_return_pct=float(domain.planning_annual_rate * 100),
            base_allocation=[{"role": item.role.value, "percentage_points": item.percentage_points}
                             for item in domain.base_allocation.weights],
        )
    return response(plan)
