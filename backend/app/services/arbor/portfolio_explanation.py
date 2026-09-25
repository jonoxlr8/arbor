"""Explain computed facts only. No model arithmetic or trade instructions."""
import re
from app.services.live_portfolio import Portfolio

LABELS = {"global_equity": "Global Equity", "defensive": "Defensive", "technology_tilt": "Technology", "crypto": "Bitcoin"}
# Presentation aliases only; canonical provider IDs and valuation data stay unchanged.
PROVIDER_DISPLAY_OVERRIDES = {"gcash": "GFunds", "gcrypto": "GCrypto"}


def explain_portfolio(question: str, portfolio: Portfolio | None) -> str:
    if portfolio is None:
        return "Your current portfolio records are temporarily unavailable. I won’t substitute plan targets for actual holdings. Please retry in Portfolio."
    if not portfolio.holdings:
        return "No holdings are recorded yet. Add investments you already own in Portfolio. Your plan targets are not evidence of ownership."
    if re.search(r"perform|worst|best|gain|loss", question, re.I):
        return "Arbor has reference valuations, not complete transaction or contribution history. I can’t separate investment growth from added holdings or rank performance."
    prefix = (f"Recorded portfolio value: PHP {portfolio.total_value_php:,.2f}. " if portfolio.complete else
              f"Known recorded value: PHP {portfolio.known_value_php:,.2f}, with {portfolio.unavailable_count} holding(s) unavailable. This is not your complete portfolio value. ")
    if portfolio.stale_count:
        prefix += f"{portfolio.stale_count} holding(s) use clearly dated cached prices. "
    for holding in portfolio.holdings:
        if holding.valuation_source == "manual_user":
            provider_name = PROVIDER_DISPLAY_OVERRIDES.get(holding.provider, holding.provider_name)
            prefix += (f"You entered {holding.display_name}'s current value from {provider_name} "
                       f"as PHP {holding.value_php:,.2f} on {holding.as_of:%b %d, %Y}. "
                       "This is a manually updated holding value, not an official NAV. ")
            if holding.units is None:
                prefix += "Arbor does not currently have units for this holding, so it is using the value you entered. Automatic NAV valuation requires recorded fund units. "
        elif holding.value_php is None and holding.manual_value_updated_at:
            prefix += f"{holding.display_name}'s manual value needs updating and is excluded from the known total. "
    if re.search(r"bitcoin|btc|crypto", question, re.I):
        prefix += f"Recorded Bitcoin units across providers: {portfolio.bitcoin_units:f} BTC. "
    if not portfolio.complete:
        return prefix + "Target comparisons are unavailable until all holdings have a valuation."
    q = question.casefold()
    matches = [s for s in portfolio.sleeves if any(word in q for word in
        {"global_equity": ("global", "equity"), "defensive": ("defensive", "bond"),
         "technology_tilt": ("technology", "tech"), "crypto": ("bitcoin", "btc", "crypto")}[s.sleeve.value])]
    if "furthest" in q or "largest gap" in q:
        eligible = [s for s in portfolio.sleeves if s.difference_pp is not None]
        matches = sorted(eligible, key=lambda s: -abs(s.difference_pp))[:1]
    for s in matches:
        prefix += f"{LABELS[s.sleeve.value]}: PHP {s.known_value_php:,.2f}"
        if s.current_percentage is not None:
            prefix += f", {s.current_percentage:.2f}% current allocation"
        if s.difference_pp is not None:
            prefix += f" versus {s.target_percentage}% plan target ({s.difference_pp:+.2f} percentage points)"
        prefix += ". "
    return prefix + "These are recorded holdings and reference values, not execution quotes or instructions to trade."
