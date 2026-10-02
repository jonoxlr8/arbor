"""Synthetic provider fixtures only; no real credentials or source requests."""
from datetime import date, datetime, timedelta, timezone
import json
from decimal import Decimal
from types import SimpleNamespace

import httpx
import pytest

from app.market_data.automatic_history import quote_observations
from app.market_data.cache import SharedCache
from app.market_data.history_sources import HistoricalObservation, MarketstackHistory
from app.market_data.models import MarketDataError, normalized_value
from app.market_data.refresh import refresh
from test_market_data import Cache, adapter, handler, NOW


class AppendCache(Cache):
    def write_history(self, observations, preserve_existing=False):
        assert preserve_existing  # These tests exercise non-NAV capture only.
        conflict = False
        for item in observations:
            stored = self.history.setdefault((item.price_key, item.observed_at), item)
            conflict |= (stored.value, stored.source, stored.currency) != (item.value, item.source, item.currency)
        if conflict:
            raise MarketDataError('historical_observation_conflict')


@pytest.mark.parametrize('source', ['marketstack', 'coinranking'])
def test_existing_provider_call_captures_effective_date_and_repairs_cache(source):
    calls = []
    cache = AppendCache()
    feed = adapter(source, handler(source, calls))
    now = NOW + timedelta(days=1)
    assert refresh(cache, [feed], now, capture_history=True) == {source: 'updated'}
    assert len(calls) == (2 if source == 'coinranking' else 1)
    assert len(cache.history) == (3 if source == 'marketstack' else 1)
    original = dict(cache.history)
    assert all(o.observed_at == NOW and o.fetched_at == now for o in original.values())
    cache.history.clear()  # Repair a failed historical write using cache, no paid call.
    assert refresh(cache, [feed], now, capture_history=True) == {source: 'cached'}
    assert cache.history == original
    assert len(calls) == (2 if source == 'coinranking' else 1)
    assert refresh(cache, [feed], now, capture_history=True) == {source: 'cached'}
    assert cache.history == original


def test_flag_disabled_has_no_new_history_or_bsp_request():
    cache = AppendCache()
    calls = []
    bsp = SimpleNamespace(fetch=lambda *args: pytest.fail('BSP request'))
    for source in ('marketstack', 'coinranking', 'exchangerate_api'):
        assert refresh(cache, [adapter(source, handler(source, calls))], NOW,
                       bsp_history=bsp)[source] == 'updated'
    assert cache.history == {}


@pytest.mark.parametrize('source', ['marketstack', 'coinranking'])
@pytest.mark.parametrize('invalid', ['0', '-1', 'NaN', 'Infinity', 'bad', '1e1000', '1e-30'])
def test_invalid_prices_quarantined_from_live_and_history(source, invalid):
    from test_market_data import response
    body = response(source)
    if source == 'marketstack':
        body['data'][0]['close'] = invalid
    else:
        body['data']['price'] = invalid
    def reply(request):
        if request.url.path.endswith('reference-currencies'):
            return handler(source, [])(request)
        return httpx.Response(200, json=body)
    cache = AppendCache()
    assert refresh(cache, [adapter(source, reply)], NOW, capture_history=True)[source] == 'invalid_response'
    assert cache.rows == cache.history == {}


@pytest.mark.parametrize('error', [MarketDataError('synthetic_secret'), httpx.ReadTimeout('synthetic_secret')])
def test_bsp_failure_does_not_block_current_fx(error):
    def fetch(*args): raise error
    cache = AppendCache()
    result = refresh(cache, [adapter('exchangerate_api', handler('exchangerate_api', []))], NOW,
                     capture_history=True, bsp_history=SimpleNamespace(fetch=fetch))
    assert result == {'exchangerate_api/history': 'history_capture_failed', 'exchangerate_api': 'updated'}
    assert 'usd_php' in cache.rows and not cache.history
    assert 'synthetic_secret' not in str(result)


def test_bsp_uses_existing_daily_lease_and_real_dates_independent_of_live_failure():
    calls = []
    item = HistoricalObservation('usd_php', NOW-timedelta(days=3), normalized_value('56'),
                                 'bsp', 'PHP', 'https://www.bsp.gov.ph/daily', NOW)
    def fetch(start, end, now):
        calls.append((start, end, now))
        return [item]
    cache = AppendCache()
    feed = adapter('exchangerate_api', lambda _: httpx.Response(503))
    bsp = SimpleNamespace(fetch=fetch)
    result = refresh(cache, [feed], NOW, capture_history=True, bsp_history=bsp)
    assert result == {'exchangerate_api': 'provider_unavailable'}
    assert calls == [(NOW.date()-timedelta(days=7), NOW.date(), NOW)]
    assert cache.history == {('usd_php', item.observed_at): item}
    assert cache.rows == {}
    assert refresh(cache, [feed], NOW, capture_history=True, bsp_history=bsp) == {'exchangerate_api': 'cooldown'}
    assert len(calls) == 1


def test_empty_bsp_reports_gap_without_inventing_fx_history():
    cache = AppendCache()
    result = refresh(cache, [adapter('exchangerate_api', handler('exchangerate_api', []))], NOW,
                     capture_history=True, bsp_history=SimpleNamespace(fetch=lambda *args: []))
    assert result['exchangerate_api/history'] == 'history_capture_failed'
    assert cache.history == {}
    assert quote_observations(list(cache.rows.values())) == []


def test_history_failure_recovered_on_cached_tick_without_fetch():
    cache = AppendCache()
    real_write = cache.write_history
    cache.write_history = lambda *args, **kwargs: (_ for _ in ()).throw(MarketDataError('no_table'))
    calls = []
    feed = adapter('marketstack', handler('marketstack', calls))
    result = refresh(cache, [feed], NOW, capture_history=True)
    assert result['marketstack'] == 'updated' and result['marketstack/history'] == 'history_capture_failed'
    assert len(cache.rows) == 3
    cache.write_history = real_write
    assert refresh(cache, [feed], NOW, capture_history=True) == {'marketstack': 'cached'}
    assert len(calls) == 1 and len(cache.history) == 3


def test_pre_split_vgt_gate_is_per_instrument():
    prices = adapter('marketstack', handler('marketstack', [])).fetch(NOW)
    pre = datetime(2026, 4, 20, tzinfo=timezone.utc)
    prices = [p.model_copy(update={'as_of': pre}) for p in prices]
    result = quote_observations(prices)
    assert {o.price_key for o in result} == {'gotrade_vt', 'gotrade_bnd'}
    prices[1] = prices[1].model_copy(update={'as_of': datetime(2026, 4, 21, tzinfo=timezone.utc)})
    assert len(quote_observations(prices)) == 3
    cache = AppendCache()
    cache.write([p.model_copy(update={'as_of': pre}) for p in prices])
    result = refresh(cache, [adapter('marketstack', lambda _: pytest.fail('fetch'))], NOW, capture_history=True)
    assert result['marketstack/history'] == 'vgt_split_review_required'


def test_historical_marketstack_also_excludes_older_vgt_only():
    rows = [dict(symbol=s, close='100', date='2026-04-20T00:00:00Z') for s in ('VT', 'VGT', 'BND')]
    http = SimpleNamespace(get=lambda *args, **kwargs: dict(data=rows, pagination=dict(offset=0, limit=100, count=3, total=3)))
    result = MarketstackHistory(http, 'synthetic').fetch(date(2026,4,20), date(2026,4,20), NOW)
    assert {o.price_key for o in result} == {'gotrade_vt', 'gotrade_bnd'}


def test_utc_source_day_and_append_only_http_policy():
    price = adapter('coinranking', handler('coinranking', [])).fetch(NOW)[0]
    local = datetime.fromisoformat('2026-09-24T01:00:00+08:00')
    price = price.model_copy(update={'as_of': local})
    observation = quote_observations([price])[0]
    assert observation.payload()['observation_date'] == '2026-09-23'
    calls = []
    def respond(request):
        calls.append(request)
        return (httpx.Response(200, json=[observation.payload()]) if request.method == 'GET'
                else httpx.Response(201))
    cache = SharedCache(httpx.Client(transport=httpx.MockTransport(respond)),
        'https://synthetic.supabase.co', 'sb_secret_synthetic')
    cache.write_history([observation], preserve_existing=True)
    assert calls[0].headers['Prefer'] == 'resolution=ignore-duplicates,return=minimal'
    assert calls[0].url.params['on_conflict'] == 'price_key,observed_at'
    assert json.loads(calls[0].content)[0]['reference_id'] == 'synthetic_php'
    cache.write_history([observation])  # Existing NAV conflict trigger path retained.
    assert calls[2].headers['Prefer'] == 'resolution=merge-duplicates,return=minimal'


@pytest.mark.parametrize('enabled', [None, 'false', 'true'])
@pytest.mark.parametrize('history_status,exit_code', [('history_capture_failed', 1), ('vgt_split_review_required', 1), ('updated', 0)])
def test_cli_activation_is_explicit_and_history_failures_are_visible(monkeypatch, capsys, enabled, history_status, exit_code):
    from app.market_data import __main__ as cli
    monkeypatch.setattr(cli.sys, 'argv', ['market_data', 'refresh'])
    monkeypatch.setattr(cli, 'load_dotenv', lambda: None)
    monkeypatch.setattr(cli, 'SharedCache', lambda *args: AppendCache())
    if enabled is None:
        monkeypatch.delenv('ARBOR_AUTOMATIC_HISTORY_ENABLED', raising=False)
    else:
        monkeypatch.setenv('ARBOR_AUTOMATIC_HISTORY_ENABLED', enabled)
    def fake_refresh(cache, feeds, **options):
        if enabled == 'true':
            assert options['capture_history'] is True
            assert options['bsp_history'].__class__.__name__ == 'BSPHistory'
            return {'marketstack': 'updated', 'marketstack/history': history_status}
        assert options == {}
        return {'marketstack': 'updated'}
    monkeypatch.setattr(cli, 'refresh', fake_refresh)
    assert cli.main() == (exit_code if enabled == 'true' else 0)
    if enabled == 'true':
        assert f'marketstack/history: {history_status}' in capsys.readouterr().out


@pytest.mark.parametrize('changes', [
    {'currency': 'PHP'}, {'source': 'coinranking'}, {'as_of': NOW+timedelta(days=1)},
    {'value': Decimal('NaN')}, {'value': Decimal('0')}, {'value': Decimal('1000000000000')},
])
def test_invalid_cached_identity_date_price_never_enters_history(changes):
    price = adapter('marketstack', handler('marketstack', [])).fetch(NOW)[0]
    with pytest.raises((ValueError, ArithmeticError)):
        quote_observations([price.model_copy(update=changes)])


def test_repeated_conflicting_provider_observation_cannot_replace_history():
    from test_market_data import response
    cache = AppendCache()
    first = adapter('marketstack', handler('marketstack', []))
    refresh(cache, [first], NOW, capture_history=True)
    original = dict(cache.history)
    body = response('marketstack')
    body['data'][0]['close'] = '999'
    cache.claims.clear()
    second = adapter('marketstack', lambda _: httpx.Response(200, json=body))
    result = refresh(cache, [second], NOW+timedelta(seconds=second.interval), capture_history=True)
    assert result['marketstack/history'] == 'historical_observation_conflict'
    assert cache.history == original
    assert cache.rows['gotrade_vt'].value == normalized_value('999')
    # Live correction remains separate: immutable history requires operator review.


@pytest.mark.parametrize('different', [False, True])
def test_http_append_verifies_same_timestamp_quote_without_overwrite(different):
    item = quote_observations(adapter('marketstack', handler('marketstack', [])).fetch(NOW))[0]
    stored = item.payload()
    stored['provenance'] = 'https://api.marketstack.com/v2/eod'  # Legitimate dated import provenance.
    stored['fetched_at'] = (NOW+timedelta(days=1)).isoformat()
    if different:
        stored['value'] = '999'
    calls = []
    def respond(request):
        calls.append(request)
        if request.method == 'POST':
            assert request.headers['Prefer'] == 'resolution=ignore-duplicates,return=minimal'
            return httpx.Response(201)  # Existing primary key stays intact, including concurrent insert.
        assert request.url.params['limit'] == '1'
        assert 'price_key.eq.gotrade_vt' in request.url.params['or']
        assert item.observed_at.isoformat() in request.url.params['or']
        return httpx.Response(200, json=[stored])
    cache = SharedCache(httpx.Client(transport=httpx.MockTransport(respond)),
                        'https://synthetic.supabase.co', 'sb_secret_synthetic')
    if different:
        with pytest.raises(MarketDataError, match='historical_observation_conflict'):
            cache.write_history([item], preserve_existing=True)
    else:
        cache.write_history([item], preserve_existing=True)
    assert [r.method for r in calls] == ['POST', 'GET']
    assert stored['value'] == ('999' if different else str(item.value))


@pytest.mark.parametrize('rows', [[], None, {}, [{'price_key': 'btc_php'}]])
def test_http_history_verification_fails_closed_for_incomplete_response(rows):
    item = quote_observations(adapter('marketstack', handler('marketstack', [])).fetch(NOW))[0]
    def respond(request):
        return httpx.Response(200, json=rows) if request.method == 'GET' else httpx.Response(201)
    cache = SharedCache(httpx.Client(transport=httpx.MockTransport(respond)),
                        'https://synthetic.supabase.co', 'sb_secret_synthetic')
    with pytest.raises(MarketDataError, match='invalid_historical_cache_response'):
        cache.write_history([item], preserve_existing=True)


def test_five_minute_day_has_bounded_calls_and_no_synthetic_closed_market_dates():
    clock = [NOW]
    class LeaseCache(AppendCache):
        def __init__(self):
            super().__init__()
            self.attempts = {}
        def claim(self, source, interval):
            if source in self.attempts and (clock[0]-self.attempts[source]).total_seconds() < interval:
                return False
            self.attempts[source] = clock[0]
            return True
    cache = LeaseCache()
    calls = []
    def respond(source):
        def reply(request):
            response = handler(source, calls)(request)
            if source == 'coinranking' and request.url.path.endswith('/price'):
                body = json.loads(response.content)
                body['data']['timestamp'] = int(clock[0].timestamp())
                return httpx.Response(200, json=body)
            return response
        return reply
    feeds = [adapter(s, respond(s)) for s in ('marketstack', 'exchangerate_api', 'coinranking')]
    bsp_calls = []
    def bsp(start, end, now):
        bsp_calls.append((start, end, now))
        return [HistoricalObservation('usd_php', NOW-timedelta(days=1), normalized_value('56'),
            'bsp', 'PHP', 'https://www.bsp.gov.ph/daily', now)]
    for tick in range(288):
        clock[0] = NOW+timedelta(minutes=5*tick)
        result = refresh(cache, feeds, clock[0], capture_history=True, bsp_history=SimpleNamespace(fetch=bsp))
        assert all(status in ('updated', 'cached', 'cooldown') for status in result.values())
    assert sum(r.url.host == 'api.marketstack.com' for r in calls) == 4
    assert sum(r.url.host == 'open.er-api.com' for r in calls) == 1
    assert sum(r.url.path.endswith('/price') for r in calls) == 144
    assert sum(r.url.path.endswith('/reference-currencies') for r in calls) == 1
    assert len(bsp_calls) == 1
    assert len([o for o in cache.history.values() if o.source == 'marketstack']) == 3
    assert len([o for o in cache.history.values() if o.source == 'coinranking']) == 144
    assert len([o for o in cache.history.values() if o.source == 'bsp']) == 1
    assert all(o.observed_at == NOW for o in cache.history.values() if o.source == 'marketstack')
    assert all(o.observed_at == NOW-timedelta(days=1) for o in cache.history.values() if o.source == 'bsp')


def test_history_import_verification_keeps_urls_and_batches_bounded():
    import re
    items = [HistoricalObservation('gotrade_vt', NOW-timedelta(hours=i), normalized_value('100'),
             'marketstack', 'USD', 'https://api.marketstack.com/v2/eod', NOW) for i in range(120)]
    stored = {}
    calls = []
    def respond(request):
        calls.append(request)
        if request.method == 'POST':
            payload = json.loads(request.content)
            assert len(payload) <= 100
            for row in payload:
                stored.setdefault((row['price_key'], row['observed_at']), row)
            return httpx.Response(201)
        assert len(str(request.url)) < 4096
        keys = re.findall(r'price_key.eq.(\w+),observed_at.eq.([^)]*)', request.url.params['or'])
        assert len(keys) <= 25 and int(request.url.params['limit']) == len(keys)
        return httpx.Response(200, json=[stored[key] for key in keys])
    cache = SharedCache(httpx.Client(transport=httpx.MockTransport(respond)),
                        'https://synthetic.supabase.co', 'sb_secret_synthetic')
    cache.write_history(items, preserve_existing=True)
    assert len(stored) == 120
    assert [r.method for r in calls] == ['POST', 'GET', 'GET', 'GET', 'GET', 'POST', 'GET']
    cache.write_history(items, preserve_existing=True)
    assert len(stored) == 120
