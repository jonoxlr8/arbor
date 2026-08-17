class InsightPriority:

    CRITICAL = 3
    IMPORTANT = 2
    POSITIVE = 1

    TYPE_PRIORITY = {
        "RISK": 1,
        "GOAL_SHORTFALL": 2,
        "CONCENTRATION": 3,
        "GROWTH": 4,
        "GOAL_PROGRESS": 5,
        "CONTRIBUTION": 6,
        "HORIZON": 7,
        "PROJECTION": 8,
        "SECTOR": 9,
        "DIVERSIFICATION": 10,
        "GENERAL": 11,
    }

    ACTION_PRIORITY = {
        "CONCENTRATION": 1,
        "CRYPTO": 2,
        "SEMICONDUCTOR": 2,
        "CONTRIBUTION": 3,
        "GENERAL": 4,
    }

    @staticmethod
    def sort(insights):

        return sorted(
            insights,
            key=lambda item: (
                -item["priority"],
                InsightPriority.TYPE_PRIORITY.get(
                    item.get("type"),
                    99,
                ),
            ),
        )
