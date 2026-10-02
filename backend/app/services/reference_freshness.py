"""Classify verified EOD date markers without rewriting source observations.

The 48/96-hour budgets are unchanged. Only known full exchange-closed calendar
periods are paused. Unknown sessions/conventions use the literal timestamp age.
"""
import json
from datetime import datetime, time, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

CALENDAR = json.loads((Path(__file__).resolve().parents[1] / 'reference_data/us_equity_sessions.json').read_text())
EASTERN = ZoneInfo(CALENDAR['timezone'])
HOLIDAYS = frozenset(CALENDAR['holidays'])


def closed(day):
    return day.weekday() >= 5 or day.isoformat() in HOLIDAYS


def reference_age_seconds(price, now):
    """Return None for invalid/future observations; fetched_at never renews age."""
    observed = price.as_of
    fetched = getattr(price, 'fetched_at', None)
    if observed.tzinfo is None or now.tzinfo is None or observed > now or getattr(price, 'verified', True) is not True:
        return None
    if fetched is not None and (fetched.tzinfo is None or fetched > now or observed > fetched):
        return None
    raw_age = (now - observed).total_seconds()
    marker = observed.astimezone(timezone.utc)
    identity = (price.price_key in CALENDAR['products'] and
                getattr(price, 'source', None) == 'marketstack' and
                getattr(price, 'kind', None) == 'etf_eod' and
                getattr(price, 'currency', None) == 'USD' and fetched is not None and
                marker.timetz().replace(tzinfo=None) == time())
    day, today = marker.date(), now.astimezone(EASTERN).date()
    # Beyond the reviewed calendar, preserve the original conservative policy.
    if not identity or day.year not in CALENDAR['verified_years'] or today.year not in CALENDAR['verified_years']:
        return raw_age
    if closed(day):
        return None
    close_time = time.fromisoformat(CALENDAR['early_closes'].get(day.isoformat(), CALENDAR['regular_close']))
    session_close = datetime.combine(day, close_time, EASTERN).astimezone(timezone.utc)
    if session_close > now or session_close > fetched:
        return None  # A close not yet completed cannot be known at retrieval time.
    age = (now - session_close).total_seconds()
    # Old data already exceeds any supported budget; bound calendar iteration.
    if age > 7 * 86400:
        return raw_age
    cursor = day + timedelta(days=1)
    while cursor <= today:
        if closed(cursor):
            start = datetime.combine(cursor, time(), EASTERN).astimezone(timezone.utc)
            end = datetime.combine(cursor + timedelta(days=1), time(), EASTERN).astimezone(timezone.utc)
            age -= max(0, (min(now, end) - max(session_close, start)).total_seconds())
        cursor += timedelta(days=1)
    return max(0, age)
