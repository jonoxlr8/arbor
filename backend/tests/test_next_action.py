from copy import deepcopy

import pytest

from test_profile_v2 import harness, BASE, HEADERS, LEGACY
from test_profile_edit_v2 import setup, edit, SAVE
from app.schemas.profile_v2 import ProfileV2Create
from app.services.profile_v2 import profile_v2_row, restore_profile_v2
from app.services.next_action import get_next_action
from app.services.arbor.v2_explanations import explain_v2


@pytest.mark.parametrize("debt", ["none", "paying_down", "difficult_to_manage"])
@pytest.mark.parametrize("choice", [None, "Conservative", "Balanced", "Growth", "Aggressive"])
@pytest.mark.parametrize("short", [False, True])
def test_one_deterministic_action_with_priority(debt, choice, short):
    values = {**BASE, "high_interest_debt":debt, "selected_approach":choice}
    if short:
        values.update(horizon="less_than_3_years", selected_approach="short_term" if choice else None)
    saved = restore_profile_v2(profile_v2_row(ProfileV2Create(**values), "A"))
    before = deepcopy(saved)
    action = get_next_action(saved)
    expected = ("financial_foundation" if debt == "difficult_to_manage" else
                "review_short_term_path" if short else
                "review_historical_plan" if choice is None else "review_monthly_contribution")
    assert action.key == expected
    assert get_next_action(saved) == action
    assert saved == before
    public = action.model_dump_json().lower()
    for forbidden in ["buy", "sell", "gotrade", "coins.ph", "switch to", "recommended", " vt", "bitcoin"]:
        assert forbidden not in public
    reply = explain_v2("What should I do next?", saved)
    assert reply.intent == "next_action"
    assert action.title in reply.reply and action.explanation in reply.reply
    assert explain_v2("What should I buy next?", saved).intent != "next_action"


def test_missing_and_malformed_are_distinct():
    assert get_next_action(None).key == "complete_profile"
    with pytest.raises((KeyError, ValueError)):
        get_next_action({"strategy_engine_version":"2.0"})


def test_endpoint_owner_only_ignores_client_state_and_does_not_write(harness):
    client, state = harness
    setup(client, state, high_interest_debt="difficult_to_manage")
    before = deepcopy(state["rows"])
    response = client.get("/v2/next-action?user_id=B&readiness=ready&selected_approach=Growth", headers=HEADERS)
    assert response.status_code == 200
    assert response.json()["key"] == "financial_foundation"
    assert state["rows"] == before
    state["user"] = "B"
    assert client.get("/v2/next-action", headers=HEADERS).json()["key"] == "complete_profile"
    assert client.get("/v2/next-action").status_code == 401


def test_invalid_and_v1_do_not_fabricate_v2_action(harness):
    client, state = harness
    state["rows"]["A"] = deepcopy(LEGACY)
    assert client.get("/v2/next-action", headers=HEADERS).status_code == 409
    setup(client,state)
    state["rows"]["A"]["v2_inputs"]["horizon"] = "broken"
    assert client.get("/v2/next-action", headers=HEADERS).status_code == 503


def test_save_recomputes_short_dormant_foundation_and_restored_action(harness):
    client,state = harness
    saved=setup(client,state)
    for updates,expected in [
        ({"horizon":"less_than_3_years"},"review_short_term_path"),
        ({"high_interest_debt":"difficult_to_manage"},"financial_foundation"),
        ({"horizon":"ten_plus_years","high_interest_debt":"none"},"review_monthly_contribution"),
    ]:
        response=client.put(SAVE,json=edit(saved,**updates),headers=HEADERS)
        assert response.status_code == 200
        saved=response.json()
        assert saved["profile"]["selected_approach"] == "Growth"
        assert client.get("/v2/next-action",headers=HEADERS).json()["key"] == expected
    changed=client.put(SAVE,json=edit(saved,"Balanced"),headers=HEADERS).json()
    assert changed["plan"]["selected_strategy"] == "Balanced"
    assert client.get("/v2/next-action",headers=HEADERS).json() == get_next_action(changed).model_dump()
