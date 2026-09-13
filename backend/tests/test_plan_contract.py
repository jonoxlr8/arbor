import pytest
from fastapi import HTTPException
from app.services.plan_contract import validate_targets


def row(ticker, allocation):
    return dict(ticker=ticker, asset_name=ticker, allocation=allocation)


@pytest.mark.parametrize("weights", [[70, 30], [50, 50], [30, 30, 20, 15, 5]])
def test_model_style_fixtures_are_valid_without_asserting_production_rows(weights):
    rows = [row(f"ASSET{i}", weight) for i, weight in enumerate(weights)]
    assert validate_targets(rows) == rows


@pytest.mark.parametrize("rows", [[], [row("A", -1), row("B", 101)], [row("A", float("nan"))],
    [row("A", float("inf"))], [row("A", 90)], [row("A", 60), row("B", 50)],
    [row(" a ", 50), row("A", 50)], [row("", 100)], [{"ticker":"A", "allocation":100}]])
def test_invalid_targets_return_safe_unavailable(rows):
    with pytest.raises(HTTPException) as exc:
        validate_targets(rows)
    assert exc.value.status_code == 503
    assert "temporarily unavailable" in exc.value.detail


def test_rounding_tolerance_does_not_change_weights():
    rows = [row(" a ", 33.33), row("B", 33.33), row("C", 33.33)]
    result = validate_targets(rows)
    assert result[0]["ticker"] == "A"
    assert sum(x["allocation"] for x in result) == 99.99


def test_database_failure_does_not_expose_details(monkeypatch):
    from app.services import portfolio_engine
    class Unavailable:
        def table(self, _name):
            raise RuntimeError("internal database information")
    monkeypatch.setattr(portfolio_engine, "supabase", Unavailable())
    with pytest.raises(HTTPException) as exc:
        portfolio_engine.get_portfolio_recommendation("Balanced")
    assert exc.value.status_code == 503
    assert "internal" not in exc.value.detail
