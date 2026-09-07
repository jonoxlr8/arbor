from app.routes import holdings


class FakeResponse:
    def __init__(self, data):
        self.data = data


class FakeQuery:
    def __init__(self, data):
        self.data = data

    def select(self, _columns):
        return self

    def eq(self, _column, _value):
        return self

    def limit(self, _count):
        return self

    def order(self, _column, desc=False):
        return self

    def execute(self):
        return FakeResponse(self.data)


class FakeSupabaseClient:
    def __init__(self, profile, saved_holdings):
        self.profile = profile
        self.saved_holdings = saved_holdings

    def table(self, table_name):
        if table_name == "profiles":
            return FakeQuery(self.profile)

        if table_name == "holdings":
            return FakeQuery(self.saved_holdings)

        raise AssertionError(f"Unexpected table: {table_name}")


def make_profile(risk_level="Balanced"):
    return [{"risk_level": risk_level, "risk_tolerance": risk_level}]


def make_holding(ticker, quantity, average_cost, currency="USD"):
    return {
        "ticker": ticker,
        "asset_name": f"{ticker} holding",
        "asset_type": "ETF",
        "quantity": quantity,
        "average_cost": average_cost,
        "currency": currency,
    }


def configure_authenticated_client(monkeypatch, profile, saved_holdings):
    client = FakeSupabaseClient(profile, saved_holdings)

    monkeypatch.setattr(
        holdings,
        "get_authenticated_client",
        lambda access_token: client,
    )


def get_health_response():
    return {
        "score": 8,
        "breakdown": {},
        "strengths": [],
        "warnings": [],
    }


def test_returns_actual_cost_basis_health_for_same_currency_holdings(monkeypatch):
    saved_holdings = [
        make_holding("VOO", quantity=2, average_cost=100),
        make_holding("QQQM", quantity=3, average_cost=50),
    ]
    configure_authenticated_client(monkeypatch, make_profile(), saved_holdings)

    received_plan = {}

    def calculate_health_score(plan):
        received_plan.update(plan)
        return get_health_response()

    monkeypatch.setattr(holdings, "calculate_health_score", calculate_health_score)

    response = holdings.get_actual_portfolio_health(
        user_id="user-123",
        authorization="Bearer access-token",
    )

    assert response == {
        "basis": "cost_basis",
        "currency": "USD",
        "available": True,
        "health": get_health_response(),
    }
    assert received_plan["profile"]["risk_level"] == "Balanced"
    assert received_plan["portfolio"][0]["ticker"] == "VOO"
    assert received_plan["portfolio"][0]["cost_basis"] == 200
    assert received_plan["portfolio"][0]["allocation"] == 200 / 350 * 100
    assert received_plan["portfolio"][1]["allocation"] == 150 / 350 * 100


def test_returns_unavailable_when_no_holdings_exist(monkeypatch):
    configure_authenticated_client(monkeypatch, make_profile(), [])

    monkeypatch.setattr(
        holdings,
        "calculate_health_score",
        lambda _plan: (_ for _ in ()).throw(AssertionError("Health should not run")),
    )

    response = holdings.get_actual_portfolio_health(
        user_id="user-123",
        authorization="Bearer access-token",
    )

    assert response == {
        "basis": "cost_basis",
        "currency": None,
        "available": False,
        "reason": "Actual portfolio health is unavailable until holdings are added.",
        "health": None,
    }


def test_returns_unavailable_when_total_cost_basis_is_zero(monkeypatch):
    configure_authenticated_client(
        monkeypatch,
        make_profile(),
        [make_holding("VOO", quantity=0, average_cost=100)],
    )

    monkeypatch.setattr(
        holdings,
        "calculate_health_score",
        lambda _plan: (_ for _ in ()).throw(AssertionError("Health should not run")),
    )

    response = holdings.get_actual_portfolio_health(
        user_id="user-123",
        authorization="Bearer access-token",
    )

    assert response == {
        "basis": "cost_basis",
        "currency": "USD",
        "available": False,
        "reason": "Actual portfolio health is unavailable because total cost basis is zero.",
        "health": None,
    }


def test_returns_unavailable_for_mixed_currency_holdings(monkeypatch):
    configure_authenticated_client(
        monkeypatch,
        make_profile(),
        [
            make_holding("VOO", quantity=1, average_cost=100, currency="USD"),
            make_holding("QQQM", quantity=1, average_cost=100, currency="NZD"),
        ],
    )

    monkeypatch.setattr(
        holdings,
        "calculate_health_score",
        lambda _plan: (_ for _ in ()).throw(AssertionError("Health should not run")),
    )

    response = holdings.get_actual_portfolio_health(
        user_id="user-123",
        authorization="Bearer access-token",
    )

    assert response == {
        "basis": "cost_basis",
        "currency": None,
        "available": False,
        "reason": "Actual portfolio health is unavailable for holdings in multiple currencies.",
        "health": None,
    }
