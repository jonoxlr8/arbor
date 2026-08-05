def calculate_metrics(plan):

    portfolio = plan.get("portfolio", [])

    metrics = {
        "holding_count": len(portfolio),
        "crypto": 0,
        "stocks": 0,
        "largest_holding": None,
        "largest_weight": 0,
    }

    for item in portfolio:
        ticker = item["ticker"]

        if ticker in ["BTC", "ETH"]:
            metrics["crypto"] += item["allocation"]
        else:
            metrics["stocks"] += item["allocation"]

        if item["allocation"] > metrics["largest_weight"]:
            metrics["largest_weight"] = item["allocation"]
            metrics["largest_holding"] = item["ticker"]

    return metrics
