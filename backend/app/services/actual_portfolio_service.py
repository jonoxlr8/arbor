from math import isfinite
from app.schemas.currency import normalize_currency


def build_actual_portfolio(holdings):
    """Calculate cost-basis allocations for saved holdings.

    The returned portfolio preserves the saved holding fields and adds
    ``cost_basis`` and ``allocation``. An API route can use
    ``unavailable_reason`` to avoid scoring portfolios that cannot be
    meaningfully compared without currency conversion.
    """

    if not holdings:
        return {
            "portfolio": [],
            "total_cost_basis": 0,
            "currency": None,
            "unavailable_reason": "Actual portfolio health is unavailable until holdings are added.",
        }

    currencies = {normalize_currency(holding.get("currency")) for holding in holdings}
    if None in currencies:
        return {"portfolio": [], "total_cost_basis": None, "currency": None,
                "unavailable_reason": "Actual portfolio health is unavailable until missing or unsupported currencies are corrected."}

    for holding in holdings:
        values = (holding.get("quantity"), holding.get("average_cost"))
        if (not isinstance(holding.get("ticker"), str) or not holding["ticker"].strip()
                or any(isinstance(v, bool) or not isinstance(v, (int, float)) or not isfinite(v) or v < 0 for v in values)
                or not isfinite(values[0] * values[1])):
            return {"portfolio": [], "total_cost_basis": None, "currency": None,
                    "unavailable_reason": "Actual portfolio health is unavailable until invalid holding data is corrected."}

    if len(currencies) > 1:
        return {
            "portfolio": [],
            "total_cost_basis": 0,
            "currency": None,
            "unavailable_reason": "Actual portfolio health is unavailable for holdings in multiple currencies.",
        }

    positions = {}

    for holding in holdings:
        cost_basis = holding.get("quantity", 0) * holding.get("average_cost", 0)

        ticker = holding["ticker"].strip().upper()
        previous = positions.get(ticker, {})
        positions[ticker] = {**holding, "ticker": ticker,
                             "currency": normalize_currency(holding["currency"]),
                             "cost_basis": previous.get("cost_basis", 0) + cost_basis}

    holdings_with_cost_basis = list(positions.values())

    total_cost_basis = sum(
        holding["cost_basis"] for holding in holdings_with_cost_basis
    )
    if not isfinite(total_cost_basis):
        return {"portfolio": [], "total_cost_basis": None, "currency": None,
                "unavailable_reason": "Actual portfolio health is unavailable because recorded amounts are too large."}

    if total_cost_basis == 0:
        return {
            "portfolio": [
                {
                    **holding,
                    "allocation": 0,
                }
                for holding in holdings_with_cost_basis
            ],
            "total_cost_basis": total_cost_basis,
            "currency": currencies.pop(),
            "unavailable_reason": "Actual portfolio health is unavailable because total cost basis is zero.",
        }

    portfolio = [
        {
            **holding,
            "allocation": (holding["cost_basis"] / total_cost_basis) * 100,
        }
        for holding in holdings_with_cost_basis
    ]

    return {
        "portfolio": portfolio,
        "total_cost_basis": total_cost_basis,
        "currency": currencies.pop(),
        "unavailable_reason": None,
    }
