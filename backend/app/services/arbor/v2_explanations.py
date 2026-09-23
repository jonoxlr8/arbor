"""Bounded V2 intents and deterministic explanations, not an advisory agent.

No model, tools, writes, calculations, or conversation-memory authority. Unknown
questions stay bounded even if a keyword classifier misclassifies them. Every
answer is a reviewed template plus allowlisted canonical data/catalog facts.
"""
import re
from typing import Literal

from pydantic import BaseModel

from app.services.implementation.products import PRODUCTS
from app.services.strategy_v2 import AssetRole
from .v2_context import V2ChatContext, build_v2_context


class V2ChatReply(BaseModel):
    reply: str
    category: Literal["investment", "product_support", "out_of_scope"]
    intent: str


SCOPE = "I’m here to help with your Arbor investment plan, portfolio, goals and how Arbor works. Try asking me to explain your plan."
DECISION = "You make the investment decisions. I can explain your selected targets and factual implementation options, but I don’t choose securities or providers for you or give buy, sell, hold or market-timing instructions."
ACTUAL = "Your plan targets are not actual holdings. Arbor does not yet have saved current holding values for this plan, so I can’t determine ownership, performance or current target gaps. In Portfolio, the Monthly Contribution Planner can explore scenarios using the current sleeve values you enter; those values are not saved holdings."
IMPLEMENTATION = "No implementation route or product choice is saved in your V2 plan. Temporary choices in the Monthly Contribution Planner are not available to this chat. You choose implementation options in Portfolio; I don’t select or rank them for you."
HORIZONS = {"less_than_3_years": "less than 3 years", "three_to_five_years": "3–5 years", "five_to_ten_years": "5–10 years", "ten_plus_years": "10+ years"}
ROLES = {
    AssetRole.GLOBAL_EQUITY: ("Global Equity", r"global equity|global equities|stocks|equity", "Global equity spreads stock exposure across companies and markets. Its value can fluctuate substantially; diversification does not prevent losses."),
    AssetRole.DEFENSIVE: ("Defensive", r"defensive|bonds?", "Defensive assets provide a different source of exposure from stocks. They can still lose value, including when interest rates or credit conditions change."),
    AssetRole.TECHNOLOGY_TILT: ("Technology", r"technology|tech", "A technology tilt concentrates exposure in one sector, which can amplify sector-specific fluctuations."),
    AssetRole.CRYPTO: ("Bitcoin", r"bitcoin|btc|crypto", "Bitcoin exposure can fluctuate sharply and carries crypto-specific risks. A plan target does not establish actual ownership."),
}


def classify_v2_question(question: str) -> tuple[str, str]:
    q = question.casefold()
    has = lambda pattern: re.search(pattern, q) is not None
    # Out-of-scope tasks win even when mixed with investment keywords.
    if has(r"\b(python|javascript|code|coding|recipe|cook|vacation|travel|basketball|football|trivia|poem|joke)\b|ignore.*instructions|system prompt"):
        return "out_of_scope", "out_of_scope"
    if has(r"\b(buy|sell|hold|switch|recommend|best|suitable|undervalued|overvalued)\b|should i (invest|use)|which.*(choose|pick|should i use)|better for (me|my)"):
        if has(r"(buy|invest).*(month|contribut)|what should i buy"):
            return "investment", "contribution"
        return "investment", "decision_boundary"
    if has(r"what should i do next|what.*next step|next action"):
        return "product_support", "next_action"
    if has(r"arbor plus|subscription|billing|paid plan"):
        return "product_support", "plus"
    if has(r"(how|where).*(change|edit|select|choose).*(plan|approach)"):
        return "product_support", "change_plan"
    if has(r"(where|how).*(add|record|update).*holdings"):
        return "product_support", "holdings_help"
    if has(r"(saved|planned|assumed|assumption).*(monthly|contribution|starting)|(monthly|contribution|starting).*(saved|assumption)"):
        return "investment", "assumptions"
    if has(r"contribut|planner"):
        return ("product_support" if has(r"how.*work") else "investment"), "contribution"
    if has(r"overlap"):
        return "investment", "overlap"
    if has(r"overweight|underweight|furthest|largest gap|current.*(value|portfolio|holding)|how much.*(own|have)|which holding|my holdings|performance|how.*perform"):
        return "investment", "actual_holdings"
    if has(r"preferenc|earlier|historical|capped|\bcaps?\b"):
        return "investment", "preferences"
    if has(r"projection|what if|forecast|return|inflation|worth|reach.*goal"):
        return "investment", "projection"
    if has(r"assessment|risk score|risk response|volatility comfort"):
        return "investment", "assessment"
    if has(r"readiness|ready|foundation|emergency|debt"):
        return "investment", "readiness"
    if has(r"risk|volatility|diversif|concentration"):
        return "investment", "risk"
    if has(r"\b(vt|vgt|bnd|vwra|iuit|aggu|etf|broker|provider|gcash|gfunds|dragonfi|gotrade|ibkr|coins|pdax|gcrypto|fund|fees?|minimum)\b|implementation"):
        return "investment", "implementation"
    if has(r"goal|horizon|starting|monthly assumption"):
        return "investment", "assumptions"
    if has(r"plan|approach|strategy|target|allocation|portfolio|global equity|defensive|technology|bitcoin|btc|crypto|\bbonds?\b"):
        return "investment", "plan"
    if has(r"\b(hi|hello|help|arbor)\b"):
        return "product_support", "help"
    return "out_of_scope", "out_of_scope"


def identity(c: V2ChatContext) -> str:
    if c.dormant_approach:
        return f"Your {c.dormant_approach.value} selection remains saved but dormant. Your current horizon activates the short-term path, with no active long-term allocation. A long-term horizon restores that saved selection."
    name = f"{c.approach.value} approach" if c.approach else "short-term path"
    if c.plan_basis == "user_selected":
        return f"You selected the {name}. Your assessment is informational and does not override this choice."
    return f"Your existing Arbor plan is a historical {name} from the earlier assessment flow. It was not recorded as your explicit model choice. " + ("Its allocation is preserved separately from your updated assessment and readiness. " if c.historical_preserved else "") + "Explore approaches in Plan to choose a standardized plan."


def readiness(c: V2ChatContext) -> str:
    label = c.readiness.value.replace("_", " ").title()
    note = {"foundation_first": "Your recorded debt answer triggered Foundation First. Contribution scenarios are paused; your approach remains a preview, not a different strategy.",
            "getting_ready": "Your savings or debt answers flag a financial-foundation consideration. This does not change your selected approach or determine investment suitability.",
            "ready": "Your recorded savings and debt answers meet Arbor’s readiness check. This does not determine whether a particular investment is right for you."}[c.readiness.value]
    return f"Readiness: {label}. {note}"


def explain(c: V2ChatContext, question: str, intent: str) -> str:
    if intent == "out_of_scope": return SCOPE
    if intent == "decision_boundary": return DECISION
    if intent == "plus": return "I don’t have a confirmed Arbor Plus feature or pricing contract to explain. I can help with the plan and planning tools currently available in Arbor."
    if intent == "change_plan": return "Open Plan or Settings, then Edit investment profile. Preview your changes, keep your current plan or compare standardized approaches, and explicitly save. Your assessment does not choose or replace your plan."
    if intent == "holdings_help": return ACTUAL
    if intent == "help": return "Ask me about your saved plan, targets, assessment or planning assumptions. Portfolio contains the Monthly Contribution Planner; Plan lets you explore approaches. Each question stands alone."
    if intent == "actual_holdings": return ACTUAL
    if intent == "overlap": return "I can’t measure overlap in your actual portfolio. No implementation products or current holdings are saved for this V2 chat; asset-class targets alone do not identify fund constituents. I can describe catalog products factually if you name them, without treating them as holdings."
    if intent == "contribution":
        if c.path == "short_term": return "Your short-term path has no active long-term allocation. Long-term contribution scenarios are paused. You can review your investment profile in Plan; this chat does not choose a product."
        if not c.contributions_allowed: return readiness(c) + " No product purchase is proposed."
        if c.plan_basis != "user_selected": return identity(c) + " New contribution scenarios require an explicit plan choice."
        return "In Portfolio, open the Monthly Contribution Planner. Enter current sleeve values and a contribution amount, choose a route, confirm the implementation options and declare product ownership. The deterministic engine calculates a target-alignment scenario and minimum conditions—not an instruction to trade. I cannot calculate a current gap from targets alone, and I cannot see temporary scenario results. Nothing is invested or saved as a transaction."
    if intent == "readiness": return readiness(c)
    if intent == "assessment":
        check = c.horizon_assessment.value if c.horizon_assessment else "a short-term path"
        return f"Your recorded reaction corresponds to {c.assessment.value} volatility comfort. The informational horizon check returned {check} for {HORIZONS[c.horizon]}. " + identity(c)
    if intent == "preferences":
        tech, btc = c.historical_requests
        if c.plan_basis == "user_selected" and not (tech or btc):
            return "Your selected standardized approach defines your targets. Technology and Bitcoin are not added automatically. No non-zero historical preference requests are recorded."
        result = f"Your saved earlier preference requests are Technology {tech}% and Bitcoin {btc}%. These are requests, not actual holdings. "
        if c.plan_basis == "user_selected": return result + "They do not apply to your selected standardized model, which has no Technology or Bitcoin satellites. Your saved requests have not been overwritten."
        if c.historical_effective:
            tech, btc = c.historical_effective
            return result + f"The effective historical satellite targets were Technology {tech}% and Bitcoin {btc}%, after the earlier strategy/readiness restrictions. This is historical plan data, not a new allocation decision."
        return result + "Your short-term path has no effective long-term allocation."
    if intent == "risk":
        return identity(c) + " I don’t have a deterministic ranking of your biggest risk. Equity can fluctuate, defensive assets carry interest-rate and credit risk, and concentrated exposures can amplify sector losses. Diversification spreads exposure but cannot prevent losses. Targets are not evidence of your actual holdings or personal suitability."
    if intent == "implementation":
        # Only named catalog products; never invoke a mapper or infer selections.
        matches = [p for p in PRODUCTS.values() if re.search(r"(?<!\w)" + re.escape(p.display_name) + r"(?!\w)", question, re.I)]
        facts = "\n".join(f"- {p.display_name}: {ROLES[p.sleeve][0]} catalog sleeve; provider {p.provider}; platform {p.platform}; currency {p.currency or 'not specified'}. " + " ".join(p.eligibility_notes) for p in matches)
        return IMPLEMENTATION + ("\n\nCatalog facts, not personalized selections:\n" + facts if facts else " Beginner non-Bitcoin options are GCash/GFunds, DragonFi and Gotrade. Bitcoin choices are independently GCrypto, Coins.ph or PDAX; none is selected automatically. These choices do not change your plan targets. Interactive Brokers remains an advanced/internal catalog option, not part of the beginner selection flow.") + "\n\nCatalog information is static; confirm current terms in the provider app. This chat does not verify fees, live availability or order minimums."
    assumptions = f"Saved horizon: {HORIZONS[c.horizon]}. Starting balance assumption: {c.currency} {c.starting_assumption:,.2f}. Monthly contribution assumption: {c.currency} {c.monthly_assumption:,.2f}. " + (f"Goal in today’s {c.currency}: {c.goal:,.2f}." if c.goal is not None else "No goal amount is saved.")
    if intent == "assumptions": return assumptions + " These are planning inputs, not current portfolio values or transactions."
    if intent == "projection":
        if c.path == "short_term": return "Your short-term path has no long-term planning return or allocation. I won’t invent a projection or convert it to Conservative. " + assumptions
        return f"Your plan uses a {c.planning_return_pct:g}% nominal annual effective planning return and {c.inflation_pct:g}% inflation assumption. These are hypothetical assumptions, not forecasts or guarantees. " + assumptions + " No saved projected balance or requested what-if result is available to this chat. I haven’t calculated a new result or determined whether your goal will be reached."
    if not c.target: return identity(c) + " There is no long-term target allocation or planning return for this path. " + readiness(c)
    roles = [role for role, (_, pattern, _) in ROLES.items() if re.search(pattern, question, re.I)]
    lines = []
    for role in roles or ROLES:
        label, _, purpose = ROLES[role]
        weight = c.target.weight(role)
        explanation = purpose if weight else "This plan does not allocate to this sleeve."
        if role == AssetRole.TECHNOLOGY_TILT:
            explanation += " Broad equity investments can already include technology companies. A dedicated Technology sleeve adds extra concentration."
        if role == AssetRole.CRYPTO and not weight:
            explanation += " Bitcoin is not automatically added to a standardized plan. Its price can be highly volatile; owning it is a separate user decision."
        lines.append(f"- {label}: {weight}% target. " + explanation)
    return identity(c) + "\n\n" + "\n".join(lines) + "\n\nThese are plan targets, not investments you necessarily own. " + readiness(c)


def explain_v2(question: str, saved: dict) -> V2ChatReply:
    context = build_v2_context(saved)
    category, intent = classify_v2_question(question)
    if intent == "next_action":
        from app.services.next_action import get_next_action
        action = get_next_action(saved)
        locations = {"investment_profile": "Plan → Edit investment profile", "plan": "Plan",
                     "portfolio": "Portfolio → Monthly Contribution Planner", "onboarding": "onboarding"}
        return V2ChatReply(reply=f"{action.title}. {action.explanation} Open {locations[action.destination]}.",
                          category=category, intent=intent)
    return V2ChatReply(reply=explain(context, question, intent), category=category, intent=intent)
