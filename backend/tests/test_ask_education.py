from app.services.arbor.education import explain_education
from app.services.arbor.goal_explanation import explain_goal_progress
from app.services.arbor.v2_explanations import classify_v2_question
from app.routes import chat
from app.services.entitlements import resolve_entitlements
from test_profile_v2 import HEADERS, harness
from types import SimpleNamespace


def test_general_education_before_profile(harness):
    client, state = harness
    state["user"] = "new-owner"
    for question in ("What is an ETF?", "What is NAVPU?", "What is diversification?", "What is Bitcoin?", "Why isn't a contribution profit?"):
        response = client.post("/chat", headers=HEADERS, json={"message": question})
        assert response.status_code == 200
        assert response.json()["intent"] == "education"
        assert response.json()["reply"]
    assert state["inserts"] == 0


def test_personal_and_advice_questions_never_use_generic_education():
    for question in ("Why is my Bitcoin below target?", "Should I sell Bitcoin?", "Which provider is best for me?"):
        assert explain_education(question) is None


def test_education_is_deterministic_and_contains_no_owner_values():
    question = "What is an ETF?"
    assert explain_education(question) == explain_education(question)
    assert "actual shares" in explain_education(question)


def test_goal_progress_never_uses_incomplete_portfolio_as_complete():
    saved = {"profile": {"goal_target": "500000"}}
    complete = SimpleNamespace(known_value_php=100000, complete=True, unavailable_count=0)
    incomplete = SimpleNamespace(known_value_php=100000, complete=False, unavailable_count=1)
    assert "20.0% complete" in explain_goal_progress(saved, complete)
    assert "20.0%" not in explain_goal_progress(saved, incomplete)
    assert "Missing values are not zero" in explain_goal_progress(saved, incomplete)
    assert "haven't saved" in explain_goal_progress({"profile": {"goal_target": None}}, complete)


def test_cost_goal_and_projection_are_distinct_intents():
    assert classify_v2_question("Why is my recorded cost missing?")[1] == "recorded_cost"
    assert classify_v2_question("How far am I from my goal?")[1] == "goal_progress"
    assert classify_v2_question("What happens if I keep investing monthly?")[1] in ("monthly_plan", "projection", "contribution")
    assert classify_v2_question("What did I record this month?")[1] == "monthly_checkin"


def test_free_future_projection_payload_is_not_returned(harness, monkeypatch):
    client, state = harness
    from app.schemas.profile_v2 import ProfileV2Create
    from app.services.profile_v2 import profile_v2_row
    from test_profile_v2 import BASE
    state["user"] = "free-owner"
    state["rows"]["free-owner"] = profile_v2_row(ProfileV2Create(**BASE), "free-owner")
    monkeypatch.setattr(chat, "get_entitlements", lambda _owner: resolve_entitlements("free", "active"))
    monkeypatch.setattr(chat, "ask_usage", lambda *_args, **_kwargs: {"used": 0, "remaining": 10, "allowed": True, "period": "2026-09-01"})
    response = client.post("/chat", headers=HEADERS, json={"message": "Explain my projection"})
    assert response.status_code == 200
    assert "part of Arbor Plus" in response.json()["reply"]
    assert "planning return" not in response.json()["reply"]


def test_free_basic_value_but_not_allocation_payload(harness, monkeypatch):
    client, state = harness
    from app.schemas.profile_v2 import ProfileV2Create
    from app.services.profile_v2 import profile_v2_row
    from app.routes import live_portfolio
    from test_profile_v2 import BASE
    state["user"] = "free-owner"
    state["rows"]["free-owner"] = profile_v2_row(ProfileV2Create(**BASE), "free-owner")
    monkeypatch.setattr(chat, "get_entitlements", lambda _owner: resolve_entitlements("free", "active"))
    monkeypatch.setattr(chat, "ask_usage", lambda *_args, **_kwargs: {"used": 0, "remaining": 10, "allowed": True, "period": "2026-09-01"})
    monkeypatch.setattr(chat, "live_portfolio_enabled", lambda: True)
    monkeypatch.setattr(live_portfolio, "optional_portfolio", lambda *_args: SimpleNamespace(
        holdings=[object()], complete=True, total_value_php=5000, known_value_php=5000, unavailable_count=0))
    basic = client.post("/chat", headers=HEADERS, json={"message": "What is my portfolio worth?"})
    assert basic.status_code == 200 and "5,000.00" in basic.json()["reply"]
    deeper = client.post("/chat", headers=HEADERS, json={"message": "How does my portfolio compare with my plan?"})
    assert deeper.status_code == 200 and "part of Arbor Plus" in deeper.json()["reply"]
    assert "5,000.00" not in deeper.json()["reply"]
