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

    def generate(self):

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
                    "type": "RISK",
                    "text": (
                        f"⚠️ Cryptocurrency represents "
                        f"{self.analyzer.crypto_allocation:.0f}% of your portfolio. "
                        "This allocation can increase your portfolio's volatility and may lead "
                        "to larger swings in value during major crypto or market downturns."
                    ),
                }
            )

        if self.analyzer.technology_allocation >= 40:
            insights.append(
                {
                    "priority": InsightPriority.IMPORTANT,
                    "type": "SECTOR",
                    "text": (
                        "⚠️ Your portfolio has significant exposure "
                        "to technology and growth companies."
                    ),
                }
            )

        semiconductor = self.analyzer.semiconductor_exposure()

        if semiconductor >= 20:
            insights.append(
                {
                    "priority": InsightPriority.IMPORTANT,
                    "type": "CONCENTRATION",
                    "text": (
                        f"⚠️ Approximately {semiconductor:.0f}% of your portfolio "
                        "is exposed to semiconductor companies. This gives you strong exposure "
                        "to AI and chip-driven growth, but also means a downturn in the semiconductor "
                        "sector could have a noticeable impact on your portfolio."
                    ),
                }
            )

        if self.analyzer.growth_allocation >= 30:
            insights.append(
                {
                    "priority": InsightPriority.IMPORTANT,
                    "type": "GROWTH",
                    "text": (
                        f"📈 {self.analyzer.growth_allocation:.0f}% of your portfolio is allocated "
                        "to high-growth equities. This supports your aggressive strategy and "
                        "provides strong exposure to long-term technology and innovation trends."
                    ),
                }
            )

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
        risk_level = self.plan.get("profile", {}).get("risk_level", "").lower()

        concentration_threshold = 35

        if "moderate" in risk_level or "conservative" in risk_level:
            concentration_threshold = 30

        if largest_allocation >= concentration_threshold:

            if risk_level == "aggressive":
                insights.append(
                    {
                        "priority": InsightPriority.IMPORTANT,
                        "type": "CONCENTRATION",
                        "text": (
                            f"⚖️ {largest['ticker']} is your largest individual position "
                            f"at {largest_allocation:.0f}%. This gives your portfolio strong "
                            "growth exposure, but it also means this holding's performance will have "
                            "a meaningful impact on your overall results."
                        ),
                    }
                )

            else:
                insights.append(
                    {
                        "priority": InsightPriority.IMPORTANT,
                        "type": "CONCENTRATION",
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

        if largest_weight >= concentration_threshold:

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
