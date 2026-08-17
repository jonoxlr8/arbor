from app.services.arbor.knowledge.service import get_asset


class PortfolioAnalyzer:
    def __init__(self, plan):
        self.plan = plan or {}
        self.profile = self.plan.get("profile", {})
        self.portfolio = self.plan.get("portfolio", [])
        self.crypto_allocation = 0
        self.technology_allocation = 0
        self.growth_allocation = 0
        self.high_risk_allocation = 0
        self.total_holdings = len(self.portfolio)
        self.stocks_etf_allocation = 0

        for holding in self.portfolio:

            allocation = holding.get("allocation", 0)

            asset = get_asset(holding["ticker"])

            if not asset:
                continue

            advisor_type = asset.get("advisor_type", "").lower()
            category = asset.get("category", "").lower()
            growth = asset.get("growth", "").lower()

            if advisor_type == "crypto":
                self.crypto_allocation += allocation

            if asset.get("risk", "").lower() in ["high", "very high"]:
                self.high_risk_allocation += allocation

            if advisor_type == "technology" or "technology" in category:
                self.technology_allocation += allocation

            if growth in ["high", "very high"] and advisor_type != "crypto":
                self.growth_allocation += allocation

        self.stocks_etf_allocation = (
            sum(holding.get("allocation", 0) for holding in self.portfolio)
            - self.crypto_allocation
        )

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

    def technology_exposure(self):

        total = 0

        for holding in self.portfolio:

            asset = get_asset(holding["ticker"])

            if not asset:
                continue

            if (
                asset.get("advisor_type") == "technology"
                or asset.get("category", "").lower() == "technology"
            ):
                total += holding["allocation"]

        return total

    def crypto_exposure(self):

        total = 0

        for holding in self.portfolio:

            asset = get_asset(holding["ticker"])

            if not asset:
                continue

            if asset.get("advisor_type") == "crypto":
                total += holding["allocation"]

        return total

    def semiconductor_exposure(self):

        total = 0

        for holding in self.portfolio:

            if holding["ticker"] in ["SMH", "NVDA", "AMD"]:
                total += holding["allocation"]

        return total
