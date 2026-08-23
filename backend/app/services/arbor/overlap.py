from app.services.arbor.knowledge.service import get_asset

ETF_OVERLAP = {
    ("QQQM", "SMH"): [
        "NVDA",
        "AVGO",
        "AMD",
    ],
    ("SMH", "QQQM"): [
        "NVDA",
        "AVGO",
        "AMD",
    ],
}


def _get_holding(portfolio, ticker):
    for item in portfolio:
        if item.get("ticker", "").upper() == ticker.upper():
            return item
    return None


def _asset_info(ticker):
    asset = get_asset(ticker)

    if not asset:
        return {
            "ticker": ticker,
            "name": ticker,
            "role": "Portfolio Holding",
            "category": "",
            "advisor_type": "",
            "risk": "",
            "description": "",
        }

    return {
        "ticker": ticker,
        "name": asset.get("name", ticker),
        "role": asset.get("role", "Portfolio Holding"),
        "category": asset.get("category", ""),
        "advisor_type": asset.get("advisor_type", ""),
        "risk": asset.get("risk", ""),
        "description": asset.get("description", ""),
    }


def overlap_response(plan, tickers=None):
    portfolio = plan.get("portfolio", [])

    if len(portfolio) < 2:
        return "Your portfolio does not currently have enough holdings to evaluate overlap."

    # If specific tickers were identified, analyze those.
    if tickers and len(tickers) >= 2:
        left_ticker = tickers[0].upper()
        right_ticker = tickers[1].upper()

        left_holding = _get_holding(portfolio, left_ticker)
        right_holding = _get_holding(portfolio, right_ticker)

        if not left_holding or not right_holding:
            return "I could not identify both investments in your current portfolio."

    else:
        return """## Portfolio overlap

Arbor can analyze overlap between specific holdings in your portfolio.

Try asking something like:

**Why do I own both QQQM and SMH?**

or

**Do VOO and QQQM overlap?**"""
    shared_holdings = ETF_OVERLAP.get(
        (left_ticker, right_ticker),
        [],
    )

    left = _asset_info(left_ticker)
    right = _asset_info(right_ticker)

    # Normalize categories for comparison.
    left_category = left["category"].lower()
    right_category = right["category"].lower()

    left_type = left["advisor_type"].lower()
    right_type = right["advisor_type"].lower()

    # Determine the relationship.
    same_crypto = left_type == "crypto" and right_type == "crypto"

    technology_overlap = (
        "technology" in left_category
        or "technology" in right_category
        or left_type == "technology"
        or right_type == "technology"
    )

    semiconductor_overlap = (
        left_ticker in ["SMH", "NVDA", "AMD"]
        or right_ticker in ["SMH", "NVDA", "AMD"]
        or "semiconductor" in left_category
        or "semiconductor" in right_category
    )

    broad_market = left_ticker in ["VOO", "SPY"] or right_ticker in ["VOO", "SPY"]

    if same_crypto:
        relationship = "different parts of the digital-asset ecosystem"
        benefit = (
            f"{left_ticker} and {right_ticker} give you exposure to different "
            "parts of the cryptocurrency market rather than relying on a single "
            "digital asset."
        )
        risk = (
            "Both assets can be highly volatile and can experience significant "
            "declines during broad cryptocurrency market downturns."
        )

    elif broad_market and technology_overlap:
        relationship = "broad-market exposure and a more concentrated growth tilt"
        benefit = (
            f"{left_ticker} provides broader market exposure while "
            f"{right_ticker} increases exposure to growth-oriented companies "
            "and technology."
        )
        risk = (
            "The combination can increase your exposure to large technology "
            "companies compared with holding the broad-market fund alone."
        )

    elif semiconductor_overlap and technology_overlap:
        relationship = (
            "broad technology exposure and concentrated semiconductor exposure"
        )
        benefit = (
            f"{left_ticker} gives you broader technology or growth exposure, "
            f"while {right_ticker} provides more concentrated exposure to "
            "semiconductors and AI infrastructure."
        )
        risk = (
            "The two investments can increase your combined exposure to "
            "technology and semiconductor companies, making the portfolio "
            "more sensitive to sector-specific downturns."
        )

    elif technology_overlap:
        relationship = "overlapping technology and growth exposure"
        benefit = (
            "The overlap can intentionally increase your exposure to "
            "technology and growth companies that you have higher conviction in."
        )
        risk = (
            "The trade-off is greater concentration in technology and growth "
            "companies, which can lead to larger portfolio swings."
        )

    elif left_type == right_type:
        relationship = "similar investment exposure"
        benefit = (
            "The holdings provide related exposure, which can reinforce the "
            "part of the market represented by both investments."
        )
        risk = (
            "Because the investments have similar characteristics, the "
            "combination may provide less diversification than it appears to."
        )

    else:
        relationship = "different investment exposures"
        benefit = (
            f"{left_ticker} and {right_ticker} provide different exposures, "
            "which can help diversify the portfolio."
        )
        risk = (
            "Although the investments are different, they may still become "
            "correlated during periods of market stress."
        )

    shared_text = ""

    if shared_holdings:
        shared_names = {
            "NVDA": "Nvidia",
            "AVGO": "Broadcom",
            "AMD": "AMD",
        }

        shared_descriptions = [
            f"**{ticker}** ({shared_names.get(ticker, ticker)})"
            for ticker in shared_holdings
        ]

        shared_text = (
            "\n### Shared holdings\n\n"
            "The two funds overlap through several major semiconductor "
            "companies, including "
            f"{', '.join(shared_descriptions)}.\n"
        )

    return f"""## Why you own both {left_ticker} and {right_ticker}

{left_ticker} and {right_ticker} provide **{relationship}**.

### {left_ticker}

{left_ticker} is your **{left["role"]}**.

{left["description"]}

### {right_ticker}

{right_ticker} is your **{right["role"]}**.

{right["description"]}

{shared_text}

### Why Arbor uses both

{benefit}

The important point is that Arbor does not try to eliminate every instance of overlap.

Some overlap can be intentional when it reflects a specific investment conviction.

### The trade-off

{risk}

Arbor's goal is to make sure the overlap has a clear purpose and that the resulting concentration remains appropriate for your risk profile and investment horizon.

**Overlap is not automatically a problem. Unintentional concentration is.**"""
