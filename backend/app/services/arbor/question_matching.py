"""Whole-question paraphrases, with no model, data access or financial arithmetic.

Only explicit supported meanings are rewritten. Ambiguous wording is clarified,
not guessed. The original classifier retains its advice and entitlement checks.
"""
from dataclasses import dataclass
import re
import unicodedata

CLARIFICATION = ("Do you mean your recorded portfolio value, recorded cost or gain/loss, "
                 "or progress toward your goal? Ask about one of these so I can use the right records. "
                 "Each question stands alone.")

@dataclass(frozen=True)
class QuestionMatch:
    question: str
    clarification: str | None = None
    advice: bool = False

# Anchored meanings; a stray keyword never selects a personal-data answer.
PARAPHRASES = (
    (r"(?:magkano|how much)(?: na| na ba| ba)? (?:ang |yung |ung )?(?:value|halaga|worth|total value) (?:ng |of )?(?:portfolio ko|my portfolio)", "What is my portfolio worth?"),
    (r"(?:magkano|ano)(?: na| na ba| ba)? (?:ang |yung |ung )?portfolio ko(?: ngayon| today| now)?", "What is my portfolio worth?"),
    (r"(?:show|tell)(?: me)? (?:the )?(?:current|recorded|total) (?:value|worth) (?:of )?my portfolio", "What is my portfolio worth?"),
    (r"how much is my portfolio worth(?: now| today)?", "What is my portfolio worth?"),
    (r"(?:paki ?explain|ipaliwanag|explain|ano) (?:ang |yung |ung )?(?:arbor )?(?:plan ko|investment plan ko|my saved plan|my chosen plan)", "Explain my investment plan"),
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
