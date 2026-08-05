class PortfolioAnalyzer:
    def __init__(self, plan):
        self.plan = plan or {}
        self.profile = self.plan.get("profile", {})
        self.portfolio = self.plan.get("portfolio", [])

    def get_holding(self, ticker):
        ticker = ticker.lower()

        for holding in self.portfolio:
            if holding["ticker"].lower() == ticker:
                return holding

        return None

    def has_holding(self, ticker):
        return self.get_holding(ticker) is not None

    def allocation(self, ticker):
        holding = self.get_holding(ticker)

        if not holding:
            return 0

        return holding["allocation"]

    def tickers(self):
        return [holding["ticker"].lower() for holding in self.portfolio]
