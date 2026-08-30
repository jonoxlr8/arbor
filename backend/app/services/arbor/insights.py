from app.services.arbor.portfolio_analyzer import PortfolioAnalyzer
from app.services.arbor.advisor import PortfolioAdvisor
from app.services.arbor.health_score import PortfolioHealthScore
from app.services.arbor.insight_priority import InsightPriority
from app.services.arbor.currency_formatter import format_currency


class PortfolioInsights:

    def __init__(self, plan):

        self.plan = plan
        self.analyzer = PortfolioAnalyzer(plan)
        self.advisor = PortfolioAdvisor(plan)
        self.health = PortfolioHealthScore(self.analyzer)

    def generate(self, mode="overview"):

        insights = []

        current_value = self.plan.get("profile", {}).get(
            "current_portfolio_value",
            0,
        )

        projection = self.plan.get("projection", {})

        projected_value = projection.get(
            "projected_value",
            0,
        )

        monthly = self.plan.get("profile", {}).get(
            "monthly_investment",
            0,
        )

        goal_target = self.plan.get("profile", {}).get(
            "goal_target",
            0,
        )

        currency = self.plan.get("profile", {}).get(
            "currency",
            "USD",
        )

        if monthly > 0:
            insights.append(
                {
                    "priority": InsightPriority.IMPORTANT,
                    "type": "CONTRIBUTION",
                    "text": (
                        f"💰 Your {format_currency(monthly, currency)} monthly contribution "
                        f"is a key part of your plan toward your "
                        f"{format_currency(goal_target, currency)} goal. "
                        "Increasing your contributions over time could accelerate your progress."
                    ),
                }
            )

        horizon = self.plan.get("profile", {}).get("investment_horizon", 0)

        risk_level = (
            self.plan.get("profile", {})
            .get(
                "risk_level",
                "",
            )
            .lower()
        )

        if horizon >= 10:
            insights.append(
                {
                    "priority": InsightPriority.IMPORTANT,
                    "type": "HORIZON",
                    "text": (
                        f"🕒 Your {horizon}-year investment horizon gives you more time "
                        "to withstand market downturns and benefit from long-term compounding."
                    ),
                }
            )

        if current_value > 0 and projected_value > current_value:

            growth_multiple = projected_value / current_value

            if growth_multiple >= 5:

                insights.append(
                    {
                        "priority": InsightPriority.IMPORTANT,
                        "type": "PROJECTION",
                        "text": (
                            f"🚀 Based on your current assumptions, Arbor estimates your portfolio "
                            f"could reach approximately {format_currency(projected_value, currency)} from "
                            f"{format_currency(current_value, currency)} over your investment horizon — "
                            f"roughly {growth_multiple:.1f}× your current portfolio value. This is an "
                            "illustration rather than a guaranteed outcome, and actual results "
                            "will depend on market performance and your future contributions."
                        ),
                    }
                )

            else:
                insights.append(
                    {
                        "priority": InsightPriority.POSITIVE,
                        "type": "PROJECTION",
                        "text": (
                            f"📊 Based on your current assumptions, Arbor estimates your portfolio "
                            f"could reach approximately {format_currency(projected_value, currency)} from "
                            f"{format_currency(current_value, currency)} over your investment horizon. This is an "
                            "illustration rather than a guaranteed outcome, and actual results "
                            "will depend on market performance and your future contributions."
                        ),
                    }
                )

        if goal_target > 0:

            progress = min(
                (current_value / goal_target) * 100,
                100,
            )

            projected_goal_progress = (
                min(
                    (projected_value / goal_target) * 100,
                    100,
                )
                if projected_value > 0
                else 0
            )

            projected_shortfall = max(
                goal_target - projected_value,
                0,
            )

            insights.append(
                {
                    "priority": InsightPriority.IMPORTANT,
                    "type": "GOAL_PROGRESS",
                    "text": (
                        (
                            f"🎯 Your current portfolio is equivalent to approximately "
                            f"{progress:.0f}% of your "
                            f"{format_currency(goal_target, currency)} goal. "
                            f"Based on your current assumptions, Arbor projects your portfolio "
                            f"could reach approximately {projected_goal_progress:.0f}% of your "
                            f"goal over your investment horizon."
                        )
                        if projected_shortfall > 0
                        else (
                            f"🎯 Your current portfolio is equivalent to approximately "
                            f"{progress:.0f}% of your "
                            f"{format_currency(goal_target, currency)} goal. "
                            f"Based on your current assumptions, Arbor projects that your portfolio "
                            "could reach or exceed the goal over your investment horizon."
                        )
                    ),
                }
            )

            if projected_shortfall > 0 and monthly > 0:

                insights.append(
                    {
                        "priority": InsightPriority.CRITICAL,
                        "type": "GOAL_SHORTFALL",
                        "text": (
                            f"💡 Your current plan is projected to fall approximately "
                            f"{format_currency(projected_shortfall, currency)} short of your "
                            f"{format_currency(goal_target, currency)} goal over your "
                            f"{horizon}-year horizon. "
                            "Increasing your regular contributions or extending your investment "
                            "horizon could improve your projected outcome. Arbor can help you "
                            "explore how different contribution levels could affect your path "
                            "toward the goal."
                        ),
                    }
                )

        if (
            self.analyzer.total_holdings >= 5
            and self.analyzer.crypto_allocation > 0
            and self.analyzer.technology_allocation > 0
        ):
            insights.append(
                {
                    "priority": InsightPriority.POSITIVE,
                    "type": "DIVERSIFICATION",
                    "text": (
                        f"✅ Your portfolio combines {self.analyzer.total_holdings} holdings "
                        "across broad equities, growth investments, semiconductors, "
                        "and digital assets, providing diversification across multiple "
                        "investment exposures."
                    ),
                }
            )

        if self.analyzer.crypto_allocation >= 20:
            insights.append(
                {
                    "priority": InsightPriority.IMPORTANT,
                    "type": "CRYPTO_RISK",
                    "text": (
                        f"⚠️ Cryptocurrency represents "
                        f"{self.analyzer.crypto_allocation:.0f}% of your portfolio. "
                        "This allocation can increase your portfolio's volatility and may lead "
                        "to larger swings in value during major crypto or market downturns."
                    ),
                }
            )

        semiconductor = self.analyzer.semiconductor_exposure()
        technology = self.analyzer.technology_allocation

        # Combine overlapping technology, semiconductor and growth exposures
        # into one decision-relevant concentration insight.
        if technology >= 40 or semiconductor >= 20:

            if risk_level == "aggressive":
                concentration_text = (
                    f"⚖️ Your portfolio has a strong technology and growth tilt, "
                    f"with approximately {technology:.0f}% allocated to technology-related "
                    f"exposure"
                )

                if semiconductor >= 20:
                    concentration_text += f", including approximately {semiconductor:.0f}% in semiconductor companies"

                concentration_text += (
                    ". Given your aggressive risk profile and long investment horizon, "
                    "this concentration can be intentional, but it is important to make sure "
                    "future contributions do not unintentionally increase it."
                )

            elif risk_level == "moderate":
                concentration_text = (
                    f"⚠️ Your portfolio has significant technology and growth concentration, "
                    f"with approximately {technology:.0f}% allocated to technology-related exposure"
                )

                if semiconductor >= 20:
                    concentration_text += f", including approximately {semiconductor:.0f}% in semiconductor companies"

                concentration_text += (
                    ". Consider directing future contributions toward broader-market exposure "
                    "if you want to gradually reduce this concentration."
                )

            else:
                concentration_text = (
                    f"⚠️ Your portfolio has significant technology and growth concentration, "
                    f"with approximately {technology:.0f}% allocated to technology-related exposure"
                )

                if semiconductor >= 20:
                    concentration_text += f", including approximately {semiconductor:.0f}% in semiconductor companies"

                concentration_text += (
                    ". This may create more volatility than is appropriate for your risk profile "
                    "or shorter investment horizon. Consider prioritizing broader-market and "
                    "lower-volatility investments through future contributions."
                )

            insights.append(
                {
                    "priority": InsightPriority.IMPORTANT,
                    "type": "CONCENTRATION",
                    "text": concentration_text,
                }
            )

        # High-risk exposure is a separate portfolio-level risk signal.
        if self.analyzer.high_risk_allocation >= 60:
            insights.append(
                {
                    "priority": InsightPriority.CRITICAL,
                    "type": "RISK",
                    "text": (
                        f"⚠️ Approximately {self.analyzer.high_risk_allocation:.0f}% "
                        "of your portfolio is classified as high or very-high risk. "
                        "Your portfolio has a relatively high level of risk exposure, which "
                        "may lead to significant declines during periods of market stress."
                    ),
                }
            )

        if self.analyzer.portfolio:
            largest = max(
                self.analyzer.portfolio,
                key=lambda holding: holding.get("allocation", 0),
            )
        else:
            largest = {
                "ticker": "N/A",
                "allocation": 0,
            }

        largest_allocation = largest.get("allocation", 0)

        concentration_threshold = 35

        if "moderate" in risk_level or "conservative" in risk_level:
            concentration_threshold = 30

        # Only surface individual-position concentration when it adds
        # information beyond the broader portfolio concentration insight.
        if largest_allocation >= concentration_threshold:

            # Avoid repeating the broader technology/semiconductor
            # concentration insight when the largest position is QQQM or SMH.
            if largest["ticker"].upper() not in {"QQQM", "SMH"} or technology < 40:

                if risk_level == "aggressive":
                    insights.append(
                        {
                            "priority": InsightPriority.IMPORTANT,
                            "type": "POSITION_CONCENTRATION",
                            "text": (
                                f"⚖️ {largest['ticker']} is your largest individual position "
                                f"at {largest_allocation:.0f}%. This gives your portfolio strong "
                                "exposure to the investment, but it also means its performance "
                                "will have a meaningful impact on your overall results."
                            ),
                        }
                    )

                else:
                    insights.append(
                        {
                            "priority": InsightPriority.IMPORTANT,
                            "type": "POSITION_CONCENTRATION",
                            "text": (
                                f"⚠️ {largest['ticker']} represents {largest_allocation:.0f}% "
                                "of your portfolio. A large individual position can increase "
                                "portfolio concentration and volatility."
                            ),
                        }
                    )

        # Remove duplicate insights while preserving their order.
        unique_insights = []
        seen_insights = set()

        for insight in insights:

            normalized = insight["text"].lower().strip()

            if normalized not in seen_insights:
                seen_insights.add(normalized)
                unique_insights.append(insight)

        # Prioritize the most decision-relevant insights.
        unique_insights = InsightPriority.sort(unique_insights)

        # Select the highest-priority insights while avoiding
        # duplicate insight types.

        selected_insights = []
        selected_types = set()

        for insight in unique_insights:

            insight_type = insight.get("type")

            if insight_type in selected_types:
                continue

            selected_insights.append(insight)
            selected_types.add(insight_type)

            if len(selected_insights) >= 6:
                break

        insights = InsightPriority.sort(selected_insights)

        if not insights:
            insights.append(
                {
                    "priority": InsightPriority.POSITIVE,
                    "type": "GENERAL",
                    "text": (
                        "✅ Your portfolio currently shows a good balance "
                        "between growth and diversification."
                    ),
                }
            )

        actions = []

        crypto = self.analyzer.crypto_allocation
        semiconductor = self.analyzer.semiconductor_exposure()
        largest_weight = largest_allocation

        if crypto >= 20:
            actions.append(
                f"₿ Review your {crypto:.0f}% cryptocurrency allocation and make sure "
                "you would be comfortable maintaining it through a major market decline."
            )

        if semiconductor >= 20:
            actions.append(
                f"🌱 Review your {semiconductor:.0f}% semiconductor exposure and "
                "make sure additional investments do not unintentionally increase "
                "your sector concentration."
            )

        largest_is_concentration = (
            largest["ticker"].upper() not in {"QQQM", "SMH"} or technology < 40
        )

        if largest_weight >= concentration_threshold and largest_is_concentration:

            if risk_level == "aggressive":
                actions.append(
                    f"📊 Review your {largest['ticker']} allocation of "
                    f"{largest_allocation:.0f}% as your portfolio grows to make sure "
                    "the position does not become unintentionally dominant."
                )

            else:
                actions.append(
                    f"⚠️ Consider monitoring your {largest['ticker']} allocation of "
                    f"{largest_allocation:.0f}% because a large individual position "
                    "can increase portfolio concentration."
                )

        if monthly > 0 and horizon >= 10:
            actions.append(
                f"💰 Continue investing your {format_currency(monthly, currency)} monthly contribution "
                f"through your {horizon}-year investment horizon. Consistency can help "
                "you stay focused on long-term compounding rather than short-term market movements."
            )

        # Keep actions concise and prioritize the most decision-relevant categories.
        categorized_actions = []

        for action in actions:

            if "₿" in action:
                category = "CRYPTO"

            elif "semiconductor" in action.lower():
                category = "SEMICONDUCTOR"

            elif (
                "allocation" in action.lower()
                and largest["ticker"].lower() in action.lower()
            ):
                category = "CONCENTRATION"

            elif "monthly contribution" in action.lower():
                category = "CONTRIBUTION"

            else:
                category = "GENERAL"

            categorized_actions.append(
                {
                    "category": category,
                    "priority": InsightPriority.ACTION_PRIORITY.get(
                        category,
                        99,
                    ),
                    "text": action,
                }
            )

        categorized_actions.sort(key=lambda item: item["priority"])

        selected_actions = []
        selected_categories = set()

        for action in categorized_actions:

            if action["category"] in selected_categories:
                continue

            selected_actions.append(action["text"])
            selected_categories.add(action["category"])

            if len(selected_actions) >= 3:
                break

        actions = selected_actions

        if not actions:
            actions.append(
                "💡 Keep following your long-term investment plan and review your portfolio periodically to make sure it remains aligned with your goals and risk tolerance."
            )

        health = self.health.score()
        strongest = self.advisor.biggest_strength()

        return f"""
    🌳
    Arbor
    AI Investment Companion

    ## Portfolio Insights

    ⭐ Portfolio Health

    {health["overall"]}/100

    💪 Strongest Holding

    {strongest["ticker"]} ({strongest["allocation"]}%)

    Role: {strongest["role"]}

    📈 Growth Assets

    {self.analyzer.growth_allocation:.0f}% of your portfolio

    ₿ Cryptocurrency

    {self.analyzer.crypto_allocation:.0f}% of your portfolio

    🏦 Stocks & ETFs

    {self.analyzer.stocks_etf_allocation:.0f}% of your portfolio

    ## Key Insights

    {chr(10).join(insight["text"] for insight in insights)}

    ## Arbor Actions

    {chr(10).join(actions)}
    """

    def generate_goal_progress(self):

        profile = self.plan.get("profile", {})
        projection = self.plan.get("projection", {})

        current_value = profile.get("current_portfolio_value", 0)
        goal_target = profile.get("goal_target", 0)
        monthly = profile.get("monthly_investment", 0)
        horizon = profile.get("investment_horizon", 0)
        currency = profile.get("currency", "USD")

        projected_value = projection.get("projected_value", 0)

        if goal_target <= 0:
            return """
    🌳
    Arbor
    AI Investment Companion

    ## Goal Progress

    I don't have a target goal available yet, so I can't calculate
    your progress toward it.
"""

        current_progress = min(
            (current_value / goal_target) * 100,
            100,
        )

        projected_progress = min(
            (projected_value / goal_target) * 100,
            100,
        )

        shortfall = max(
            goal_target - projected_value,
            0,
        )

        if shortfall > 0:

            outlook = (
                f"⚠️ Based on your current assumptions, Arbor projects "
                f"a shortfall of approximately "
                f"{format_currency(shortfall, currency)}."
            )

        else:

            outlook = (
                "🎯 Based on your current assumptions, Arbor projects "
                "that you could reach or exceed your goal."
            )

        return f"""
    🌳
    Arbor
    AI Investment Companion

    ## Goal Progress

    🎯 Goal

    {format_currency(goal_target, currency)}

    💰 Current Portfolio

    {format_currency(current_value, currency)}

    📊 Current Progress

    {current_progress:.0f}% of your goal

    📈 Projected Value

    {format_currency(projected_value, currency)}

    🕒 Investment Horizon

    {horizon} years

    💵 Monthly Contribution

    {format_currency(monthly, currency)}

    ## Arbor's Assessment

    Based on your current assumptions, Arbor projects your portfolio
    could reach approximately {projected_progress:.0f}% of your goal
    over your investment horizon.

    {outlook}

    💡 Increasing your regular contributions or extending your
    investment horizon could improve your projected outcome.

    This projection is an illustration, not a guaranteed result.
"""

    def generate_concentration(self):

        profile = self.plan.get("profile", {})

        risk_level = profile.get("risk_level", "unknown")
        horizon = profile.get("investment_horizon", 0)

        technology = self.analyzer.technology_allocation
        semiconductor = self.analyzer.semiconductor_exposure()
        crypto = self.analyzer.crypto_allocation

        portfolio = self.analyzer.portfolio

        if portfolio:
            largest = max(
                portfolio,
                key=lambda holding: holding.get("allocation", 0),
            )
        else:
            largest = {
                "ticker": "N/A",
                "allocation": 0,
            }

        largest_ticker = largest.get("ticker", "N/A")
        largest_allocation = largest.get("allocation", 0)

        concentration_areas = []

        if technology >= 40:
            concentration_areas.append(f"technology/growth ({technology:.0f}%)")

        if semiconductor >= 20:
            concentration_areas.append(f"semiconductors ({semiconductor:.0f}%)")

        if crypto >= 20:
            concentration_areas.append(f"cryptocurrency ({crypto:.0f}%)")

        if largest_allocation >= 35:
            concentration_areas.append(f"{largest_ticker} ({largest_allocation:.0f}%)")

        if concentration_areas:

            areas = ", ".join(concentration_areas)

            assessment = (
                f"Your main concentration areas are {areas}. "
                f"That means a relatively small number of investment themes "
                f"can have a meaningful impact on your overall portfolio."
            )

        else:

            assessment = (
                "Arbor does not identify a major concentration issue "
                "based on your current portfolio allocations."
            )

        if str(risk_level).lower() == "aggressive" and horizon >= 10:

            recommendation = (
                "Because you have an aggressive risk profile and a long "
                f"{horizon}-year investment horizon, some concentration "
                "can be intentional. However, future contributions should "
                "be monitored so that these exposures do not become "
                "unintentionally dominant."
            )

        else:

            recommendation = (
                "If you want to reduce concentration, consider directing "
                "future contributions toward broader and less concentrated "
                "investments rather than immediately selling existing holdings."
            )

        return f"""
    🌳
    Arbor
    AI Investment Companion

    ## Portfolio Concentration

    🔎 Arbor's Assessment

    {assessment}

    ## Main Concentration Areas

    {areas if concentration_areas else "No major concentration areas identified."}

    ## What This Means

    {recommendation}

        💡 Arbor generally prefers using future contributions to gradually
    adjust portfolio exposure when appropriate, rather than making
    unnecessary short-term trades.
"""

    def generate_next_steps(self):

        profile = self.plan.get("profile", {})
        projection = self.plan.get("projection", {})

        currency = profile.get("currency", "USD")
        monthly = profile.get("monthly_investment", 0)
        horizon = profile.get("investment_horizon", 0)
        goal_target = profile.get("goal_target", 0)
        projected_value = projection.get("projected_value", 0)

        risk_level = str(profile.get("risk_level", "unknown")).lower()

        crypto = self.analyzer.crypto_allocation
        semiconductor = self.analyzer.semiconductor_exposure()
        technology = self.analyzer.technology_allocation

        next_steps = []

        # 1. Contribution
        if monthly > 0:
            next_steps.append(
                f"💰 Continue your {format_currency(monthly, currency)} "
                "monthly contribution consistently."
            )

        # 2. Concentration
        if technology >= 40 or semiconductor >= 20:
            next_steps.append(
                f"⚖️ Monitor your technology exposure of approximately "
                f"{technology:.0f}%"
                + (
                    f" and semiconductor exposure of approximately "
                    f"{semiconductor:.0f}%."
                    if semiconductor >= 20
                    else "."
                )
                + " Consider directing future contributions toward "
                "other areas if you want to gradually reduce concentration."
            )

        # 3. Crypto
        if crypto >= 20:
            next_steps.append(
                f"₿ Review your {crypto:.0f}% cryptocurrency allocation "
                "and make sure you are comfortable holding it through "
                "major market declines."
            )

        # 4. Goal
        if goal_target > 0 and projected_value > 0:

            shortfall = max(
                goal_target - projected_value,
                0,
            )

            if shortfall > 0:
                next_steps.append(
                    f"🎯 Your current projection is approximately "
                    f"{format_currency(projected_value, currency)} "
                    f"against your {format_currency(goal_target, currency)} "
                    "goal. Consider increasing contributions over time "
                    "if reaching the goal sooner is important."
                )
            else:
                next_steps.append(
                    "🎯 Your current projection reaches your goal. "
                    "Focus on maintaining consistent contributions and "
                    "staying invested for the long term."
                )

        # 5. Risk
        if risk_level == "aggressive":
            next_steps.append(
                "📉 Make sure you have the discipline to continue investing "
                "during major market declines. Your aggressive strategy "
                "will likely experience significant volatility."
            )

        if not next_steps:
            next_steps.append(
                "💡 Continue following your long-term investment plan "
                "and review your portfolio periodically."
            )

        # Keep the response focused on the most useful actions.
        next_steps = next_steps[:4]

        action_text = "\n\n".join(
            f"{index}. {action}" for index, action in enumerate(next_steps, start=1)
        )

        return f"""
    🌳
    Arbor
    AI Investment Companion

    ## Your Next Steps

    Based on your current portfolio, goals, risk profile, and investment
    horizon, these are the areas Arbor recommends focusing on next:

    {action_text}

    ## Bottom Line

    Your biggest priority is consistency. Stay aligned with your
    investment plan, monitor concentration and risk, and adjust your
    contributions over time as your financial situation changes.
"""
