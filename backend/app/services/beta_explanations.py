"""Deterministic explanations of a server-loaded plan, never actual holdings."""
import re
from app.services.intent_detector import detect_beta_intent
from app.services.plan_contract import validate_targets
from app.services.arbor.ownership import recommended_ownership_response
from app.services.arbor.overlap import qualitative_overlap_response

BOUNDARY = ("I can explain your Arbor plan, target allocations, asset roles and projection assumptions. "
            "This chat does not provide live market, tax, broker, trading or actual-portfolio analysis.")


def explain_plan(question, plan):
    intent = detect_beta_intent(question)
    if intent == "unsupported":
        return BOUNDARY
    if intent == "health_boundary":
        return "Actual Portfolio Health is shown in the dashboard, based on your recorded holdings and cost basis. This chat does not calculate a separate Health score."
    if intent == "greeting":
        return "Hello! I can explain your Arbor plan using a limited set of rule-based explanations. Ask about its targets, asset roles or modeled projection."
    if not plan:
        return "Please load your saved Arbor plan first. " + BOUNDARY
    targets = validate_targets(plan.get("portfolio"))
    profile, projection = plan["profile"], plan["projection"]
    text = question.lower()
    aliases = {"BTC": ["bitcoin"], "ETH": ["ethereum"]}
    mentioned = [row for row in targets if any(
        re.search(r"(?<!\w)" + re.escape(name) + r"(?!\w)", question, re.I)
        for name in [row["ticker"], *aliases.get(row["ticker"], [])]
    )]
    if intent == "overlap":
        return qualitative_overlap_response([row["ticker"] for row in mentioned])
    if intent == "asset" and len(mentioned) == 1:
        row = mentioned[0]
        return recommended_ownership_response(row, profile)
    if intent == "targets" or (intent == "asset" and re.search(r"\b(plan|strategy|portfolio)\b", text)):
        return ("## Arbor target portfolio\n\nSelected from Arbor's model portfolios using your risk category. These targets do not establish what you own.\n\n" +
                "\n".join(f"- {row['ticker']}: {row['allocation']:g}% target" for row in targets))
    if intent != "projection":
        return BOUNDARY
    if mentioned:
        return "The saved projection models the whole planning balance, not a forecast for an individual asset. " + BOUNDARY
    currency = profile["currency"]
    amount = lambda value: f"{currency} {value:,.2f}"
    horizon = projection["investment_period_years"]
    final = projection["projected_value"]
    year = re.search(r"\b(\d+)\s*years?\b", text)
    if year:
        requested = int(year.group(1))
        point = next((p for p in projection["yearly_projection"] if p["year"] == requested), None)
        if point is None:
            return f"Your saved Arbor plan provides projections through year {horizon}, with a modeled final value of {amount(final)}. There is no saved value for year {requested}; I haven't calculated a new one."
        result = f"Your saved modeled value at year {requested} is {amount(point['value'])}."
    else:
        result = f"Your modeled final value is {amount(final)} after {horizon} years."
    if re.search(r"\bmillion\w*\b", text):
        result += f" This {'reaches' if final >= 1_000_000 else 'does not reach'} one million units of your planning currency ({currency}), not a converted value in another currency."
    if re.search(r"\bgoal\b|on track", text):
        result += f" Your planning goal is {amount(profile['goal_target'])}; the final modeled value {'meets or exceeds' if final >= profile['goal_target'] else 'is below'} that goal."
        result += f" The modeled monthly contribution is {amount(projection['required_monthly_investment'])}; affordability has not been assessed."
    return result + f"\n\nIllustration only: {projection['assumed_return'] * 100:g}% assumed nominal annual return, compounded monthly with end-of-month contributions. Fees, taxes, inflation and currency movements are excluded. Returns are not guaranteed."
