def generate_explanation(profile, portfolio):

    risk_level = profile.risk_tolerance
    horizon = profile.investment_horizon

    article = "an" if risk_level[0].lower() in "aeiou" else "a"

    summary = (
        f"Arbor recommends {article} {risk_level.lower()} "
        f"portfolio designed for a {horizon}-year investment horizon."
    )

    reasons = []

    if horizon >= 10:
        reasons.append(
            "Your long investment horizon allows greater exposure "
            "to growth assets despite short-term market volatility."
        )

    if risk_level == "Aggressive":
        reasons.append(
            "Your aggressive risk profile supports higher allocations "
            "to equities and digital assets."
        )

    tickers = [
        asset["ticker"]
        for asset in portfolio
    ]

    if "SMH" in tickers:
        reasons.append(
            "SMH provides exposure to semiconductor companies "
            "that support long-term technology and AI growth."
        )

    if "BTC" in tickers:
        reasons.append(
            "Bitcoin and Ethereum provide a measured allocation "
            "to digital assets."
        )

    return {
        "summary": summary,
        "reasons": reasons
    }