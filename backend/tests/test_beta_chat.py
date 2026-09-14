import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.auth import get_current_user_id
from app.routes import chat
from app.services.ask_arbor import ask_arbor
from app.services.intent_detector import detect_beta_intent


def plan(value=1500000):
    return {"profile": {"currency":"PHP", "risk_level":"Aggressive", "risk_tolerance":"Aggressive", "goal_target":2000000},
            "portfolio": [{"ticker":"VOO", "asset_name":"VOO", "allocation":50}, {"ticker":"QQQM", "asset_name":"QQQM", "allocation":50}],
            "projection": {"investment_period_years":5, "projected_value":value, "required_monthly_investment":1000,
                           "assumed_return":.08, "yearly_projection":[{"year":5,"value":value}]}}


@pytest.mark.parametrize("question", ["How do Philippine taxes work?", "What is VOO's live price?", "Should I buy VOO?", "Should I sell QQQM?", "Which broker offers VOO?", "Tell me a joke", "What are my actual allocations?"])
def test_unsupported_questions_have_explicit_boundary(question):
    assert "does not provide" in ask_arbor(question, plan())


def test_greeting_is_a_whole_phrase():
    assert detect_beta_intent("Hi!") == "greeting"
    assert detect_beta_intent("How do Philippine taxes work?") == "unsupported"
    from app.services.intent_detector import detect_intent
    assert not detect_intent("How do Philippine taxes work?")["greeting"]


def test_ownership_is_target_not_ownership_or_asset_risk():
    response = ask_arbor("Why do I own VOO?", plan())
    assert "Why VOO is in your Arbor plan" in response
    assert "investor risk category is Aggressive" in response
    assert "actually own" in response
    assert "Medium" not in response


def test_health_does_not_use_separate_score(monkeypatch):
    from app.services.arbor.health_score import PortfolioHealthScore
    monkeypatch.setattr(PortfolioHealthScore, "score", lambda self: pytest.fail("No chat Health scoring"))
    assert "dashboard" in ask_arbor("How healthy is my portfolio?", plan())


@pytest.mark.parametrize("value,conclusion", [(1500000, "This reaches"), (900000, "This does not reach")])
def test_million_uses_planning_units(value, conclusion):
    response = ask_arbor("Will I be a millionaire?", plan(value))
    assert conclusion in response
    assert f"PHP {value:,.2f}" in response
    assert "planning currency" in response


def test_saved_year_only_no_recalculation():
    assert "PHP 1,500,000.00" in ask_arbor("What is my projection in 5 years?", plan())
    assert "no saved value for year 10" in ask_arbor("What will I have in 10 years?", plan())


def test_projection_uses_canonical_value_without_recomputing():
    response = ask_arbor("Explain my projection assumptions", plan(1234567.89))
    assert "PHP 1,234,567.89" in response
    assert "8% assumed nominal annual return" in response


def test_unknown_health_assets_have_knowledge_warning_without_score_change():
    from app.services.health_engine import calculate_health_score
    result = calculate_health_score({"profile":{"risk_level":"Balanced"},
        "portfolio":[{"ticker":f"UNKNOWN{i}", "allocation":20} for i in range(5)]})
    assert result["score"] == 7
    assert "Diversified portfolio" not in result["strengths"]
    assert any("not recognized" in warning for warning in result["warnings"])


def test_overlap_order_is_symmetric_and_static():
    a = ask_arbor("Do VOO and QQQM overlap?", plan())
    b = ask_arbor("Do QQQM and VOO overlap?", plan())
    assert a == b
    assert "VOO provides broader" in a
    assert "static, qualitative" in a
    assert "not actual ownership" in a


def client(monkeypatch, authenticated=True):
    app = FastAPI()
    app.include_router(chat.router)
    if authenticated:
        app.dependency_overrides[get_current_user_id] = lambda: "owner"
    def load(user_id, authorization):
        assert user_id == "owner"
        return plan()
    monkeypatch.setattr(chat, "get_my_profile", load)
    return TestClient(app)


def test_chat_requires_authentication(monkeypatch):
    assert client(monkeypatch, False).post("/chat", json={"message":"Hi"}).status_code == 401


@pytest.mark.parametrize("body", [{"message":"x"*1001}, {"message":" "}, {"message":"Hi", "plan":{}}, {"message":"Hi", "plan":"invalid"}])
def test_chat_rejects_oversized_or_client_plan_input(monkeypatch, body):
    assert client(monkeypatch).post("/chat", json=body).status_code == 422


def test_chat_uses_authenticated_canonical_plan(monkeypatch):
    response = client(monkeypatch).post("/chat", json={"message":"What are my targets?"})
    assert response.status_code == 200
    assert "VOO: 50% target" in response.json()["reply"]


@pytest.mark.parametrize("question", [
    "How much should I invest monthly?",
    "How much do I need to contribute each month?",
    "What is my required monthly investment?",
])
def test_monthly_phrases_use_saved_requirement(question):
    response = ask_arbor(question, plan())
    assert "required monthly contribution is PHP 1,000.00" in response
    assert "afford" in response


@pytest.mark.parametrize("question", [
    "What percentage should I have in BTC?", "What is my BTC allocation?",
    "What is my target allocation for BTC?",
])
def test_target_phrases_precede_asset_explanations(question):
    fixture = plan()
    fixture["portfolio"] = [{"ticker": "BTC", "asset_name": "Bitcoin", "allocation": 15}, {"ticker": "VOO", "asset_name": "Vanguard", "allocation": 85}]
    response = ask_arbor(question, fixture)
    assert "BTC: 15% target" in response
    assert "do not establish what you own" in response
    assert "VOO: 85%" not in response


@pytest.mark.parametrize("question", ["What is my projected value?", "How much will my portfolio be worth?", "Will I reach my goal?", "Will I reach 1 million?"])
def test_projection_natural_variants(question):
    response = ask_arbor(question, plan())
    assert "PHP 1,500,000.00" in response
    assert "Illustration only" in response


def test_after_year_phrase_uses_only_saved_points():
    question = "What will I have after 15 years?"
    fixture = plan()
    assert "no saved value for year 15" in ask_arbor(question, fixture)
    fixture["projection"]["investment_period_years"] = 15
    fixture["projection"]["yearly_projection"].append({"year": 15, "value": 2345678})
    assert "PHP 2,345,678.00" in ask_arbor(question, fixture)


@pytest.mark.parametrize("question", ["What is my BTC allocation at today's price?", "How much should I invest monthly to avoid taxes?", "Should I buy BTC each month?"])
def test_unsupported_topics_still_win_over_natural_plan_phrases(question):
    assert "does not provide" in ask_arbor(question, plan())
