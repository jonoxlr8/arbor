"""Explain computed facts only. No model arithmetic or trade instructions."""
import re
from app.services.live_portfolio import Portfolio

LABELS = {"global_equity": "Global Equity", "defensive": "Defensive", "technology_tilt": "Technology", "crypto": "Bitcoin"}
# Presentation aliases only; canonical provider IDs and valuation data stay unchanged.
PROVIDER_DISPLAY_OVERRIDES = {"gcash": "GFunds", "gcrypto": "GCrypto"}


def is_target_comparison(question: str) -> bool:
    """Bounded comparison wording, shared by routing and factual presentation."""
    subject = r"(?:portfolio|(?:global equity|defensive|technology|tech|bitcoin|btc|crypto) allocation)"
    return re.fullmatch(
        rf"\s*(?:how does my {subject} compare (?:with|to) my (?:targets?|plan)"
        r"|am i aligned with my targets?"
        r"|how close is my portfolio to my plan"
        r"|how is my portfolio allocated compared (?:with|to) my targets?"
        r"|is my portfolio aligned with (?:my plan|the plan i chose))[?.!]*\s*",
        question.casefold(),
    ) is not None


def explain_portfolio(question: str, portfolio: Portfolio | None) -> str:
    if portfolio is None:
        return "Your current portfolio records are temporarily unavailable. I won’t substitute plan targets for actual holdings. Please retry in Portfolio."
    if not portfolio.holdings:
        if is_target_comparison(question):
            return "No holdings are recorded yet. Add investments you already own in Portfolio before Arbor can compare your current portfolio with your chosen targets. Plan targets are not evidence of ownership."
        return "No holdings are recorded yet. Add investments you already own in Portfolio. Your plan targets are not evidence of ownership."
    if re.search(r"recorded cost|cost basis|gain|loss|profit", question, re.I):
        named = [holding for holding in portfolio.holdings if
                 re.search(r"(?<!\w)" + re.escape(holding.display_name) + r"(?!\w)", question, re.I)
                 or re.search(r"(?<!\w)" + re.escape(holding.product_id.split("_")[-1]) + r"(?!\w)", question, re.I)]
        if not named:
            if not portfolio.complete:
                return "Complete portfolio gain/loss is unavailable while a holding needs a usable current value. Missing value is not zero."
            if portfolio.recorded_cost_php is None:
                return "Complete portfolio gain/loss is unavailable until every active holding has recorded cost. An unknown opening or addition cost is not zero."
            if portfolio.recorded_gain_php is None or portfolio.recorded_gain_percentage is None:
                return "A comparable portfolio recorded-cost percentage is unavailable. Arbor does not invent a 0% gain."
            return (f"Portfolio current reference value PHP {portfolio.total_value_php:,.2f}; "
                    f"complete recorded cost PHP {portfolio.recorded_cost_php:,.2f}; "
                    f"gain/loss against recorded cost PHP {portfolio.recorded_gain_php:+,.2f} "
                    f"({portfolio.recorded_gain_percentage:+.2f}%). Added capital is included in recorded cost, not profit. "
                    "PHP values for foreign holdings may also change with exchange rates. This is not realized or tax return.")
        if len(named) != 1:
            return "Ask about one named investment to see its gain/loss against recorded cost. Portfolio value change can include contributions and is not investment return."
        holding = named[0]
        if holding.value_php is None:
            return f"{holding.display_name} needs a usable current value before Arbor can show gain/loss against recorded cost. Missing value is not zero."
        if holding.cost_basis_php is None:
            return f"{holding.display_name} needs complete recorded cost before Arbor can show gain/loss. An unknown opening or addition cost is not zero."
        if holding.recorded_gain_php is None or holding.recorded_gain_percentage is None:
            return f"{holding.display_name} has no comparable recorded-cost percentage yet. Arbor does not invent a 0% gain."
        return (f"{holding.display_name}: current reference value PHP {holding.value_php:,.2f}; "
                f"complete recorded cost PHP {holding.cost_basis_php:,.2f}; "
                f"gain/loss against recorded cost PHP {holding.recorded_gain_php:+,.2f} "
                f"({holding.recorded_gain_percentage:+.2f}%). This is not a realized or tax return. "
                "New capital is included in recorded cost, not counted as profit.")
    if re.search(r"perform|worst|best", question, re.I):
        return "Arbor has reference valuations, not complete transaction or contribution history. I can’t separate investment growth from added holdings or rank performance."
    if re.search(r"why.*portfolio value.*(?:up|increas)", question, re.I):
        return "Portfolio value can rise because you added investments, current valuations changed, or both. That change is not automatically profit. Gain/loss against complete recorded cost is a separate measure; Arbor does not reconstruct a cause from past prices it has not recorded."
    if re.search(r"how much.*recorded|how many.*(?:shares|units|btc)", question, re.I):
        named = [holding for holding in portfolio.holdings if
                 re.search(r"(?<!\w)" + re.escape(holding.display_name) + r"(?!\w)", question, re.I)
                 or re.search(r"(?<!\w)" + re.escape(holding.product_id.split("_")[-1]) + r"(?!\w)", question, re.I)]
        if len(named) == 1:
            holding = named[0]
            value = f"PHP {holding.value_php:,.2f}" if holding.value_php is not None else "currently unavailable"
            quantity = f"{holding.units:f} recorded units" if holding.units is not None else "a manual current value without recorded units"
            return (f"Your {holding.display_name} holding through {holding.provider_name} has {quantity}. "
                    f"Its current reference value is {value}. This is an Arbor record, not proof of a provider trade.")
    prefix = (f"Recorded portfolio value: PHP {portfolio.total_value_php:,.2f}. " if portfolio.complete else
              f"Known recorded value: PHP {portfolio.known_value_php:,.2f}, with {portfolio.unavailable_count} holding(s) unavailable. This is not your complete portfolio value. ")
    if portfolio.stale_count:
        prefix += f"{portfolio.stale_count} holding(s) use clearly dated cached prices. "
    for holding in portfolio.holdings:
        if holding.valuation_source == "nav" and holding.as_of is not None:
            prefix += (f"Your {holding.display_name} holding is valued automatically using "
                       f"the available fund NAV dated {holding.as_of:%b %d, %Y}. ")
        elif holding.valuation_source == "manual_user":
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
    comparison = is_target_comparison(question)
    if comparison and not matches:
        matches = [s for s in portfolio.sleeves if s.current_percentage is not None and s.difference_pp is not None]
        if not matches:
            return prefix + "A current allocation comparison is unavailable until recorded holdings have a positive total value and saved targets."
    if "furthest" in q or "largest gap" in q:
        eligible = [s for s in portfolio.sleeves if s.difference_pp is not None]
        matches = sorted(eligible, key=lambda s: -abs(s.difference_pp))[:1]
    for s in matches:
        prefix += f"{LABELS[s.sleeve.value]}: PHP {s.known_value_php:,.2f}"
        if s.current_percentage is not None:
            prefix += f", {s.current_percentage:.2f}% current allocation"
        if s.difference_pp is not None:
            if comparison:
                direction = "above" if s.difference_pp > 0 else "below"
                difference = (f"{abs(s.difference_pp):.2f} percentage points {direction} your target"
                              if s.difference_pp else "at your target")
                prefix += f" versus {s.target_percentage}% plan target ({difference})"
            else:
                prefix += f" versus {s.target_percentage}% plan target ({s.difference_pp:+.2f} percentage points)"
        prefix += ". "
    return prefix + "These are recorded holdings and reference values, not execution quotes or instructions to trade."
