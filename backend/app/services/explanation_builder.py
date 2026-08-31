from app.services.risk_engine import (
    calculate_risk_score,
    classify_risk,
)


def generate_summary(profile):
    risk_level = classify_risk(calculate_risk_score(profile))
    horizon = profile.investment_horizon

    strategy_map = {
        "Conservative": "stability-focused",
        "Balanced": "balanced growth",
        "Aggressive": "growth-focused",
    }

    strategy = strategy_map.get(
        risk_level,
        "balanced growth",
    )

    return (
        f"Arbor recommends a {strategy} portfolio "
        f"designed for a {horizon}-year investment horizon."
    )


def generate_strength(profile):
    horizon = profile.investment_horizon

    if horizon >= 15:
        return (
            f"Your {horizon}-year investment horizon allows Arbor to focus "
            "on long-term growth opportunities while managing short-term volatility."
        )

    if horizon >= 10:
        return (
            f"Your {horizon}-year investment horizon provides enough time "
            "for your portfolio to benefit from market growth and compounding."
        )

    if horizon >= 5:
        return (
            f"Your {horizon}-year investment horizon allows participation "
            "in growth opportunities while keeping risk management important."
        )

    return (
        f"With a {horizon}-year investment horizon, Arbor prioritizes "
        "protecting capital while seeking reasonable growth opportunities."
    )


def generate_recommendation(profile):
    horizon = profile.investment_horizon
    risk = classify_risk(calculate_risk_score(profile))

    if horizon < 5:
        return (
            "Focus on protecting your capital, maintaining discipline, "
            "and avoiding unnecessary portfolio changes."
        )

    if risk == "Aggressive" and horizon >= 15:
        return (
            "Stay invested through market cycles and allow time and "
            "compounding to work toward your long-term wealth goal."
        )

    if risk == "Aggressive":
        return (
            "Focus on consistent investing while being prepared for "
            "larger market swings along the way to your goal."
        )

    if risk == "Balanced":
        return (
            "Continue investing consistently and review your portfolio "
            "periodically to keep it aligned with your target and timeline."
        )

    return (
        "Focus on consistent investing, protecting your capital, "
        "and keeping your portfolio aligned with your target and timeline."
    )


def generate_outlook(profile):
    risk = classify_risk(calculate_risk_score(profile))
    horizon = profile.investment_horizon

    if risk == "Aggressive":
        if horizon >= 10:
            return (
                "Your aggressive strategy is designed for long-term wealth creation "
                "through higher-growth assets, while accepting larger market swings."
            )

        return (
            "Your aggressive strategy targets growth opportunities, but your shorter "
            "investment horizon means managing volatility is especially important."
        )

    if risk == "Balanced":
        if horizon >= 10:
            return (
                "Your balanced strategy combines growth opportunities with "
                "diversification to support steady long-term wealth creation."
            )

        return (
            "Your balanced strategy aims to grow wealth while maintaining "
            "greater attention to risk management over your shorter timeline."
        )

    if horizon >= 10:
        return (
            "Your conservative strategy emphasizes stability while still "
            "participating in long-term market growth."
        )

    return (
        "Your conservative strategy prioritizes capital preservation and "
        "reducing unnecessary volatility."
    )


def generate_reasons(profile, portfolio):
    reasons = []

    risk = classify_risk(calculate_risk_score(profile))
    horizon = profile.investment_horizon

    holdings = {asset["ticker"].upper(): asset for asset in portfolio}

    # --------------------------------
    # 1. Investment horizon
    # --------------------------------

    if horizon >= 15:
        reasons.append(
            f"Your {horizon}-year investment horizon gives Arbor more flexibility "
            "to use growth assets while allowing time to recover from short-term "
            "market volatility."
        )

    elif horizon >= 10:
        reasons.append(
            f"Your {horizon}-year investment horizon provides time for "
            "long-term market growth and compounding to work."
        )

    elif horizon >= 5:
        reasons.append(
            f"With a {horizon}-year horizon, Arbor balances growth opportunities "
            "with greater attention to short-term volatility."
        )

    else:
        reasons.append(
            f"Because your investment horizon is {horizon} years, Arbor places "
            "greater emphasis on managing short-term investment risk."
        )

    # --------------------------------
    # 2. Risk profile
    # --------------------------------

    if risk == "Aggressive":
        reasons.append(
            "Your aggressive risk profile supports a higher allocation to "
            "growth-oriented equities and digital assets."
        )

    elif risk == "Balanced":
        reasons.append(
            "Your balanced risk profile supports a mix of broad-market exposure "
            "and targeted growth investments."
        )

    else:
        reasons.append(
            "Your conservative risk profile leads Arbor to place greater emphasis "
            "on broad-market exposure while keeping growth and alternative assets "
            "at more limited allocations."
        )

    # --------------------------------
    # 3. Broad-market core
    # --------------------------------

    if "VOO" in holdings:
        allocation = holdings["VOO"]["allocation"]

        if allocation >= 50:
            reasons.append(
                f"VOO makes up {allocation}% of your portfolio, providing a "
                "broad-market core across large U.S. companies."
            )
        else:
            reasons.append(
                f"VOO provides a {allocation}% broad-market foundation, "
                "helping diversify your more targeted growth exposures."
            )

    elif "VTI" in holdings:
        allocation = holdings["VTI"]["allocation"]
        reasons.append(
            f"VTI provides a {allocation}% broad U.S. equity foundation "
            "across companies of different sizes."
        )

    elif "VT" in holdings:
        allocation = holdings["VT"]["allocation"]
        reasons.append(
            f"VT provides a {allocation}% globally diversified equity foundation."
        )

    # --------------------------------
    # 4. Technology / growth exposure
    # --------------------------------

    if "QQQM" in holdings:
        allocation = holdings["QQQM"]["allocation"]

        reasons.append(
            f"QQQM contributes {allocation}% in large technology and growth "
            "companies, increasing your exposure to long-term innovation."
        )

    # --------------------------------
    # 5. Semiconductor exposure
    # --------------------------------

    if "SMH" in holdings:
        allocation = holdings["SMH"]["allocation"]

        reasons.append(
            f"SMH contributes {allocation}% in semiconductor companies, "
            "giving the portfolio additional exposure to AI and technology "
            "infrastructure growth."
        )

    # --------------------------------
    # 6. Cryptocurrency exposure
    # --------------------------------

    crypto_allocation = sum(
        asset["allocation"]
        for ticker, asset in holdings.items()
        if ticker in ["BTC", "ETH"]
    )

    if crypto_allocation >= 30:
        reasons.append(
            f"Your {crypto_allocation}% cryptocurrency allocation adds meaningful "
            "digital-asset exposure and potential growth, while also increasing "
            "portfolio volatility."
        )

    elif crypto_allocation > 0:
        reasons.append(
            f"Your {crypto_allocation}% cryptocurrency allocation adds "
            "digital-asset exposure while keeping most of the portfolio "
            "invested in traditional assets."
        )

    return reasons
