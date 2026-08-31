import re

from app.services.arbor.router import route_intent
from app.services.arbor.portfolio import portfolio_asset_response
from app.services.arbor.portfolio_overview import portfolio_overview_response
from app.services.intent_detector import detect_intent
from app.services.arbor.aliases import ASSET_ALIASES
from app.services.arbor.portfolio_analyzer import PortfolioAnalyzer
from app.services.arbor.advisor import PortfolioAdvisor
from app.services.arbor.knowledge.service import get_asset
from app.services.arbor.health_score import PortfolioHealthScore
from app.services.arbor.health_review import HealthReview
from app.services.arbor.improvements import PortfolioImprovements
from app.services.arbor.insights import PortfolioInsights
from app.services.arbor.currency_formatter import format_currency


def ask_arbor(question: str, plan=None):

    question = question.lower()

    intents = detect_intent(question)

    comparison_assets = []
    overlap_assets = []
    comparison_intent = intents["comparison"]
    strength_intent = intents["strength"]
    risk_intent = intents["risk"]
    improve_intent = intents["improve"]
    overlap_intent = intents["overlap"]

    rebalance_intent = intents["rebalance"]
    portfolio_health_intent = intents["portfolio_health"]
    portfolio_review_intent = intents["portfolio_review"]
    dashboard_intent = intents["dashboard"]
    portfolio_insights_intent = intents["portfolio_insights"]
    increase_contributions_intent = intents["increase_contributions"]
    concentration_intent = intents["concentration"]
    goal_progress_intent = intents["goal_progress"]
    next_steps_intent = intents["next_steps"]

    buy_intent = intents["buy"]
    sell_intent = intents["sell"]

    greeting_intent = intents["greeting"]
    whoami_intent = intents["whoami"]
    thanks_intent = intents["thanks"]

    crypto_intent = intents["crypto"]
    technology_intent = intents["technology"]
    market_intent = intents["market"]
    semiconductor_intent = intents["semiconductor"]

    retirement_intent = intents["retirement"]
    year_match = intents["year_match"]

    if (comparison_intent or overlap_intent) and plan:

        portfolio = plan.get("portfolio", [])

        available_tickers = [item.get("ticker", "").lower() for item in portfolio]

        for ticker in re.findall(r"[a-zA-Z]+", question):

            ticker = ticker.lower()

            if ticker in available_tickers:

                ticker_upper = ticker.upper()

                if comparison_intent and ticker_upper not in comparison_assets:
                    comparison_assets.append(ticker_upper)

                if overlap_intent and ticker_upper not in overlap_assets:
                    overlap_assets.append(ticker_upper)

    simple_routes = {
        "market_crash": intents["market_crash"],
        "rebalance": rebalance_intent,
        "portfolio_review": portfolio_review_intent,
        "portfolio_health": portfolio_health_intent,
        "dashboard": dashboard_intent,
        "risk": risk_intent,
        "portfolio_strategy": intents["portfolio_strategy"],
        "millionaire": "million" in question or "1m" in question,
        "crypto": crypto_intent,
        "semiconductor": semiconductor_intent,
        "technology": technology_intent,
        "market": market_intent,
        "comparison": comparison_intent,
        "strength": strength_intent,
        "retirement": retirement_intent,
        "greeting": greeting_intent,
    }

    context_data = {
        "name": "investor",
        "risk": "unknown",
        "horizon": "unknown",
        "goal_target": 0,
        "currency": "USD",
        "current_value": 0,
        "monthly_contribution": 0,
        "projected_value": 0,
        "investment_years": 0,
        "return_percent": 0,
        "ticker": None,
        "allocation": None,
        "target_allocation": None,
        "left": comparison_assets[0] if len(comparison_assets) > 0 else None,
        "right": comparison_assets[1] if len(comparison_assets) > 1 else None,
        "plan": plan,
        "overlap_assets": overlap_assets,
        "holdings": [],
        "portfolio": [],
    }

    if plan:
        analyzer = PortfolioAnalyzer(plan)
        advisor = PortfolioAdvisor(plan)

        health = PortfolioHealthScore(analyzer)
        review = HealthReview(health)
        insights = PortfolioInsights(plan)
        improvements = PortfolioImprovements(analyzer)

        profile = plan.get("profile", {})

        portfolio = plan.get("portfolio", [])

        name = profile.get("full_name", "the investor")
        current_value = profile.get("current_portfolio_value", 0)

        monthly_contribution = profile.get("monthly_investment", 0)

        risk = profile.get("risk_level", "unknown")
        horizon = profile.get("investment_horizon", "unknown")

        projection = plan.get("projection", {})

        projected_value = projection.get("projected_value", 0)
        investment_years = projection.get("investment_period_years", horizon)
        expected_return = projection.get("assumed_return", 0)

        goal_target = profile.get("goal_target", 0)
        currency = profile.get("currency", "USD")

        required_monthly_investment = projection.get(
            "required_monthly_investment",
            0,
        )

        return_percent = expected_return * 100

        return_article = "an" if str(int(return_percent))[0] in "8" else "a"
        risk_word = risk.lower()

        article = "an" if risk_word and risk_word[0] in "aeiou" else "a"

        investor_summary = (
            f"{article} {risk.lower()} risk profile "
            f"with a {horizon}-year investment horizon"
        )

        context = (
            f"The investor is {name}. "
            f"They have {article} {risk.lower()} risk profile and a {horizon}-year investment horizon. "
            f"Their wealth goal is {format_currency(goal_target, currency)}. "
            f"Their current portfolio value is {format_currency(current_value, currency)}. "
            f"They contribute {format_currency(monthly_contribution, currency)} per month. "
            f"Their projected portfolio value is {format_currency(projected_value, currency)} "
            f"after {investment_years} years "
            f"assuming {return_article} {return_percent:.0f}% annual return."
        )

        context_data.update(
            {
                "name": name,
                "risk": risk,
                "horizon": horizon,
                "goal_target": goal_target,
                "currency": currency,
                "current_value": current_value,
                "monthly_contribution": monthly_contribution,
                "projected_value": projected_value,
                "required_monthly_investment": required_monthly_investment,
                "investment_years": investment_years,
                "return_percent": return_percent,
                "portfolio": portfolio,
                "left": comparison_assets[0] if len(comparison_assets) > 0 else None,
                "right": comparison_assets[1] if len(comparison_assets) > 1 else None,
                "overlap_assets": overlap_assets,
            }
        )

        if portfolio:

            holdings = []
            holding_text = []

            for item in portfolio:

                holdings.append(
                    {
                        "ticker": item["ticker"],
                        "allocation": item["allocation"],
                    }
                )

                holding_text.append(
                    f"{item['ticker']} ({item['asset_name']}) at {item['allocation']}%"
                )

            portfolio_summary = ", ".join(holding_text)

            context_data["holdings"] = holdings

            context += f" Their portfolio includes {portfolio_summary}."

    # Handle comparisons first
    if comparison_intent and context_data["left"] and context_data["right"]:

        return route_intent(
            "comparison",
            context_data,
        )

    if overlap_intent and plan:
        context_data["overlap_assets"] = overlap_assets

        return route_intent(
            "overlap",
            context_data,
        )

    if portfolio_insights_intent and plan:
        return insights.generate()

    if goal_progress_intent and plan:
        return insights.generate_goal_progress()

    if concentration_intent and plan:
        return insights.generate_concentration()

    if next_steps_intent and plan:
        return insights.generate_next_steps()

    if portfolio_health_intent and plan:
        return review.generate()

    if portfolio_review_intent and plan:
        from app.services.arbor.review import portfolio_review_response

        return portfolio_review_response(plan)

    if improve_intent and plan:
        return improvements.generate()

    if risk_intent and plan:
        return advisor.biggest_risk_response()

    if rebalance_intent and plan:
        return route_intent(
            "rebalance",
            context_data,
        )

    # Check if user asks about a portfolio holding
    if plan:
        portfolio = analyzer.portfolio

        for item in portfolio:
            ticker = item["ticker"].lower()
            aliases = ASSET_ALIASES.get(ticker, [ticker])
            asset = get_asset(item["ticker"])

            # 1. Ownership question
            if intents["ownership"] and any(alias in question for alias in aliases):

                context_data["ticker"] = item["ticker"]

                if asset:
                    context_data["role"] = asset.get("role", "Portfolio Holding")

                    context_data["why_owned"] = asset.get(
                        "why_owned",
                        asset.get(
                            "description",
                            "This investment supports your long-term strategy.",
                        ),
                    )

                    context_data["risk"] = asset.get("risk", risk)
                    context_data["portfolio"] = portfolio

                return route_intent(
                    "ownership",
                    context_data,
                )

            # 2. Buy recommendation
            if buy_intent and any(alias in question for alias in aliases):

                context_data["ticker"] = item["ticker"]
                context_data["allocation"] = item["allocation"]
                context_data["target_allocation"] = item["allocation"]

                return route_intent(
                    "asset_recommendation",
                    context_data,
                )

            # 3. Sell recommendation
            if sell_intent and ticker in question:

                context_data["ticker"] = item["ticker"]
                context_data["allocation"] = item["allocation"]

                return route_intent(
                    "sell",
                    context_data,
                )

            # 4. Asset education
            if any(alias in question for alias in aliases):

                asset = get_asset(item["ticker"])

                if asset and asset.get("advisor_type"):

                    return route_intent(
                        asset["advisor_type"],
                        context_data,
                    )

            # 5. Generic asset response
            if ticker and ticker in question:
                return portfolio_asset_response(
                    item,
                    risk,
                    horizon,
                )

        if intents["portfolio_strategy"]:
            return route_intent(
                "portfolio_strategy",
                context_data,
            )

        if (
            "portfolio" in question
            or "risk" in question
            or "allocation" in question
            or "investment plan" in question
            or "plan" in question
            or "diversified" in question
            or "diversification" in question
        ):

            diversified = (
                "diversified" in question
                or "diversification" in question
                or "balanced" in question
                or "well balanced" in question
                or "too much risk" in question
            )

            return portfolio_overview_response(
                risk,
                horizon,
                diversified,
            )

    intent_priority = [
        "market_crash",
        "portfolio_strategy",
        "overlap",
        "comparison",
        "strength",
        "risk",
        "rebalance",
        "portfolio_review",
        "portfolio_health",
        "dashboard",
        "millionaire",
        "crypto",
        "semiconductor",
        "technology",
        "market",
        "greeting",
    ]

    if strength_intent and plan:
        return advisor.strongest_holding_response()

    for intent_name in intent_priority:
        if simple_routes.get(intent_name):
            return route_intent(
                intent_name,
                context_data,
            )

    if whoami_intent:
        return route_intent(
            "whoami",
            context_data,
        )

    if thanks_intent:
        return route_intent(
            "thanks",
            context_data,
        )

    elif "million" in question or "1m" in question or "millionaire" in question:
        return route_intent(
            "millionaire",
            context_data,
        )

    elif (
        "investing enough" in question
        or "am i investing enough" in question
        or ("enough" in question and "invest" in question)
        or "how much should i invest" in question
        or "how much do i need" in question
        or "monthly investment" in question
    ):
        return route_intent(
            "investing_enough",
            context_data,
        )

    elif increase_contributions_intent:
        return route_intent(
            "increase_contributions",
            context_data,
        )

    elif "track" in question or "progress" in question or "goal" in question:
        return route_intent(
            "progress",
            context_data,
        )

    elif "change my portfolio" in question or "adjust my portfolio" in question:
        return route_intent(
            "portfolio_change",
            context_data,
        )

    elif (
        "biggest risk" in question
        or "risks" in question
        or "risk of my portfolio" in question
    ):
        return route_intent(
            "portfolio_risk",
            context_data,
        )

    elif (
        "investment strategy" in question
        or "strategy" in question
        or "approach" in question
    ):
        return route_intent(
            "investment_strategy",
            context_data,
        )

    elif "10 years" in question:

        value_10 = next(
            item["value"]
            for item in projection["yearly_projection"]
            if item["year"] == 10
        )

        context_data["projection_value"] = value_10

        return route_intent(
            "ten_year_projection",
            context_data,
        )

    elif year_match:

        requested_year = int(year_match.group(1))

        projection_data = next(
            (
                item
                for item in projection["yearly_projection"]
                if item["year"] == requested_year
            ),
            None,
        )

        if projection_data:

            context_data["projection_value"] = projection_data["value"]
            context_data["requested_year"] = requested_year

            return route_intent(
                "year_projection",
                context_data,
            )

    elif retirement_intent:
        return route_intent(
            "retirement",
            context_data,
        )

    elif (
        "projection" in question
        or "forecast" in question
        or "future value" in question
        or "how did you calculate" in question
    ):
        return route_intent(
            "projection",
            context_data,
        )

    elif "why" in question or "recommend" in question:
        return route_intent(
            "explanation",
            context_data,
        )

    else:
        return """
        I'm Arbor 🌳

        I can help you understand investing, build your investment plan,
        and answer questions about your portfolio.

        To give you personalized advice based on your portfolio, goals,
        risk profile, and investment horizon, please provide your investment
        plan first.

        You can ask me things like:

        - Why did you choose these investments?
        - Am I on track for my wealth goal?
        - How can I reach my goal faster?
        - Should I increase my contributions?
        - What happens during a market crash?
        - Is my portfolio too concentrated?

        My goal is to help you make better long-term investing decisions.
        """
