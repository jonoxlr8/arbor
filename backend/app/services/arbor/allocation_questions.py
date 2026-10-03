"""Recognize explicit target-gap questions without inferring a trade request."""
import re

GAP_QUESTIONS = {
    "both": "Which asset classes are most above and below my chosen plan targets?",
    "above": "Which asset classes are most above my chosen plan targets?",
    "below": "Which asset classes are most below my chosen plan targets?",
}

_SUBJECT = r"(?:investments?|holdings?|asset classes|asset class|sleeves?|parts)"
_GAPS = r"(?P<gaps>(?:most |furthest |pinaka[ -]?)?(?:overweight|underweight)(?: (?:and|at) (?:most |furthest |pinaka[ -]?)?(?:overweight|underweight))?)"
_PATTERNS = (
    r"(?:aling|anong) bahagi (?:ng|sa) portfolio ko (?:ang )?(?P<gaps>(?:pinakasobra|pinakakulang)(?: at (?:pinakasobra|pinakakulang))?) kumpara sa (?:napili kong plano|plano ko|targets ko)",
    rf"(?:which|what) {_SUBJECT}(?: in my portfolio)? (?:is|are) (?:the )?{_GAPS} (?:compared (?:with|to)|relative to|against|versus) (?:my (?:chosen |selected |saved )?(?:plan|targets)|the plan i chose)",
    rf"(?:aling|anong|alin ang) {_SUBJECT}(?: sa portfolio ko)? (?:ang |ay )?{_GAPS} (?:kumpara sa|compared (?:with|to)|versus) (?:chosen plan ko|selected plan ko|plan ko|targets ko|my chosen plan)",
    rf"(?:which|what) {_SUBJECT}(?: in my portfolio)? (?:is|are) (?:the )?(?:most |furthest )?(?P<gaps>above(?: and (?:most |furthest )?below)?|below(?: and (?:most |furthest )?above)?) (?:my (?:chosen |selected |saved )?(?:plan )?targets?)",
)


def allocation_gap_request(question: str) -> str | None:
    q = re.sub(r"\s+", " ", question.casefold()).strip().strip("?.!")
    for direction, canonical in GAP_QUESTIONS.items():
        if q == canonical.casefold().rstrip("?"):
            return direction
    for pattern in _PATTERNS:
        found = re.fullmatch(pattern, q)
        if found:
            gaps = found.group("gaps")
            above = "overweight" in gaps or "above" in gaps or "sobra" in gaps
            below = "underweight" in gaps or "below" in gaps or "kulang" in gaps
            return "both" if above and below else "above" if above else "below"
    return None
