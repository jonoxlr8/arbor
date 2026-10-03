"""Whole-question paraphrases, with no model, data access or financial arithmetic.

Only explicit supported meanings are rewritten. Ambiguous wording is clarified,
not guessed. The original classifier retains its advice and entitlement checks.
"""
from dataclasses import dataclass
import re
import unicodedata
from .allocation_questions import allocation_gap_request, GAP_QUESTIONS

CLARIFICATION = ("Do you mean your recorded portfolio value, recorded cost or gain/loss, "
                 "or progress toward your goal? Ask about one of these so I can use the right records. "
                 "Each question stands alone.")

@dataclass(frozen=True)
class QuestionMatch:
    question: str
    clarification: str | None = None
    advice: bool = False

# Anchored meanings; a stray keyword never selects a personal-data answer.
MONTHLY_BUDGET_QUESTION = "How much remains to reach my monthly investment target?"

def is_monthly_budget_question(question: str) -> bool:
    return question.casefold().strip(" ?.!") == MONTHLY_BUDGET_QUESTION.casefold().rstrip("?")

PARAPHRASES = (
    (r"magkano (?:pa )?(?:ang |yung )?kulang ko sa (?:monthly )?investment budget ngayong buwan", MONTHLY_BUDGET_QUESTION),
    (r"(?:magkano|gaano kalaki) (?:pa )?(?:ang |yung )?(?:kulang|natitira) (?:ko )?(?:sa|para sa) (?:monthly budget ko|budget ko ngayong buwan|buwanang investment budget ko)", MONTHLY_BUDGET_QUESTION),
    (r"(?:how much (?:more|is left)|what remains) (?:do i need |to reach )?(?:for |toward )?my (?:monthly investment budget|monthly investment target|investment budget this month)", MONTHLY_BUDGET_QUESTION),

    (r"(?:where (?:can|do) i (?:invest|buy investments)|where are my (?:chosen|saved) (?:investments|providers))", "Where can I invest?"),
    (r"(?:saan (?:ako|ko) (?:pwedeng |puwedeng |pwede |puwede )?mag[ -]?(?:invest|i[ -]?invest)|saan (?:ako|ko) (?:pwedeng |puwedeng |pwede |puwede )?mamuhunan|(?:ano|anong) (?:ang |yung )?(?:pinili kong investments|saved investment choices ko|providers sa chosen plan ko))", "Where can I invest?"),
    (r"(?:ano|anong) (?:ang |yung )?(?:allocation|pagkahati) (?:ng |sa )?portfolio ko (?:kumpara sa|versus) (?:chosen plan ko|plan ko|targets ko)", "How does my portfolio compare with my plan?"),
    (r"(?:what is|show me) (?:my )?(?:chosen investment plan|saved investment plan)", "Explain my investment plan"),
    (r"(?:how much is|what is) (?:my )?(?:monthly budget|saved monthly budget)", "What is my saved monthly contribution assumption?"),
    (r"(?:magkano|how much)(?: na| na ba| ba)? (?:ang |yung |ung )?(?:value|halaga|worth|total value) (?:ng |of )?(?:portfolio ko|my portfolio)", "What is my portfolio worth?"),
    (r"(?:magkano|ano)(?: na| na ba| ba)? (?:ang |yung |ung )?portfolio ko(?: ngayon| today| now)?", "What is my portfolio worth?"),
    (r"(?:show|tell)(?: me)? (?:the )?(?:current|recorded|total) (?:value|worth) (?:of )?my portfolio", "What is my portfolio worth?"),
    (r"how much is my portfolio worth(?: now| today)?", "What is my portfolio worth?"),
    (r"(?:paki ?explain|ipaliwanag|explain|ano) (?:ang |yung |ung )?(?:arbor )?(?:plan ko|plano ko|investment plan ko|my saved plan|my chosen plan)", "Explain my investment plan"),
    (r"(?:aligned ba|tugma ba|malapit ba) (?:ang |yung |ung )?portfolio ko (?:sa |with )?(?:plan ko|targets ko|chosen plan ko)", "How does my portfolio compare with my plan?"),
    (r"(?:how far|gaano kalayo|malapit na ba) (?:na )?(?:ako |am i )?(?:sa |from |to )?(?:goal ko|my goal)", "How far am I from my goal?"),
    (r"(?:ano|kamusta|kumusta) (?:na )?(?:ang |yung )?(?:goal progress ko|progress ko sa goal)", "What is my goal progress?"),
    (r"(?:magkano|ano) (?:ang |yung )?(?:tubo|kinita|gain|gain/loss|profit) (?:ng |sa )?portfolio ko", "What is my recorded gain/loss?"),
    (r"(?:magkano|ano) (?:ang |yung )?(?:tubo|kinita|gain|gain/loss|profit) (?:ng |sa )?(vt|vgt|bnd|bitcoin|btc)", None),
    (r"(?:ano|what) (?:ang |yung |is )?(?:meaning|ibig sabihin)(?: ng| of)? (?:recorded cost|cost basis)", "What does recorded cost mean?"),
    (r"(?:magkano|ano) (?:ang |yung )?(?:budget ko|saved monthly amount ko|monthly budget ko)", "What is my saved monthly contribution assumption?"),
    (r"(?:magkano|ano) (?:ang |yung )?(?:monthly plan ko|breakdown ko this month)", "What is my monthly plan?"),
    (r"(?:ano|magkano) (?:ang |yung )?(?:na[ -]?record ko|nai[ -]?record ko|recorded ko) (?:this month|ngayong buwan)", "What did I record this month?"),
    (r"(?:may|meron bang) (?:pending|unfinished) (?:recording|recordings)(?: ako| ko)?", "What should I finish recording?"),
    (r"(?:ano|what) (?:ang |yung |is )?(?:next step ko|next ko|my next step)", "What should I do next?"),
    (r"(?:paano|saan) (?:ako )?(?:mag ?add|mag ?record|i ?add|i ?record) (?:ng |ang |yung )?(?:investment|investments|holdings|binili kong investment)", "How do I record my holdings?"),
    (r"(?:paano|saan) (?:ko )?(?:palitan|baguhin|i ?edit) (?:ang |yung )?(?:plan ko|investment profile ko)", "How do I change my plan?"),
    (r"(?:ano ang|anong|ano yung|what is an?) (?:etf|uitf|navpu|feeder fund|diversification)", None),
    (r"(?:ano|anong) (?:ang |yung )?(?:difference|pagkakaiba) (?:ng |between )?etf (?:at|and|vs) uitf", "What is the difference between an ETF and a UITF?"),
    (r"(?:ready na ba ako|pwede na ba ako sa readiness|ano ang readiness ko)", "What is my readiness?"),
    (r"(?:ano|anong) (?:ang |yung )?(?:arbor plus|subscription ko|account plan ko)", "What account plan am I on?"),
)


def _rewrite(q: str) -> str | None:
    for pattern, canonical in PARAPHRASES:
        found = re.fullmatch(pattern, q)
        if found:
            if canonical is not None:
                return canonical
            if found.groups():
                return f"What is {found.group(1)} gain/loss against recorded cost?"
            term = re.search(r"\b(etf|uitf|navpu|feeder fund|diversification)\b", q)
            return f"What is {term.group(0)}?" if term else None
    return None


def match_question(question: str) -> QuestionMatch:
    q = unicodedata.normalize('NFKC', question).casefold().replace('’', "'")
    q = re.sub(r"\s+", ' ', q).strip().strip('?.!')
    q = re.sub(r"^(?:hi arbor[, ]+|arbor[, ]+|please |pakiusap )", '', q)
    q = re.sub(r"(?:,? please| po| naman)$", '', q).strip()
    # Native-language decision requests must not fall through to named-product facts.
    if re.search(r"\b(?:bilhin|bumili|ibenta|magbenta|irekomenda|rekomendasyon)\b|\b(?:dapat|pwede ba).*\b(?:mag invest|mag-invest|maginvest|mag hold|mag-hold)\b|(?:pinaka|mas).*(?:best|okay|maganda).*(?:provider|broker|para sa akin|para sakin)|\b(?:pinakamaganda(?:ng)?|pinaka magandang|alin.*(?:pipiliin|bibilhin)|sulit ba)\b", q):
        return QuestionMatch(q, advice=True)
    gap = allocation_gap_request(q)
    if gap:
        return QuestionMatch(GAP_QUESTIONS[gap])
    if re.fullmatch(r"(?:which|what|aling|anong) (?:investments?|holdings?|asset classes|sleeves?)(?: in my portfolio| sa portfolio ko)? (?:is|are|ang) (?:most |pinaka[ -]?)?(?:overweight|underweight|above target|below target)(?: (?:and|at) (?:most |pinaka[ -]?)?(?:overweight|underweight|above target|below target))?", q):
        return QuestionMatch(q, "Do you mean the asset classes above or below your chosen plan targets? Arbor can compare recorded asset-class allocations with those targets; it does not assign a target to each investment.")
    if re.fullmatch(r"magkano (?:pa )?(?:ang |yung )?kulang ko sa monthly investment", q):
        return QuestionMatch(q, "Do you mean the amount left to reach your monthly investment budget, or an estimated contribution split? Ask about your budget or split so I can use the right records.")
    rewritten = _rewrite(q)
    if rewritten:
        return QuestionMatch(rewritten)
    if re.fullmatch(r"(?:kumusta|kamusta|how are) (?:ang |yung |my )?(?:portfolio ko|investments ko|investments)(?: doing)?|magkano (?:ang )?investment ko|(?:paano|how about) (?:ito|iyan|yan|that)|mas mataas ba (?:ito|yan|iyan)", q):
        return QuestionMatch(q, CLARIFICATION)
    clauses = re.split(r"\s+(?:and|at|tsaka|tapos)\s+", q)
    meanings = {_rewrite(part) for part in clauses} - {None}
    if len(meanings) > 1:
        return QuestionMatch(q, "Please ask one question at a time—for example, your recorded portfolio value or your goal progress. Each answer uses its own canonical records.")
    return QuestionMatch(question)
