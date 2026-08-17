def calculate_health_score(plan):

    portfolio = plan.get("portfolio", [])

    profile = plan.get("profile", {})
    risk_level = profile.get("risk_level", "")

    holding_count = len(portfolio)

    largest_holding = 0
    largest_ticker = ""

    for item in portfolio:
        allocation = item.get("allocation", 0)

        if allocation > largest_holding:
            largest_holding = allocation
            largest_ticker = item.get("ticker", "").upper()

    crypto_allocation = 0

    for item in portfolio:
        ticker = item.get("ticker", "").upper()

        if ticker in ["BTC", "ETH"]:
            crypto_allocation += item.get("allocation", 0)

    # --------------------------------
    # Health categories
    # --------------------------------

    diversification_score = 0
    risk_alignment_score = 0
    growth_score = 0
    concentration_score = 0
    crypto_score = 0

    strengths = []
    warnings = []

    # --------------------------------
    # 1. Diversification
    # --------------------------------

    if holding_count >= 5:
        diversification_score = 2
        strengths.append("Diversified portfolio")

    elif holding_count >= 3:
        diversification_score = 1.5
        strengths.append("Portfolio has a good level of diversification")

    elif holding_count >= 2:
        diversification_score = 1
        warnings.append("Portfolio could benefit from greater diversification")

    else:
        diversification_score = 0.5
        warnings.append("Portfolio may be too concentrated")

    # --------------------------------
    # 2. Risk profile alignment
    # --------------------------------

    growth_assets = 0

    for item in portfolio:
        ticker = item.get("ticker", "").upper()
        allocation = item.get("allocation", 0)

        if ticker in ["QQQM", "SMH", "BTC", "ETH"]:
            growth_assets += allocation

    if risk_level == "Conservative":

        if growth_assets <= 40:
            risk_alignment_score = 2
            strengths.append("Portfolio matches your conservative risk profile")
        else:
            risk_alignment_score = 0.5
            warnings.append(
                "Portfolio may be more aggressive than your conservative profile"
            )

    elif risk_level == "Balanced":

        if 30 <= growth_assets <= 70:
            risk_alignment_score = 2
            strengths.append("Portfolio matches your balanced investment profile")
        else:
            risk_alignment_score = 1
            warnings.append("Portfolio allocation may not match your balanced profile")

    elif risk_level == "Aggressive":

        if growth_assets >= 50:
            risk_alignment_score = 2
            strengths.append("Portfolio matches your aggressive growth profile")
        else:
            risk_alignment_score = 1
            warnings.append(
                "Portfolio may be too conservative for your growth objectives"
            )

    else:
        risk_alignment_score = 1

    # --------------------------------
    # 3. Growth potential
    # --------------------------------

    if risk_level == "Aggressive" and growth_assets >= 70:
        growth_score = 2
        strengths.append("Strong long-term growth potential")

    elif growth_assets >= 50:
        growth_score = 1.5
        strengths.append("Good long-term growth potential")

    else:
        growth_score = 1

    # --------------------------------
    # 4. Cryptocurrency exposure
    # --------------------------------

    if crypto_allocation >= 40:

        crypto_score = 0

        warnings.append("High cryptocurrency exposure increases portfolio volatility")

    elif crypto_allocation >= 20:

        crypto_score = 0.5

        warnings.append("Cryptocurrency exposure may increase short-term volatility")

    elif crypto_allocation > 0:

        crypto_score = 1

        strengths.append(
            "Measured cryptocurrency exposure adds alternative asset exposure"
        )

    else:

        crypto_score = 1

    # --------------------------------
    # 5. Concentration risk
    # --------------------------------

    if largest_holding >= 50:

        concentration_score = 0

        warnings.append("Your portfolio has high concentration risk in one investment")

    elif largest_holding >= 35 and largest_ticker not in [
        "VOO",
        "VT",
        "VTI",
    ]:

        concentration_score = 0.5

        warnings.append(
            "Your largest holding represents a significant portion of your portfolio"
        )

    else:

        concentration_score = 2

        if largest_holding > 0:
            strengths.append("No excessive concentration in a single investment")

    # --------------------------------
    # Calculate total score
    # --------------------------------

    score = (
        diversification_score
        + risk_alignment_score
        + growth_score
        + crypto_score
        + concentration_score
    )

    score = round(max(0, min(score, 10)), 1)

    # --------------------------------
    # Return health result
    # --------------------------------

    return {
        "score": score,
        "breakdown": {
            "diversification": round(diversification_score, 1),
            "risk_alignment": round(risk_alignment_score, 1),
            "growth_potential": round(growth_score, 1),
            "crypto_exposure": round(crypto_score, 1),
            "concentration": round(concentration_score, 1),
        },
        "strengths": strengths,
        "warnings": warnings,
    }
