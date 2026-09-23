from copy import deepcopy

import pytest

from test_profile_v2 import harness, BASE, HEADERS, LEGACY
from app.schemas.profile_v2 import ProfileV2Answers, ProfileV2Create
from app.services.profile_v2 import profile_v2_row
from app.services.arbor.v2_context import build_v2_context
from app.services.arbor.v2_explanations import explain_v2
from app.services.strategy_v2 import get_base_strategy

PREVIEW = "/v2/profiles/preview"
SAVE = "/v2/profiles/me"


def setup(client, state, historical=False, **updates):
    data = {**BASE, **updates}
    if historical: data.pop("selected_approach", None)
    state["rows"]["A"] = profile_v2_row(ProfileV2Create(**data), "A")
    return client.get("/profiles/me", headers=HEADERS).json()


def edit(saved, approach=None, **updates):
    return {"inputs":{**{k:saved["profile"][k] for k in ProfileV2Answers.model_fields}, **updates},
            "expected_revision":saved["revision"], "proposed_approach":approach}


def test_preview_read_only_keep_plan_reassess_then_save_restore(harness):
    client, state = harness
    saved = setup(client, state)
    before = deepcopy(state["rows"])
    body = edit(saved, monthly_investment=8000, horizon="three_to_five_years", risk_response="sell_all")
    preview = client.post(PREVIEW, json=body, headers=HEADERS)
    assert preview.status_code == 200
    value = preview.json()["proposed"]
    assert state["rows"] == before
    assert value["plan"]["selected_strategy"] == "Growth"
    assert value["plan"]["selection"]["requested_strategy"] == "Conservative"
    assert value["plan"]["base_allocation"] == saved["plan"]["base_allocation"]
    result = client.put(SAVE, json=body, headers=HEADERS)
    assert result.status_code == 200
    assert result.json()["profile"] == value["profile"]
    assert result.json()["plan"] == value["plan"]
    assert client.get("/profiles/me", headers=HEADERS).json() == result.json()
    assert client.put(SAVE, json=body, headers=HEADERS).status_code == 409


@pytest.mark.parametrize("choice", ["Conservative", "Balanced", "Growth", "Aggressive"])
def test_explicit_change_uses_canonical_model_and_chat_reads_new_data(harness, choice):
    client, state = harness
    saved = setup(client, state, saved_preferences={"technology_tilt":20,"bitcoin":20})
    body = edit(saved, choice, monthly_investment=0, current_portfolio_value=0, goal_target=None)
    preview = client.post(PREVIEW, json=body, headers=HEADERS).json()["proposed"]
    assert client.get("/profiles/me", headers=HEADERS).json() == saved
    result = client.put(SAVE, json=body, headers=HEADERS).json()
    assert result["plan"] == preview["plan"]
    assert result["plan"]["base_allocation"] == get_base_strategy(choice).allocation.model_dump(mode="json")["weights"]
    assert result["profile"]["saved_preferences"] == saved["profile"]["saved_preferences"]
    assert result["plan"]["preference_result"]["bitcoin"]["effective_percentage_points"] == 0
    assert build_v2_context(client.get("/profiles/me", headers=HEADERS).json()).approach == choice


def test_horizon_pause_and_restore_dormant_choice(harness):
    client, state = harness
    saved = setup(client, state, selected_approach="Aggressive")
    body = edit(saved, horizon="less_than_3_years", risk_response="sell_all")
    proposed = client.post(PREVIEW, json=body, headers=HEADERS).json()["proposed"]
    assert proposed["profile"]["selected_approach"] == "Aggressive"
    assert proposed["plan"]["dormant_selected_approach"] == "Aggressive"
    assert proposed["plan"]["path"] == "short_term"
    assert proposed["plan"]["base_allocation"] is proposed["plan"]["preference_result"]["effective_target"] is None
    paused = client.put(SAVE, json=body, headers=HEADERS).json()
    assert "dormant" in explain_v2("Explain my plan", paused).reply
    assert "scenarios are paused" in explain_v2("What should I buy this month?", paused).reply
    assert "Preview your changes" in explain_v2("How do I change my plan?", paused).reply
    restored = client.put(SAVE, json=edit(paused, horizon="ten_plus_years"), headers=HEADERS).json()
    assert restored["plan"]["selected_strategy"] == "Aggressive"
    assert restored["plan"]["selection"]["requested_strategy"] == "Conservative"


def test_explicit_short_term_selection_not_replaced_by_long_horizon(harness):
    client, state = harness
    saved = setup(client, state, horizon="less_than_3_years", selected_approach="short_term")
    kept = client.put(SAVE, json=edit(saved, horizon="ten_plus_years"), headers=HEADERS).json()
    assert kept["plan"]["path"] == "short_term"
    chosen = client.put(SAVE, json=edit(kept, "Growth"), headers=HEADERS).json()
    assert chosen["plan"]["selected_strategy"] == "Growth"


@pytest.mark.parametrize("debt,savings,readiness", [("none","three_to_six_months","ready"),
    ("none","one_to_two_months","getting_ready"),("difficult_to_manage","three_to_six_months","foundation_first")])
def test_historical_snapshot_never_reapplies_caps(harness, debt, savings, readiness):
    client, state = harness
    saved = setup(client, state, historical=True, saved_preferences={"technology_tilt":20,"bitcoin":20})
    body = edit(saved, risk_response="sell_all", emergency_savings=savings, high_interest_debt=debt)
    result = client.put(SAVE, json=body, headers=HEADERS).json()
    assert result["historical_plan"] == saved["plan"]
    assert result["plan"]["preference_result"] == saved["plan"]["preference_result"]
    assert result["plan"]["selected_strategy"] == saved["plan"]["selected_strategy"]
    assert result["plan"]["readiness"]["readiness"] == readiness
    assert result["plan"]["readiness"]["actionable_contribution_guidance_allowed"] is (readiness!="foundation_first")
    assert result["plan"]["historical_allocation_preserved"] is True
    assert result["profile"]["selected_approach"] is None
    assert client.get("/profiles/me", headers=HEADERS).json() == result
    explicit = client.put(SAVE, json=edit(result,"Balanced"), headers=HEADERS).json()
    assert explicit["historical_plan"] == saved["plan"]
    assert explicit["profile"]["saved_preferences"] == saved["profile"]["saved_preferences"]
    assert explicit["plan"]["preference_result"]["bitcoin"]["effective_percentage_points"] == 0


def test_historical_snapshot_survives_short_term_and_return(harness):
    client, state = harness
    saved = setup(client, state, historical=True, saved_preferences={"technology_tilt":10,"bitcoin":5})
    short = client.put(SAVE,json=edit(saved,horizon="less_than_3_years"),headers=HEADERS).json()
    assert short["plan"]["path"] == "short_term"
    assert short["historical_plan"] == saved["plan"]
    long = client.put(SAVE,json=edit(short,horizon="ten_plus_years",risk_response="sell_all"),headers=HEADERS).json()
    assert long["plan"]["preference_result"] == saved["plan"]["preference_result"]


@pytest.mark.parametrize("path,method", [(PREVIEW,"post"),(SAVE,"put")])
@pytest.mark.parametrize("bad", [{"user_id":"B"},{"target":{"global_equity":47}},{"plan_state":{}},{"proposed_approach":"Ultra"}])
def test_owner_and_target_injection_rejected(harness,path,method,bad):
    client,state=harness
    saved=setup(client,state)
    before=deepcopy(state["rows"])
    assert getattr(client,method)(path,json={**edit(saved),**bad},headers=HEADERS).status_code==422
    assert state["rows"]==before


def test_no_cross_user_or_v1_edit_and_no_token(harness):
    client,state=harness
    saved=setup(client,state)
    body=edit(saved)
    state["user"]="B"
    assert client.post(PREVIEW,json=body,headers=HEADERS).status_code==404
    assert client.put(SAVE,json=body,headers=HEADERS).status_code==404
    state["rows"]["B"]=deepcopy(LEGACY)
    assert client.put(SAVE,json=body,headers=HEADERS).status_code==409
    assert client.post(PREVIEW,json=body).status_code==401
    state["user"]="A"
    assert client.get("/profiles/me",headers=HEADERS).json()==saved


@pytest.mark.parametrize("bad", [{"user_id":"B"}, {"target":{"global_equity":47}},
    {"saved_preferences":{"technology_tilt":100,"bitcoin":100}}, {"selected_approach":"Balanced"},
    {"country":"Other"}, {"monthly_investment":-1}, {"horizon":"unknown"}])
def test_editable_answers_reject_identity_targets_preferences_and_invalid_values(harness,bad):
    client,state=harness
    saved=setup(client,state)
    before=deepcopy(state["rows"])
    body=edit(saved,**bad)
    assert client.post(PREVIEW,json=body,headers=HEADERS).status_code==422
    assert client.put(SAVE,json=body,headers=HEADERS).status_code==422
    assert state["rows"]==before


def test_historical_short_path_is_not_replaced_by_new_assessment(harness):
    client,state=harness
    saved=setup(client,state,historical=True,horizon="less_than_3_years")
    result=client.put(SAVE,json=edit(saved,horizon="ten_plus_years"),headers=HEADERS).json()
    assert result["plan"]["path"]=="short_term"
    assert result["plan"]["base_allocation"] is result["plan"]["planning_return_pct"] is None
    assert result["historical_plan"]==saved["plan"]


def test_explicit_choice_retained_with_new_foundation_restriction(harness):
    client,state=harness
    saved=setup(client,state,selected_approach="Aggressive")
    result=client.put(SAVE,json=edit(saved,high_interest_debt="difficult_to_manage"),headers=HEADERS).json()
    assert result["plan"]["selected_strategy"]=="Aggressive"
    assert result["plan"]["readiness"]["actionable_contribution_guidance_allowed"] is False
    assert result["plan"]["base_allocation"]==saved["plan"]["base_allocation"]


@pytest.mark.parametrize("failure", ["before","lost","stale"])
def test_safe_failure_and_atomic_stale_write(harness,failure):
    client,state=harness
    saved=setup(client,state)
    body=edit(saved,monthly_investment=8000)
    state["failure"]=failure
    response=client.put(SAVE,json=body,headers=HEADERS)
    assert response.status_code==(409 if failure=="stale" else 503)
    assert "secret" not in response.text
    state["failure"]=None
    restored=client.get("/profiles/me",headers=HEADERS).json()
    assert restored["profile"]["monthly_investment"]==(8000 if failure=="lost" else 0)
