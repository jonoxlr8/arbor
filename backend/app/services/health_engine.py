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

    # Base diversification score
    if holding_count >= 5:
        score = 8.5
    elif holding_count >= 3:
        score = 7.5
    elif holding_count >= 2:
        score = 6.5
    else:
        score = 5.0

    strengths = []
    warnings = []

    # Risk profile alignment
    growth_assets = 0

    for item in portfolio:
        ticker = item.get("ticker", "").upper()
        allocation = item.get("allocation", 0)

        if ticker in ["QQQM", "SMH", "BTC", "ETH"]:
            growth_assets += allocation

    if risk_level == "Conservative":
        if growth_assets <= 40:
            score += 0.3
            strengths.append("Portfolio matches your conservative risk profile")
        else:
            score -= 0.5
            warnings.append(
                "Portfolio may be more aggressive than your conservative profile"
            )

    elif risk_level == "Balanced":
        if 30 <= growth_assets <= 70:
            score += 0.3
            strengths.append("Portfolio matches your balanced investment profile")
        else:
            score -= 0.3
            warnings.append("Portfolio allocation may not match your balanced profile")

    elif risk_level == "Aggressive":
        if growth_assets >= 50:
            score += 0.3
            strengths.append("Portfolio matches your aggressive growth profile")
        else:
            warnings.append(
                "Portfolio may be too conservative for your growth objectives"
            )

    if risk_level == "Conservative" and crypto_allocation >= 20:
        score -= 0.5
        warnings.append("Your portfolio may be more aggressive than your risk profile")

    elif risk_level == "Aggressive" and crypto_allocation <= 5:
        strengths.append("Portfolio matches your aggressive growth profile")

    if crypto_allocation >= 40:
        score -= 1.5
        warnings.append("High cryptocurrency exposure increases portfolio volatility")

    elif crypto_allocation >= 20:
        score -= 0.5
        warnings.append("Cryptocurrency exposure may increase short-term volatility")

    # Concentration risk
    if largest_holding >= 50:
        score -= 1
        warnings.append("Your portfolio has high concentration risk in one investment")

    elif largest_holding >= 35 and largest_ticker not in ["VOO", "VT", "VTI"]:
        score -= 0.5
        warnings.append(
            "Your largest holding represents a significant portion of your portfolio"
        )

    if holding_count >= 5:
        strengths.append("Diversified portfolio")

    if holding_count >= 3:
        strengths.append("Good balance between simplicity and diversification")

    strengths.append("Strong long-term growth potential")

    if holding_count < 3:
        warnings.append("Portfolio may be too concentrated")

    # Keep score between 0 and 10
    score = round(max(0, min(score, 10)), 1)

    return {
        "score": score,
        "strengths": strengths,
        "warnings": warnings,
    }
