from app.services.intents import INTENTS
import re


def detect_intent(question: str):

    question = question.lower().strip()

    crypto_intent = any(keyword in question for keyword in INTENTS["crypto"])
    buy_intent = (
        "buy more" in question
        or "should i buy" in question
        or "buy " in question
        or "invest in" in question
    )
    sell_intent = "should i sell" in question or "sell " in question
    rebalance_intent = (
        "rebalance" in question
        or "rebalancing" in question
        or "should i rebalance" in question
        or "rebalance my portfolio" in question
    )
    portfolio_health_intent = (
        "health" in question
        or "health score" in question
        or "portfolio health" in question
        or "how healthy" in question
        or "score my portfolio" in question
    )
    portfolio_review_intent = (
        "review my portfolio" in question
        or "review portfolio" in question
        or "portfolio review" in question
        or "analyze my portfolio" in question
        or "analyse my portfolio" in question
        or "what do you think of my portfolio" in question
    )
    portfolio_insights_intent = (
        "portfolio insights" in question
        or "my portfolio insights" in question
        or "give me an overview of my portfolio" in question
        or "portfolio overview" in question
        or "overview of my portfolio" in question
        or "show portfolio insights" in question
        or "show me my portfolio insights" in question
        or "what are my portfolio insights" in question
        or "how am i doing" in question
        or "how am i doing with my portfolio" in question
        or "how is my portfolio doing" in question
        or "how's my portfolio doing" in question
        or "am i doing well" in question
        or "am i doing okay" in question
        or "am i doing ok" in question
    )
    goal_progress_intent = (
        "am i on track" in question
        or "am i on track to reach my goal" in question
        or "on track to reach my goal" in question
        or "on track for my goal" in question
        or "will i reach my goal" in question
        or "will i reach my wealth goal" in question
        or "will i reach my target" in question
        or "how close am i to my goal" in question
        or "how far am i from my goal" in question
        or "how much closer am i to my goal" in question
    )
    dashboard_intent = (
        question == "dashboard"
        or "show dashboard" in question
        or "show my dashboard" in question
        or "show me my dashboard" in question
        or "show my portfolio" in question
        or "show me my portfolio" in question
        or "portfolio dashboard" in question
    )
    retirement_intent = any(keyword in question for keyword in INTENTS["retirement"])
    technology_intent = any(keyword in question for keyword in INTENTS["technology"])
    market_intent = any(keyword in question for keyword in INTENTS["market"])
    semiconductor_intent = any(
        keyword in question for keyword in INTENTS["semiconductors"]
    )
    greeting_intent = any(
        word in question
        for word in [
            "hi",
            "hello",
            "hey",
            "good morning",
            "good afternoon",
            "good evening",
        ]
    )
    whoami_intent = any(
        phrase in question
        for phrase in [
            "who are you",
            "what are you",
            "what can you do",
            "help",
            "what do you do",
            "about you",
        ]
    )
    thanks_intent = any(
        phrase in question
        for phrase in [
            "thanks",
            "thank you",
            "thankyou",
            "appreciate",
            "awesome",
            "great",
            "perfect",
            "nice",
        ]
    )
    market_crash_intent = (
        "crash" in question
        or "market crash" in question
        or "bear market" in question
        or "recession" in question
    )
    year_match = re.search(r"(\d+)\s*years?", question)
    hold_intent = (
        "should i hold" in question
        or "should i keep" in question
        or "continue holding" in question
        or "keep holding" in question
        or "hold " in question
    )
    comparison_intent = any(keyword in question for keyword in INTENTS["comparison"])
    portfolio_strategy_intent = any(
        keyword in question for keyword in INTENTS["portfolio_strategy"]
    )
    portfolio_tickers = [
        "voo",
        "qqqm",
        "smh",
        "btc",
        "bitcoin",
        "eth",
        "ethereum",
    ]

    mentioned_tickers = [ticker for ticker in portfolio_tickers if ticker in question]

    overlap_intent = len(mentioned_tickers) >= 2 and (
        "both" in question
        or "overlap" in question
        or "overlapping" in question
        or "too much" in question
        or "too concentrated" in question
        or "concentrated" in question
        or "why do i own" in question
        or "why own" in question
        or "why do i have" in question
    )
    strength_intent = any(keyword in question for keyword in INTENTS["strength"])
    ownership_intent = any(keyword in question for keyword in INTENTS["ownership"])
    risk_intent = (
        "biggest risk" in question
        or "main risk" in question
        or "portfolio risk" in question
        or "risk of my portfolio" in question
        or "how risky" in question
        or "how much risk" in question
    )
    concentration_intent = (
        "too concentrated" in question
        or "concentrated" in question
        or "portfolio concentrated" in question
        or "portfolio concentration" in question
        or "too much concentration" in question
        or "too much exposure" in question
        or "overexposed" in question
        or "over exposure" in question
    )
    increase_contributions_intent = (
        "increase my contributions" in question
        or "increase contributions" in question
        or "increase my investment" in question
        or "increase my investments" in question
        or "invest more" in question
        or "should i invest more" in question
        or "should i increase my contributions" in question
    )
    improve_intent = (
        "improve" in question
        or "improvement" in question
        or "improve my portfolio" in question
        or "make my portfolio better" in question
        or "optimize my portfolio" in question
        or "recommendation" in question
        or "recommendations" in question
        or "what should i change" in question
        or "what would you change" in question
    )
    next_steps_intent = (
        "what should i do next" in question
        or "what should i do now" in question
        or "what do i do next" in question
        or "what should i do" in question
        or "what should i focus on" in question
        or "what should i focus on next" in question
        or "what are my next steps" in question
        or "what should i change" in question
    )

    return {
        "crypto": crypto_intent,
        "buy": buy_intent,
        "hold": hold_intent,
        "sell": sell_intent,
        "rebalance": rebalance_intent,
        "risk": risk_intent,
        "concentration": concentration_intent,
        "goal_progress": goal_progress_intent,
        "portfolio_health": portfolio_health_intent,
        "portfolio_review": portfolio_review_intent,
        "portfolio_insights": portfolio_insights_intent,
        "dashboard": dashboard_intent,
        "retirement": retirement_intent,
        "technology": technology_intent,
        "market": market_intent,
        "market_crash": market_crash_intent,
        "semiconductor": semiconductor_intent,
        "greeting": greeting_intent,
        "whoami": whoami_intent,
        "thanks": thanks_intent,
        "year_match": year_match,
        "comparison": comparison_intent,
        "portfolio_strategy": portfolio_strategy_intent,
        "overlap": overlap_intent,
        "strength": strength_intent,
        "ownership": ownership_intent,
        "increase_contributions": increase_contributions_intent,
        "improve": improve_intent,
        "next_steps": next_steps_intent,
    }
