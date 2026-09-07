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

    currencies = {holding.get("currency") or "USD" for holding in holdings}

    if len(currencies) > 1:
        return {
            "portfolio": [],
            "total_cost_basis": 0,
            "currency": None,
            "unavailable_reason": "Actual portfolio health is unavailable for holdings in multiple currencies.",
        }

    holdings_with_cost_basis = []

    for holding in holdings:
        cost_basis = holding.get("quantity", 0) * holding.get("average_cost", 0)

        holdings_with_cost_basis.append(
            {
                **holding,
                "cost_basis": cost_basis,
            }
        )

    total_cost_basis = sum(
        holding["cost_basis"] for holding in holdings_with_cost_basis
    )

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
