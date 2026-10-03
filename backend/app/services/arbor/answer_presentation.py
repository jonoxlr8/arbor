"""Presentation/navigation only; canonical explanation and arithmetic stay intact."""
import re

ANSWER_VERSION = 'deterministic-ask-1'
FEEDBACK_INTENTS = frozenset(('education','instrument_education','plan','actual_holdings','holdings_help','recorded_cost','goal_progress','monthly_plan','monthly_checkin','pending_recording','contribution','projection','assessment','readiness','preferences','risk','implementation','overlap','next_action','change_plan','assumptions','plus','help','out_of_scope','decision_boundary','clarification','legacy_plan'))
ACTIONS = frozenset(('portfolio','monthly_plan','what_if','saved_plan','goal','learn','access','settings'))


def next_action_destination(action):
    if action.key == 'review_monthly_contribution' and action.destination == 'portfolio':
        return 'monthly_plan'
    return {'portfolio':'portfolio','investment_profile':'saved_plan','plan':'saved_plan','onboarding':'settings','settings':'access'}[action.destination]


def present_answer(result, entitlements, action_override=None):
    # Keep reply byte-for-byte: older clients and full details use the same facts.
    value = dict(result)
    intent = value.get('intent','legacy_plan')
    text = value['reply']
    sentences = re.split(r'(?<=[.!?])\s+(?=[A-Z])', text)
    summary = text.split('\n\n',1)[0].strip() if '\n\n' in text else ' '.join(sentences[:2]).strip()
    # Keep uncertainty and advice boundaries visible; never bury a qualification.
    qualified = re.search(r'\b(?:unavailable|missing|incomplete|stale|cached|not actual|not advice|not a forecast|estimated|estimate|assumption|recorded cost needed|foundation first|foundation_first|short.term path|not .*advice|not .*guarantee)\b',text,re.I)
    if not qualified and len(text)>360 and summary!=text and len(summary)<=360:
        value['summary']=summary
    action = action_override or {
        'actual_holdings':'portfolio','recorded_cost':'portfolio','goal_progress':'goal',
        'holdings_help':'portfolio','pending_recording':'portfolio','monthly_checkin':'monthly_plan',
        'monthly_plan':'monthly_plan','contribution':'monthly_plan','projection':'what_if',
        'plan':'saved_plan','assessment':'saved_plan','readiness':'saved_plan','preferences':'saved_plan',
        'risk':'saved_plan','assumptions':'saved_plan','change_plan':'saved_plan','plus':'access',
        'education':'learn','instrument_education':'learn','help':'learn','out_of_scope':'learn',
    }.get(intent)
    if action in ('monthly_plan','what_if'):
        feature = 'future_projection' if action=='what_if' else 'monthly_contribution_planner'
        if feature not in entitlements.features:action='access'
    if action in ACTIONS:value['action']=action
    if intent in FEEDBACK_INTENTS:
        value['feedback_context']={'intent':intent,'answer_version':ANSWER_VERSION}
    return value
