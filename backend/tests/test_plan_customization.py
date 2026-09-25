"""Explicit choices never reinterpret historical preferences or change core models."""
from copy import deepcopy
from decimal import localcontext
from itertools import product

import pytest
from pydantic import ValidationError

from app.schemas.profile_v2 import ProfileV2Create
from app.services.arbor.v2_context import build_v2_context
from app.services.plan_customization import (
    ExplicitCustomization, canonical_target, customize_allocation, explicit_target,
)
from app.services.profile_v2 import profile_v2_row, restore_profile_v2
from app.services.strategy_v2 import Allocation, AssetRole, RoleWeight, StrategyType, get_base_strategy
from test_profile_v2 import BASE, HEADERS, harness
from test_profile_edit_v2 import edit

CHOICES = list(product((0, 5, 10), repeat=2))


def payload(tech=10, bitcoin=10, **updates):
    return {**BASE, "selected_approach": "Aggressive",
            "explicit_customization": {"technology_tilt": tech, "bitcoin": bitcoin}, **updates}


def weights(value):
    return {row["role"]: row["percentage_points"] for row in value["plan"]["final_allocation"]}


@pytest.mark.parametrize("strategy", list(StrategyType))
@pytest.mark.parametrize("tech,bitcoin", CHOICES)
def test_every_explicit_combination_is_exact_ge_funded_and_core_unchanged(strategy, tech, bitcoin):
    base = get_base_strategy(strategy)
    before = base.model_dump()
    with localcontext() as context:
        context.prec = 2  # Caller precision does not change the canonical result.
        target = explicit_target(strategy, ExplicitCustomization(technology_tilt=tech, bitcoin=bitcoin))
    result = target.allocation
    assert result.weight(AssetRole.GLOBAL_EQUITY) == base.allocation.weight(AssetRole.GLOBAL_EQUITY) - tech - bitcoin
    assert result.weight(AssetRole.DEFENSIVE) == base.allocation.weight(AssetRole.DEFENSIVE)
    assert result.weight(AssetRole.TECHNOLOGY_TILT) == tech
    assert result.weight(AssetRole.CRYPTO) == bitcoin
    assert sum(row.percentage_points for row in result.weights) == 100
    assert all(row.percentage_points >= 0 for row in result.weights)
    assert get_base_strategy(strategy).model_dump() == before
    assert target.planning_annual_rate == base.planning_annual_rate


@pytest.mark.parametrize("invalid", [
    {"technology_tilt": 15, "bitcoin": 10}, {"technology_tilt": 10, "bitcoin": 11},
    {"technology_tilt": True, "bitcoin": 0}, {"technology_tilt": "5", "bitcoin": 0},
    {"technology_tilt": 5.0, "bitcoin": 0}, {"technology_tilt": -5, "bitcoin": 0},
    {"technology_tilt": 1, "bitcoin": 0}, {"technology_tilt": 0, "bitcoin": 0, "provenance": "user_selected"},
    {"technology_tilt": 0}, {}, None,
])
def test_invalid_choices_and_client_provenance_rejected(invalid):
    with pytest.raises(ValidationError):
        ExplicitCustomization.model_validate(invalid)


def test_allocator_rejects_insufficient_equity_and_bypassed_invalid_choices():
    small_equity = Allocation(weights=(RoleWeight(role="global_equity", percentage_points=10),
                                     RoleWeight(role="defensive", percentage_points=90)))
    with pytest.raises(ValueError, match="available Global Equity"):
        customize_allocation(small_equity, ExplicitCustomization(technology_tilt=10, bitcoin=10))
    with pytest.raises(ValueError):
        customize_allocation(get_base_strategy("Aggressive").allocation,
            ExplicitCustomization.model_construct(technology_tilt=15, bitcoin=10))


@pytest.mark.parametrize("tech,bitcoin", CHOICES)
def test_preview_create_reload_final_targets_and_provenance(harness, tech, bitcoin):
    client, state = harness
    data = payload(tech, bitcoin)
    preview = client.post("/v2/plan-preview", json=data, headers=HEADERS)
    assert preview.status_code == 200, preview.text
    assert state["rows"] == {} and state["inserts"] == 0 and state["tables"] == []
    result = client.post("/v2/profiles", json=data, headers=HEADERS)
    assert result.status_code == 200, result.text
    saved = result.json()
    assert saved["plan"] == preview.json()["plan"]
    assert saved == client.get("/profiles/me", headers=HEADERS).json()
    assert weights(saved) == {"global_equity": 100-tech-bitcoin, "defensive": 0,
                              "technology_tilt": tech, "crypto": bitcoin}
    assert saved["plan"]["base_allocation"] == [{"role":"global_equity","percentage_points":100},
                                                 {"role":"defensive","percentage_points":0}]
    assert saved["plan"]["customization"] == {**data["explicit_customization"], "provenance":"user_selected"}
    assert state["rows"]["A"]["v2_inputs"]["plan_state"]["explicit_target"]["allocation"]["weights"] == saved["plan"]["final_allocation"]
    assert state["rows"]["A"]["v2_inputs"]["plan_state"]["customization_provenance"] == "user_selected"
    context = build_v2_context(saved)
    assert context.target == canonical_target(saved["plan"])
    assert context.explicit_customization == (tech, bitcoin)
    assert context.target.weight(AssetRole.CRYPTO) == bitcoin
    # A retry cannot apply different choices to an existing saved profile.
    retry = client.post("/v2/profiles", json=payload(0, 0), headers=HEADERS).json()
    assert retry["plan"] == saved["plan"] and state["inserts"] == 1


@pytest.mark.parametrize("path", ["/v2/profiles", "/v2/plan-preview"])
@pytest.mark.parametrize("injected", [
    {"user_id":"B"}, {"final_allocation":[]}, {"plan_state":{}},
    {"explicit_customization":{"technology_tilt":10,"bitcoin":20}},
    {"explicit_customization":{"technology_tilt":10,"bitcoin":10,"provenance":"user_selected"}},
])
def test_request_security_precedes_persistence(harness, path, injected):
    client, state = harness
    assert client.post(path, json={**payload(), **injected}, headers=HEADERS).status_code == 422
    assert state["rows"] == {} and state["inserts"] == 0


def test_preview_requires_explicit_approach_and_auth(harness):
    client, state = harness
    data = {k: v for k, v in BASE.items() if k != "selected_approach"}
    assert client.post("/v2/plan-preview", json=data, headers=HEADERS).status_code == 422
    # The harness replaces auth; the real dependency is covered on an isolated router.
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.routes import profiles
    app = FastAPI()
    app.include_router(profiles.router)
    assert TestClient(app).post("/v2/plan-preview", json=payload()).status_code == 401
    assert state["rows"] == {}


def test_edit_preview_cancel_keep_then_explicit_none_restores_core(harness):
    client, state = harness
    saved = client.post("/v2/profiles", json=payload(), headers=HEADERS).json()
    before = deepcopy(state["rows"])
    body = {**edit(saved, "Growth"), "explicit_customization":{"technology_tilt":5,"bitcoin":5}}
    preview = client.post("/v2/profiles/preview", json=body, headers=HEADERS).json()["proposed"]
    assert weights(preview) == {"global_equity":70,"defensive":20,"technology_tilt":5,"crypto":5}
    assert state["rows"] == before  # Cancel has nothing to undo.
    kept = client.put("/v2/profiles/me", json=edit(saved, monthly_investment=10000), headers=HEADERS).json()
    assert kept["plan"]["final_allocation"] == saved["plan"]["final_allocation"]
    result = client.put("/v2/profiles/me", json={**edit(kept,"Growth"),
        "explicit_customization":{"technology_tilt":0,"bitcoin":0}}, headers=HEADERS).json()
    assert weights(result) == {"global_equity":80,"defensive":20,"technology_tilt":0,"crypto":0}
    assert result["plan"]["customization"]["provenance"] == "user_selected"
    assert client.put("/v2/profiles/me", json=body, headers=HEADERS).status_code == 409


def test_historical_requests_effective_snapshot_not_reinterpreted(harness):
    client, state = harness
    old = {k:v for k,v in BASE.items() if k != "selected_approach"}
    old["saved_preferences"] = {"technology_tilt":20,"bitcoin":20}
    state["rows"]["A"] = profile_v2_row(ProfileV2Create(**old), "A")
    saved = client.get("/profiles/me", headers=HEADERS).json()
    assert saved["plan"]["customization"] is saved["plan"]["final_allocation"] is None
    retained = client.put("/v2/profiles/me", json=edit(saved, monthly_investment=10000), headers=HEADERS).json()
    assert retained["plan"]["preference_result"] == saved["plan"]["preference_result"]
    assert retained["profile"]["explicit_customization"] is None
    chosen = client.put("/v2/profiles/me", json={**edit(retained,"Aggressive"),
        "explicit_customization":{"technology_tilt":10,"bitcoin":10}}, headers=HEADERS).json()
    assert chosen["historical_plan"] == saved["plan"]
    assert chosen["profile"]["saved_preferences"] == old["saved_preferences"]
    assert chosen["plan"]["preference_result"]["bitcoin"]["effective_percentage_points"] == 0
    assert build_v2_context(chosen).target.weight("crypto") == 10


def test_read_does_not_upgrade_existing_core_plan(harness):
    client, state = harness
    state["rows"]["A"] = profile_v2_row(ProfileV2Create(**{**BASE,"selected_approach":"Aggressive",
        "saved_preferences":{"technology_tilt":20,"bitcoin":20}}), "A")
    before = deepcopy(state["rows"])
    saved = client.get("/profiles/me", headers=HEADERS).json()
    assert saved["profile"]["explicit_customization"] is None
    assert saved["plan"]["customization"] is saved["plan"]["final_allocation"] is None
    assert build_v2_context(saved).target.weight("global_equity") == 100
    assert state["rows"] == before


def test_readiness_pauses_action_not_explicit_choice_and_short_horizon_dormancy(harness):
    client, _ = harness
    saved = client.post("/v2/profiles", json=payload(), headers=HEADERS).json()
    foundation = client.put("/v2/profiles/me", json=edit(saved, high_interest_debt="difficult_to_manage"), headers=HEADERS).json()
    assert foundation["plan"]["final_allocation"] == saved["plan"]["final_allocation"]
    assert build_v2_context(foundation).contributions_allowed is False
    paused = client.put("/v2/profiles/me", json=edit(foundation,horizon="less_than_3_years"), headers=HEADERS).json()
    assert paused["plan"]["final_allocation"] is None and paused["plan"]["path"] == "short_term"
    assert paused["profile"]["explicit_customization"] == saved["profile"]["explicit_customization"]
    restored = client.put("/v2/profiles/me", json=edit(paused,horizon="ten_plus_years"), headers=HEADERS).json()
    assert restored["plan"]["final_allocation"] == saved["plan"]["final_allocation"]


@pytest.mark.parametrize("tamper", ["target", "missing_choices", "missing_snapshot", "source", "missing_provenance"])
def test_corrupt_saved_customization_is_not_silently_trusted(tamper):
    row = profile_v2_row(ProfileV2Create(**payload()), "A")
    if tamper == "target":
        weights = row["v2_inputs"]["plan_state"]["explicit_target"]["allocation"]["weights"]
        weights[0]["percentage_points"] += 5
        weights[2]["percentage_points"] -= 5
    elif tamper == "missing_choices": row["v2_inputs"].pop("explicit_customization")
    elif tamper == "missing_snapshot": row["v2_inputs"]["plan_state"].pop("explicit_target")
    elif tamper == "missing_provenance": row["v2_inputs"]["plan_state"].pop("customization_provenance")
    else: row["v2_inputs"]["explicit_customization"]["provenance"] = "user_selected"
    with pytest.raises(ValueError): restore_profile_v2(row)


def test_edit_owner_isolation_and_null_reset_rejected(harness):
    client, state = harness
    saved = client.post("/v2/profiles", json=payload(), headers=HEADERS).json()
    before = deepcopy(state["rows"])
    body = {**edit(saved), "explicit_customization":None}
    assert client.put("/v2/profiles/me", json=body, headers=HEADERS).status_code == 422
    state["user"] = "B"
    assert client.put("/v2/profiles/me", json=edit(saved), headers=HEADERS).status_code == 404
    assert state["rows"] == before


def test_implementation_choices_preserved_with_profile_and_target_change(harness):
    client, _ = harness
    choices = {"global_equity":"gotrade_vt","technology_tilt":"gcash_technology","crypto":"pdax_btc"}
    saved = client.post("/v2/profiles", json=payload(implementation_choices=choices), headers=HEADERS).json()
    assert saved["profile"]["implementation_choices"] == choices
    result = client.put("/v2/profiles/me", json={**edit(saved,"Growth"),
        "explicit_customization":{"technology_tilt":0,"bitcoin":0}}, headers=HEADERS).json()
    assert result["profile"]["implementation_choices"] == choices
    assert build_v2_context(result).implementation_choices == choices


@pytest.mark.parametrize("choices", [{"crypto":"gotrade_vt"}, {"global_equity":"arbitrary"},
    {"other":"gotrade_vt"}, {"global_equity":"ibkr_vwra"}])
def test_bad_implementation_identity_rejected(harness, choices):
    client, state = harness
    assert client.post("/v2/profiles", json=payload(implementation_choices=choices), headers=HEADERS).status_code == 422
    assert state["rows"] == {}
