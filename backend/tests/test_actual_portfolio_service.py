import pytest

from app.services.actual_portfolio_service import build_actual_portfolio


def make_holding(ticker, quantity, average_cost, currency="USD"):
    return {
        "ticker": ticker,
        "asset_name": f"{ticker} holding",
        "asset_type": "ETF",
        "quantity": quantity,
        "average_cost": average_cost,
        "currency": currency,
    }


def test_builds_cost_basis_portfolio_for_normal_holdings():
    result = build_actual_portfolio(
        [
            make_holding("VOO", quantity=2, average_cost=100),
            make_holding("QQQM", quantity=3, average_cost=50),
        ]
    )

    assert result["total_cost_basis"] == 350
    assert result["currency"] == "USD"
    assert result["unavailable_reason"] is None
    assert result["portfolio"][0]["cost_basis"] == 200
    assert result["portfolio"][1]["cost_basis"] == 150
    assert result["portfolio"][0]["ticker"] == "VOO"
    assert result["portfolio"][0]["asset_type"] == "ETF"


def test_calculates_allocations_that_sum_to_one_hundred_percent():
    result = build_actual_portfolio(
        [
            make_holding("VOO", quantity=2, average_cost=100),
            make_holding("QQQM", quantity=3, average_cost=50),
        ]
    )

    allocations = [holding["allocation"] for holding in result["portfolio"]]

    assert allocations[0] == pytest.approx(57.142857)
    assert allocations[1] == pytest.approx(42.857143)
    assert sum(allocations) == pytest.approx(100)


def test_marks_empty_holdings_as_unavailable():
    result = build_actual_portfolio([])

    assert result["portfolio"] == []
    assert result["total_cost_basis"] == 0
    assert result["currency"] is None
    assert result["unavailable_reason"] == (
        "Actual portfolio health is unavailable until holdings are added."
    )


def test_marks_zero_total_cost_basis_as_unavailable():
    result = build_actual_portfolio(
        [
            make_holding("VOO", quantity=0, average_cost=100),
            make_holding("QQQM", quantity=2, average_cost=0),
        ]
    )

    assert result["total_cost_basis"] == 0
    assert [holding["allocation"] for holding in result["portfolio"]] == [0, 0]
    assert result["unavailable_reason"] == (
        "Actual portfolio health is unavailable because total cost basis is zero."
    )


def test_marks_mixed_currency_holdings_as_unavailable():
    result = build_actual_portfolio(
        [
            make_holding("VOO", quantity=1, average_cost=100, currency="USD"),
            make_holding("QQQM", quantity=1, average_cost=100, currency="NZD"),
        ]
    )

    assert result["portfolio"] == []
    assert result["currency"] is None
    assert result["unavailable_reason"] == (
        "Actual portfolio health is unavailable for holdings in multiple currencies."
    )


def test_calculates_same_currency_holdings_normally():
    result = build_actual_portfolio(
        [
            make_holding("VOO", quantity=1, average_cost=100, currency="NZD"),
            make_holding("QQQM", quantity=1, average_cost=100, currency="NZD"),
        ]
    )

    assert result["currency"] == "NZD"
    assert result["unavailable_reason"] is None
    assert [holding["allocation"] for holding in result["portfolio"]] == [50, 50]
