from textwrap import dedent


def ownership_response(
    ticker,
    role,
    why_owned,
    risk,
    horizon,
    portfolio=None,
):
    portfolio = portfolio or []

    other_holdings = [
        holding
        for holding in portfolio
        if holding.get("ticker") != ticker
    ]

    portfolio_context = ""

    if ticker == "VOO":
        other_tickers = [holding.get("ticker") for holding in other_holdings]

        growth_holdings = [
            ticker
            for ticker in ["QQQM", "SMH"]
            if ticker in other_tickers
        ]

        digital_assets = [
            ticker
            for ticker in ["BTC", "ETH"]
            if ticker in other_tickers
        ]

        portfolio_context = (
            "VOO provides a broad-market foundation alongside your more "
            "concentrated growth investments."
        )

        if growth_holdings:
            portfolio_context += (
                f" Because you also own {', '.join(growth_holdings)}, "
                "VOO helps balance the portfolio's heavier technology and "
                "semiconductor exposure with broader U.S. market exposure."
            )

        if digital_assets:
            portfolio_context += (
                f" VOO also provides traditional equity exposure alongside "
                f"your digital asset positions ({', '.join(digital_assets)})."
            )

    elif ticker == "QQQM":
        other_tickers = [holding.get("ticker") for holding in other_holdings]

        portfolio_context = (
            "QQQM gives your portfolio a dedicated growth and innovation "
            "component, complementing your broader market exposure."
        )

        if "VOO" in other_tickers:
            portfolio_context += (
                " VOO provides the broader market foundation, while QQQM "
                "tilts the portfolio toward faster-growing companies."
            )

        if "SMH" in other_tickers:
            portfolio_context += (
                " Your SMH position adds an even more targeted semiconductor "
                "and AI infrastructure exposure."
            )

    elif ticker == "SMH":
        other_tickers = [holding.get("ticker") for holding in other_holdings]

        portfolio_context = (
            "SMH gives your portfolio targeted exposure to the semiconductor "
            "industry, which plays a critical role in AI, cloud computing, "
            "and modern technology."
        )

        if "QQQM" in other_tickers:
            portfolio_context += (
                " QQQM provides broader technology and innovation exposure, "
                "while SMH concentrates specifically on semiconductor companies."
            )

        if "VOO" in other_tickers:
            portfolio_context += (
                " VOO provides broader U.S. market diversification around "
                "this more concentrated position."
            )

    elif ticker == "BTC":
        other_tickers = [holding.get("ticker") for holding in other_holdings]

        portfolio_context = (
            "Bitcoin gives your portfolio exposure to a different asset class "
            "than your traditional equity investments."
        )

        if "ETH" in other_tickers:
            portfolio_context += (
                " Your Ethereum allocation provides additional exposure to "
                "blockchain infrastructure, while Bitcoin serves a different "
                "role as a digital store-of-value asset."
            )

        if "VOO" in other_tickers:
            portfolio_context += (
                " Your equity ETFs remain the traditional growth foundation "
                "of the portfolio."
            )

    elif ticker == "ETH":
        other_tickers = [holding.get("ticker") for holding in other_holdings]

        portfolio_context = (
            "Ethereum gives your portfolio exposure to blockchain "
            "infrastructure and decentralized applications."
        )

        if "BTC" in other_tickers:
            portfolio_context += (
                " Bitcoin provides a digital store-of-value exposure, while "
                "Ethereum gives you exposure to a broader blockchain ecosystem."
            )

        if "VOO" in other_tickers:
            portfolio_context += (
                " Your equity ETFs provide the traditional investment "
                "foundation around this higher-risk alternative asset."
            )

    if not portfolio_context:
        portfolio_context = (
            "This investment contributes a specific role to your overall "
            "long-term investment strategy."
        )

    return dedent(
        f"""
        ## Why you own {ticker}

        {ticker} is included in your portfolio as a **{role}**.

        #### Its purpose

        {why_owned}

        #### Why it fits your plan

        This investment fits your:

        - Risk profile: {risk}
        - Investment horizon: {horizon} years

        ### How it fits your portfolio

        {portfolio_context}

        Arbor focuses on giving every holding a clear purpose rather than simply
        collecting investments.

        Each holding should contribute something specific to your overall
        long-term wealth strategy.
        """
    )
