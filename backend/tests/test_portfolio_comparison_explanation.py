"""Comparison presentation consumes canonical results, never recomputes weights."""
from decimal import Decimal

import pytest

from app.services.arbor.portfolio_explanation import explain_portfolio, LABELS
from app.services.arbor.v2_explanations import classify_v2_question
from test_live_portfolio import holding, price, valued, endpoint

GENERAL = [
    "How does my portfolio compare with my targets?",
    "How does my portfolio compare to my plan?",
    "Am I aligned with my targets?",
    "How close is my portfolio to my plan?",
    "How is my portfolio allocated compared with my target?",
    "Is my portfolio aligned with the plan I chose?",
]
SPECIFIC = "How does my Technology allocation compare with my target?"


def portfolio():
    return valued([holding("gotrade_vt", "2"), holding("gotrade_vgt", "1"), holding("pdax_btc", ".001")],
                  [price("gotrade_vt", "100"), price("gotrade_vgt", "60"),
                   price("usd_php", "50"), price("btc_php", "1000000")])


@pytest.mark.parametrize("question", GENERAL + [SPECIFIC])
def test_comparison_intent(question):
    assert classify_v2_question(question) == ("investment", "actual_holdings")


@pytest.mark.parametrize("question", ["What is my plan?", "Explain my plan.", "What are my targets?", "Why did I choose Aggressive?"])
def test_ordinary_plan_questions_unchanged(question):
    assert classify_v2_question(question) == ("investment", "plan")


@pytest.mark.parametrize("question", GENERAL)
def test_general_explains_every_canonical_comparable_sleeve(question):
    result = portfolio()
    before = result.model_dump()
    text = explain_portfolio(question, result)
    for sleeve in result.sleeves:
        assert LABELS[sleeve.sleeve.value] + ":" in text
        assert f"{sleeve.current_percentage:.2f}% current allocation" in text
        assert f"{sleeve.target_percentage}% plan target" in text
        if sleeve.difference_pp:
            direction = "above" if sleeve.difference_pp > 0 else "below"
            assert f"{abs(sleeve.difference_pp):.2f} percentage points {direction} your target" in text
    assert result.model_dump() == before
    assert not any(word in text.lower() for word in ["overweight", "underweight", "rebalance", "buy ", "sell "])


def test_specific_comparison_still_selects_only_named_sleeve():
    text = explain_portfolio(SPECIFIC, portfolio())
    assert "Technology:" in text
    assert not any(label + ":" in text for label in ["Global Equity", "Defensive", "Bitcoin"])


def test_empty_incomplete_and_zero_portfolios_do_not_invent_comparisons():
    question = GENERAL[0]
    assert "before Arbor can compare" in explain_portfolio(question, valued([], []))
    partial = valued([holding(), holding("pdax_btc", ".001")], [price("btc_php", "1000000")])
    text = explain_portfolio(question, partial)
    assert "not your complete portfolio value" in text
    assert "Target comparisons are unavailable" in text
    assert "%" not in text
    zero = valued([holding("pdax_btc", ".000000000001")], [price("btc_php", "1")])
    assert "positive total value" in explain_portfolio(question, zero)
    assert "temporarily unavailable" in explain_portfolio(question, None)


def test_comparison_uses_supplied_canonical_fields_not_arithmetic():
    result = portfolio()
    # Deliberately distinguish supplied facts from anything derived in the template.
    sleeve = result.sleeves[0].model_copy(update={
        "current_percentage": Decimal("56.75369"), "target_percentage": Decimal("80"),
        "difference_pp": Decimal("-23.24631"),
    })
    result = result.model_copy(update={"sleeves": [sleeve, *result.sleeves[1:]]})
    text = explain_portfolio(GENERAL[0], result)
    assert "56.75% current allocation" in text and "23.25 percentage points below" in text


@pytest.mark.parametrize("question", GENERAL + [SPECIFIC])
def test_chat_uses_deterministic_portfolio_without_llm(endpoint, monkeypatch, question):
    from app.routes import chat, live_portfolio
    client, _ = endpoint
    result = portfolio()
    monkeypatch.setattr(live_portfolio, "optional_portfolio", lambda *args: result)
    monkeypatch.setattr(chat, "ask_arbor", lambda *args: pytest.fail("No LLM comparison arithmetic"))
    response = client.post("/chat", json={"message": question})
    assert response.status_code == 200
    assert response.json()["intent"] == "actual_holdings"
    assert response.json()["reply"] == explain_portfolio(question, result)


def test_advice_and_out_of_scope_boundaries_win():
    assert classify_v2_question(GENERAL[0] + " Should I sell Bitcoin?")[1] == "decision_boundary"
    assert classify_v2_question(GENERAL[0] + " Write python code.")[1] == "out_of_scope"
