from types import SimpleNamespace
import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from app.routes.holdings import HoldingCreate, HoldingUpdate, ensure_unique_ticker
from app.routes import holdings

BASE = dict(ticker=" qqqm ", asset_name="Example", quantity=1, average_cost=100, currency=" usd ")


@pytest.mark.parametrize("schema", [HoldingCreate, HoldingUpdate])
def test_normalized_writes(schema):
    holding = schema(**BASE)
    assert holding.ticker == "QQQM"
    assert holding.currency == "USD"


@pytest.mark.parametrize("currency", [None, "", " ", "unknown"])
def test_invalid_currency_write(currency):
    with pytest.raises(ValidationError):
        HoldingCreate(**{**BASE, "currency": currency})


class Client:
    def table(self, table):
        assert table == "holdings"
        return self
    def select(self, columns):
        return self
    def eq(self, column, value):
        assert (column, value) == ("user_id", "owner")
        return self
    def execute(self):
        return SimpleNamespace(data=[{"id": 1, "ticker": " qqqm "}])


@pytest.mark.parametrize("row_id", [None, 2])
def test_duplicate_create_and_edit_are_rejected(row_id):
    with pytest.raises(HTTPException) as error:
        ensure_unique_ticker(Client(), "owner", "QQQM", row_id)
    assert error.value.status_code == 409


def test_unchanged_row_is_allowed():
    ensure_unique_ticker(Client(), "owner", "QQQM", 1)


@pytest.mark.parametrize("edit", [False, True])
def test_duplicate_routes_stop_before_writing(monkeypatch, edit):
    monkeypatch.setattr(holdings, "get_authenticated_client", lambda token: Client())
    with pytest.raises(HTTPException) as error:
        if edit:
            holdings.update_holding(2, HoldingUpdate(**BASE), user_id="owner", authorization="Bearer test")
        else:
            holdings.create_holding(HoldingCreate(**BASE), user_id="owner", authorization="Bearer test")
    assert error.value.status_code == 409


def test_legacy_duplicate_same_identity_stays_editable():
    class DuplicateClient(Client):
        def execute(self):
            return SimpleNamespace(data=[{"id": 1, "ticker": "QQQM"}, {"id": 2, "ticker": "qqqm"}])
    ensure_unique_ticker(DuplicateClient(), "owner", "QQQM", 1)
