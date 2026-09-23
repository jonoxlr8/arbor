"""Explicit model choice, independent assessment, and read-only legacy compatibility."""
from copy import deepcopy

import pytest

from test_profile_v2 import harness, BASE, HEADERS, LEGACY
from app.schemas.profile_v2 import ProfileV2Create
from app.services.profile_v2 import profile_v2_row, restore_profile_v2
from app.services.strategy_v2 import StrategyType, get_base_strategy


def test_new_profile_requires_explicit_choice(harness):
    client, state = harness
    for choice in [None, "invalid"]:
        assert client.post("/v2/profiles", json={**BASE, "selected_approach": choice}, headers=HEADERS).status_code == 422
    missing = {k:v for k,v in BASE.items() if k != "selected_approach"}
    assert client.post("/v2/profiles", json=missing, headers=HEADERS).status_code == 422
    assert state["inserts"] == 0


@pytest.mark.parametrize("strategy", list(StrategyType))
@pytest.mark.parametrize("debt", ["none", "paying_down", "difficult_to_manage"])
@pytest.mark.parametrize("risk", ["sell_all", "invest_more"])
def test_model_choice_is_authoritative_not_assessment_or_preferences(harness, strategy, debt, risk):
    client, state = harness
    payload = {**BASE, "selected_approach": strategy.value, "horizon": "three_to_five_years",
               "risk_response": risk, "high_interest_debt": debt,
               "saved_preferences": {"technology_tilt": 20, "bitcoin": 20}}
    response = client.post("/v2/profiles", json=payload, headers=HEADERS)
    assert response.status_code == 200
    result = response.json()
    plan = result["plan"]
    canonical = get_base_strategy(strategy)
    assert plan["plan_basis"] == "user_selected"
    assert plan["selected_strategy"] == strategy.value
    assert plan["base_allocation"] == canonical.allocation.model_dump(mode="json")["weights"]
    assert plan["planning_return_pct"] == float(canonical.planning_annual_rate * 100)
    weights = {w["role"]:w["percentage_points"] for w in plan["preference_result"]["effective_target"]["allocation"]["weights"]}
    assert weights["crypto"] == weights["technology_tilt"] == 0
    assert sum(weights.values()) == 100
    assert result["profile"]["saved_preferences"] == payload["saved_preferences"]
    assert plan["readiness"]["actionable_contribution_guidance_allowed"] is (debt != "difficult_to_manage")
    assert client.get("/profiles/me", headers=HEADERS).json() == result
    assert restore_profile_v2(deepcopy(state["rows"]["A"])) == result


def test_explore_is_canonical_equal_and_does_not_write(harness):
    client, state = harness
    for risk in ["sell_all", "invest_more"]:
        response = client.post("/v2/approaches", json={**BASE, "risk_response": risk}, headers=HEADERS)
        assert response.status_code == 200
        data = response.json()
        assert [a["strategy"] for a in data["approaches"]] == [s.value for s in StrategyType]
        for option in data["approaches"]:
            definition = get_base_strategy(StrategyType(option["strategy"]))
            assert option["allocation"] == definition.allocation.model_dump(mode="json")["weights"]
        assert "recommended" not in response.text.lower()
    assert state["rows"] == {} and state["inserts"] == 0


def test_historical_row_remains_readable_until_explicit_owner_selection(harness):
    client, state = harness
    old = {k:v for k,v in BASE.items() if k != "selected_approach"}
    old["saved_preferences"] = {"technology_tilt":10, "bitcoin":10}
    state["rows"]["A"] = profile_v2_row(ProfileV2Create(**old), "A")
    before = deepcopy(state["rows"])
    restored = client.get("/profiles/me", headers=HEADERS).json()
    assert restored["plan"]["plan_basis"] == "historical_assessment"
    assert state["rows"] == before
    state["user"] = "B"
    assert client.put("/v2/profiles/approach", json=BASE, headers=HEADERS).status_code == 404
    state["user"] = "A"
    response = client.put("/v2/profiles/approach", json={**BASE, "selected_approach":"Conservative", "monthly_investment": 999}, headers=HEADERS)
    assert response.status_code == 200
    assert response.json()["profile"]["monthly_investment"] == old["monthly_investment"]
    assert response.json()["profile"]["saved_preferences"] == old["saved_preferences"]
    assert response.json()["plan"]["selected_strategy"] == "Conservative"
    assert state["rows"]["A"] == {**before["A"], "v2_inputs": {**before["A"]["v2_inputs"], "selected_approach":"Conservative"}}
    assert client.put("/v2/profiles/approach", json={**BASE,"user_id":"B"}, headers=HEADERS).status_code == 422


def test_selection_cannot_migrate_v1(harness):
    client, state = harness
    state["rows"]["A"] = deepcopy(LEGACY)
    assert client.put("/v2/profiles/approach", json=BASE, headers=HEADERS).status_code == 409
    assert state["rows"]["A"] == LEGACY


def test_short_term_requires_explicit_path_without_long_term_model(harness):
    client, _ = harness
    payload = {**BASE, "horizon":"less_than_3_years"}
    assert client.post("/v2/profiles", json=payload, headers=HEADERS).status_code == 422
    response = client.post("/v2/profiles", json={**payload,"selected_approach":"short_term"}, headers=HEADERS)
    assert response.status_code == 200
    plan = response.json()["plan"]
    assert plan["path"] == "short_term"
    assert plan["selected_strategy"] is plan["base_allocation"] is plan["planning_return_pct"] is None
    assert plan["preference_result"]["effective_target"] is None
    assert client.put("/v2/profiles/approach", json=BASE, headers=HEADERS).status_code == 422
