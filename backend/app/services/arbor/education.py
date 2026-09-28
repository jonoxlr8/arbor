"""Reviewed general education, independent of owner profile or market data.

Only bounded explanatory templates are returned. This is not an LLM or advice path.
Source URLs are documented in docs/ASK_ARBOR_LEARN.md and the Learn registry.
"""
import re

EDUCATION = (
    (r"\b(uitf|unit investment trust fund)\b.*\b(etf|exchange.traded fund)\b|\b(etf|exchange.traded fund)\b.*\b(uitf|unit investment trust fund)\b", "A UITF is a trust fund recorded in units and valued using a dated NAVPU. An ETF is a fund whose shares trade on an exchange at a market price. A mutual fund has its own fund-share and net-asset-value structure. Check official product documents for fees and dealing rules; no type is universally best."),
    (r"\b(navpu|net asset value per unit)\b", "NAVPU is a fund's dated net asset value per unit. For a UITF, the number of units you hold and the applicable NAVPU help describe its value. It is not a guaranteed price or a live execution quote."),
    (r"\b(uitf|unit investment trust fund)\b", "A UITF pools investors' money under a fund plan. Your provider records your participation in units; its dated NAVPU is a valuation per unit. Check the fund's official plan for dealing times, fees and risks."),
    (r"\b(etf|exchange.traded fund)\b", "An ETF is a fund whose shares trade on an exchange. Its market price can differ from the fund's net asset value. Check your provider's execution record for the actual shares received; Arbor does not infer them from a reference price."),
    (r"\b(feeder fund|feeder funds)\b", "A feeder fund invests in another fund. A Philippine feeder can provide exposure to an underlying global strategy. Check its fund plan, currencies, fees and underlying fund; a local NAVPU is a dated valuation."),
    (r"\b(diversif\w*|concentration|global equity versus technology)\b", "Diversification spreads exposure across investments, but does not prevent losses. Global equity can hold many companies and sectors; an added Technology sleeve concentrates exposure in one sector and may overlap with global holdings."),
    (r"\b(bitcoin|crypto|btc)\b", "Bitcoin is a volatile crypto asset. Consider custody, provider security and scams; beware guaranteed returns or unsolicited messages. Arbor records amounts you enter but does not custody Bitcoin, trade it or provide an execution price."),
    (r"\b(spread|foreign exchange|\bfx\b|fees|minimums)\b", "Fees, currency conversion and the difference between buy and sell prices can affect what you receive. Provider terms and minimums can change; confirm current details in the official provider app. Arbor's reference value is not an execution quote."),
    (r"\b(recorded cost|cost basis|profit|gain.loss|contribution.*profit)\b", "Recorded cost is the actual PHP amount paid that you entered. A holding's gain or loss against recorded cost needs complete cost information; unknown cost is not zero. Portfolio value change can include added capital, so a contribution is not profit or investment return."),
    (r"\b(shares|units|actual units)\b", "Find the actual shares, fund units or BTC credited in your provider's transaction confirmation, statement or holding screen. A planned PHP amount divided by a reference price does not prove the quantity received."),
    (r"\b(provider|broker|where to invest)\b", "You choose where to invest. Arbor shows neutral supported options and official links, but does not rank providers for you. Verify current fees, minimums, account terms and the destination in official provider materials."),
)


def explain_education(question: str) -> str | None:
    q = question.casefold()
    if re.search(r"\b(my|i|me|should i|best|recommend|buy|sell|hold|switch|most money)\b|^\s*how (much|many)\b|\brecorded in arbor\b", q):
        return None
    for pattern, answer in EDUCATION:
        if re.search(pattern, q):
            return answer
    return None
