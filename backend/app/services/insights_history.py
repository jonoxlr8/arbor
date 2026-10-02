"""Recorded comparisons only, using dated owner history rather than today's plan."""
from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from app.services.monthly_review import shift_month
from app.services.profile_v2 import restore_profile_v2
from app.services.arbor.v2_context import build_v2_context
from app.services.live_portfolio import catalog

MANILA = ZoneInfo('Asia/Manila')


def budget_comparison(total, month, versions):
    if versions is None:
        return {'status': 'unavailable', 'target_php': None, 'remaining_php': None, 'progress_pct': None}
    valid = [v for v in versions if v['month'][:7] <= month]
    if not valid:
        return {'status': 'unavailable', 'target_php': None, 'remaining_php': None, 'progress_pct': None}
    target = max(valid, key=lambda v: v['month'])['amount_php']
    if target is None:
        return {'status': 'unset', 'target_php': None, 'remaining_php': None, 'progress_pct': None}
    target = Decimal(str(target))
    if not target.is_finite() or target < 0 or target != target.quantize(Decimal('.01')):
        raise ValueError('Invalid historical budget')
    known = Decimal(total['amount_php'] or '0')
    reached = known >= target
    partial = total['missing_amount_count'] > 0
    return {'status': 'reached' if reached else 'incomplete' if partial else 'remaining',
            'target_php': f'{target:.2f}', 'remaining_php': None if partial and not reached else f'{max(0,target-known):.2f}',
            'progress_pct': None if partial and not reached else f'{min(100,known/target*100) if target else 100:.2f}'}


def alignment_over_time(observations, versions, now=None):
    current = (now or datetime.now(MANILA)).astimezone(MANILA)
    month = current.strftime('%Y-%m')
    unavailable = {'status': 'unavailable', 'message': 'Last month’s comparison is unavailable.',
                   'detail': 'A recorded allocation and the plan valid at each observation are needed. Today’s plan is never applied to older records.',
                   'current': None, 'previous': None, 'drivers': []}
    if observations is None or versions is None:
        return unavailable
    def moment(v):
        return datetime.fromisoformat(v.replace('Z', '+00:00'))
    def point(key):
        rows = [r for r in observations if r.get('allocation_values') is not None and
                moment(r['captured_at']).astimezone(MANILA).strftime('%Y-%m') == key and moment(r['captured_at']) <= current]
        if not rows:
            return None
        row = max(rows, key=lambda r: moment(r['captured_at']))
        valid = [v for v in versions if moment(v['valid_from']) <= moment(row['captured_at'])]
        if not valid:
            return None
        version = max(valid, key=lambda v: (moment(v['valid_from']), int(v['id'])))
        saved = restore_profile_v2(version['profile_data'])
        if saved['plan']['plan_basis'] != 'user_selected':
            return None
        target = build_v2_context(saved).target
        if target is None:
            return None
        weights = {w.role.value: Decimal(w.percentage_points) for w in target.weights}
        products = {p['product_id']: p['sleeve'] for p in catalog()}
        values = dict.fromkeys(weights, Decimal(0))
        for holding in row['allocation_values']:
            value = Decimal(str(holding['value_php']))
            role = products[holding['product_id']]
            if not value.is_finite() or value < 0:
                return None
            values[role] += value
        total = sum(values.values())
        if total <= 0 or total != Decimal(str(row['value_php'])):
            return None
        gaps = {role: abs(values[role]/total*100 - weight) for role, weight in weights.items()}
        return {'date': moment(row['captured_at']).astimezone(MANILA).date().isoformat(),
                'gap_pp': f'{sum(gaps.values())/2:.2f}', 'gaps': gaps, 'target': weights}
    try:
        previous, latest = point(shift_month(month, -1)), point(month)
    except (ValueError, KeyError, TypeError, ArithmeticError):
        return unavailable
    if previous is None or latest is None:
        return unavailable
    delta = Decimal(previous['gap_pp']) - Decimal(latest['gap_pp'])
    status = 'closer' if delta > Decimal('.01') else 'further' if delta < Decimal('-.01') else 'similar'
    labels = {'closer': 'Closer to your plan than last month.', 'further': 'Further from your plan than last month.', 'similar': 'About as close to your plan as last month.'}
    changed = previous['target'] != latest['target']
    drivers = [{'sleeve': role, 'change_pp': f"{previous['gaps'][role]-latest['gaps'][role]:.2f}"}
               for role in latest['gaps'] if abs(previous['gaps'][role]-latest['gaps'][role]) >= Decimal('.01')]
    drivers.sort(key=lambda d: -abs(Decimal(d['change_pp'])))
    return {'status': status, 'message': labels[status], 'detail':
            ('Your chosen targets changed between these observations. Each uses the plan saved at that time. ' if changed else '') +
            'This describes allocation gaps only. Purchases, price changes and corrections are not separated into causes.',
            'previous': {k: previous[k] for k in ('date', 'gap_pp')},
            'current': {k: latest[k] for k in ('date', 'gap_pp')}, 'drivers': drivers[:2]}
