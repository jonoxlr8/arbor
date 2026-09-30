"""Real localhost PostgREST JWT tests using invented accounts and fixture signing data.

Requires the disposable PostgreSQL fixture and a temporary PostgREST instance.
Never loads application environment files, real credentials or hosted origins.
"""
import json
import os
import subprocess
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import jwt

assert os.environ.get('ARBOR_LOCAL_EXPORT_TEST') == '1'
assert os.environ.get('PGHOST') == '127.0.0.1' and os.environ.get('PGPORT') == '55433'
assert os.environ.get('PGUSER') == 'arbor_export_test' and os.environ.get('PGDATABASE') == 'postgres'
ORIGIN = 'http://127.0.0.1:55434'
requests_made = 0
FIXTURE_SECRET = 'arbor-synthetic-local-test-only-not-a-hosted-credential'
ARGS = ['psql', '-w', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
        '-h', '127.0.0.1', '-p', '55433', '-U', 'arbor_export_test', '-d', 'postgres']


def sql(query, ok=True):
    r = subprocess.run(ARGS + ['-c', query], capture_output=True, text=True, timeout=20)
    assert (r.returncode == 0) == ok, r.stderr
    return r.stdout.strip() if ok else r.stderr


assert sql("select current_setting('data_directory')") in ['/tmp/arbor-export-pg', '/private/tmp/arbor-export-pg']
# Match Supabase's current and legacy claim lookup in this synthetic Auth fixture.
sql("CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$")
A, B, S, T = [str(uuid.uuid4()) for _ in range(4)]
sql(f"insert into auth.users(id,email) values('{A}','jwt-a@example.test'),('{B}','jwt-b@example.test');"
    f"insert into auth.sessions(id,user_id) values('{S}','{A}'),('{T}','{B}');"
    f"insert into holdings(user_id,ticker,quantity) values('{A}','OWN',1.23),('{B}','OTHER',9);")


def claims(owner=A, session=S):
    now = int(time.time())
    return {'sub': owner, 'session_id': session, 'role': 'authenticated',
            'aud': 'authenticated', 'iat': now, 'exp': now + 600}


def request(payload=None, params=None, name='arbor_account_export_current_v1', timeout=15, secret=FIXTURE_SECRET, method='POST', extra_headers=None, reset_rate=True):
    global requests_made
    # Independent security cases reset ONLY their invented account's cooldown.
    if reset_rate and payload is not None and payload.get('sub') in (A,B):
        sql(f"delete from arbor_private.account_export_cooldowns where user_id='{payload['sub']}'")
    requests_made += 1
    headers = {'Content-Type': 'application/json'}
    if payload is not None:
        headers['Authorization'] = 'Bearer ' + jwt.encode(payload, secret, algorithm='HS256')
    headers.update(extra_headers or {})
    req = Request(ORIGIN + '/rpc/' + name, data=json.dumps(params or {}).encode() if method=='POST' else None, headers=headers, method=method)
    try:
        with urlopen(req, timeout=timeout) as response:
            if response.status==200:
                assert response.headers.get('Cache-Control')=='private, no-store'
                assert response.headers.get('X-Content-Type-Options')=='nosniff'
            return response.status, json.load(response)
    except HTTPError as error:
        return error.code, json.load(error)


def valid():
    status, data = request(claims())
    assert status == 200, data
    assert data['account']['id'] == A and data['complete'] is True
    assert all(r['ticker'] != 'OTHER' for r in data['legacy_holdings'])
    return data


context=json.dumps(claims()).replace("'", "''")
assert 'export_reauthentication_required' in sql("set role authenticated;select public.arbor_account_export_current_v1()",False)
assert 'export_reauthentication_required' in sql(f"set role authenticated;set request.jwt.claim.sub='{B}';set request.jwt.claims='{context}';select public.arbor_account_export_current_v1()",False)
assert sql("select has_function_privilege('authenticated','public.arbor_account_export_v1(uuid,uuid)','EXECUTE')")=='f'
assert sql("select has_function_privilege('service_role','public.arbor_account_export_current_v1()','EXECUTE')")=='f'
assert sql("select proconfig @> array['search_path=\"\"'] from pg_proc where oid='public.arbor_account_export_current_v1()'::regprocedure")=='t'
spoof=json.loads(sql(f"begin;create temp table profiles(user_id uuid,full_name text);set search_path=pg_temp,public;set role authenticated;set request.jwt.claims='{context}';select public.arbor_account_export_current_v1()::text;rollback;"))
assert spoof['account']['id']==A
assert 'permission denied' in sql(f"begin;alter function public.arbor_account_export_current_v1() owner to arbor_export_denied_owner;set role authenticated;set request.jwt.claims='{context}';select public.arbor_account_export_current_v1();",False)
valid()
assert request(claims(),method='GET')[0]==405
assert request(claims(),extra_headers={'request.jwt.claim.sub':B})[1]['account']['id']==A
assert request()[0] == 401
assert request(claims(), secret='wrong-synthetic-signing-key-not-production')[0] == 401
assert request({**claims(), 'exp': int(time.time()) - 100})[0] == 401
for change in ({'sub': 'bad'}, {'session_id': 'bad'}, {'session_id': str(uuid.uuid4())},
               {'sub': B}, {'iat': int(time.time()) + 100}, {'role': 'anon'},
               {'role': 'service_role'}, {'aud': 'wrong'}, {'iat': '123'}, {'exp':'99999999999'}):
    assert request({**claims(), **change})[0] >= 400
for key in ('sub', 'session_id', 'iat', 'exp', 'aud', 'role'):
    c = claims(); del c[key]
    assert request(c)[0] >= 400
assert request({**claims(), 'aud': ['authenticated']})[0] == 200
assert request({**claims(), 'user_metadata': {'sub': B, 'session_id': T}})[1]['account']['id'] == A
assert request(claims(), params={'p_verified_owner': B})[0] == 404
assert request(claims(), params={'p_verified_owner': B, 'p_verified_session': T}, name='arbor_account_export_v1')[0] == 403
status, other = request(claims(B, T))
assert status == 200 and other['account']['id'] == B
assert [r['ticker'] for r in other['legacy_holdings']] == ['OTHER']

for update in ("created_at=null", "created_at=now()-interval '16 minutes'",
               "created_at=now()+interval '1 minute'", "not_after=now()-interval '1 minute'"):
    sql(f"update auth.sessions set {update} where id='{S}'")
    assert request(claims())[1]['message'] == 'export_reauthentication_required'
    sql(f"update auth.sessions set created_at=now(),not_after=null where id='{S}'")
valid()

# The future quota source is not required and is not created by this migration.
sql('alter table public.arbor_ask_usage_monthly rename to arbor_export_usage_fixture')
try:
    data = valid()
    assert data['ask_usage'] == [] and data['source_availability']['ask_usage'] == 'table_absent'
finally:
    sql('alter table public.arbor_export_usage_fixture rename to arbor_ask_usage_monthly')
sql(f"insert into public.arbor_ask_usage_monthly(user_id,period,successful_count) values('{A}','2026-09-01',2),('{B}','2026-09-01',3)")
assert valid()['ask_usage'] == [{'period': '2026-09-01', 'successful_count': '2'}]
sql('alter table public.arbor_ask_usage_monthly rename column successful_count to broken')
try:
    status, error = request(claims())
    assert status == 503 and error['message'] == 'export_unavailable'
    assert request(claims(),reset_rate=False)[0]==429
finally:
    sql('alter table public.arbor_ask_usage_monthly rename column broken to successful_count')

sql(f"insert into profiles(user_id,full_name,country,currency,strategy_engine_version,v2_inputs) values('{A}','old','Philippines','PHP','2.0','{{\"emergency_savings\":\"ready\",\"high_interest_debt\":\"none\",\"horizon\":\"ten_plus_years\",\"risk_response\":\"hold\",\"plan_state\":{{\"revision_nonce\":\"omit-me\"}}}}')")
assert 'revision_nonce' not in json.dumps(valid())
sql(f"update profiles set v2_inputs=v2_inputs||'{{\"saved_preferences\":{{\"secret\":\"fixture\"}}}}' where user_id='{A}'")
assert request(claims())[1]['message'] == 'export_unavailable'
sql(f"update profiles set v2_inputs=v2_inputs-'saved_preferences' where user_id='{A}'")

# Freshness cannot be bypassed by choosing an owner parameter, refreshing iat, or metadata.
# Advisory locks control concurrency even when callers skip Arbor's HTTP route.
def held(query, check):
    with ThreadPoolExecutor() as pool:
        future = pool.submit(sql, 'begin;' + query + ';select pg_sleep(2);commit;')
        time.sleep(.25)
        check()
        future.result()


def assert_busy():
    status, error = request(claims())
    assert status == 429 and error['message'] == 'export_busy'


held(f"select pg_advisory_xact_lock(hashtextextended('arbor-account-export:{A}',0))", assert_busy)
held('select pg_advisory_xact_lock(-184920731,0);select pg_advisory_xact_lock(-184920731,1)', assert_busy)
with ThreadPoolExecutor() as pool:
    writer = pool.submit(sql, f"begin;lock table public.profiles in access exclusive mode;"
                        f"update profiles set full_name='new' where user_id='{A}';"
                        f"update holdings set asset_name='new' where user_id='{A}';select pg_sleep(1);commit;")
    time.sleep(.2)
    old = valid()
    assert old['profile'][0]['full_name'] == 'old' and old['legacy_holdings'][0]['asset_name'] is None
    writer.result()
assert valid()['profile'][0]['full_name'] == 'new'

sql(f"insert into holdings(user_id,ticker,quantity) select '{A}','BOUND'||i,1 from generate_series(1,10000)i")
assert request(claims())[1]['message'] == 'export_too_large'
sql(f"delete from holdings where user_id='{A}' and ticker='BOUND1'")
assert len(valid()['legacy_holdings']) == 10000
sql(f"delete from holdings where user_id='{A}' and ticker like 'BOUND%';update profiles set full_name=repeat('x',70000) where user_id='{A}'")
assert request(claims())[1]['message'] == 'export_oversized_record'
sql(f"update profiles set full_name='Synthetic' where user_id='{A}'")
sql(f"insert into holdings(user_id,ticker,quantity,asset_name) select '{A}','BYTES'||i,1,repeat('x',22000) from generate_series(1,1001)i")
assert request(claims())[1]['message'] == 'export_too_large'
sql(f"delete from holdings where user_id='{A}' and ticker like 'BYTES%'")

with ThreadPoolExecutor() as pool:
    lock = pool.submit(sql, 'begin;lock table public.holdings in access exclusive mode;select pg_sleep(10);commit;')
    time.sleep(.2)
    start = time.monotonic(); status, error = request(claims()); duration = time.monotonic()-start
    assert status == 504 and error['code'] == 'PT504', (status, error, duration)
    assert 7 < duration < 10, duration
    assert request(claims(),reset_rate=False)[0]==429
    lock.result()

with ThreadPoolExecutor() as pool:
    lock = pool.submit(sql, 'begin;lock table public.holdings in access exclusive mode;select pg_sleep(2);commit;')
    time.sleep(.2)
    try:
        request(claims(), timeout=.2)
        raise AssertionError('Expected client timeout')
    except TimeoutError:
        pass
    time.sleep(.2)
    active_after_abort=int(sql("select count(*) from pg_stat_activity where pid<>pg_backend_pid() and state='active' and query like '%arbor_account_export_current_v1%';"))
    lock.result()
assert int(sql("select count(*) from pg_stat_activity where pid<>pg_backend_pid() and state='active' and query like '%arbor_account_export_current_v1%';"))==0
print(f'REST observations: blocked-query cancellation {duration:.3f}s; active export queries shortly after client abort={active_after_abort}; none after blocker release.')

assert request(claims(),reset_rate=False)[0]==429
# Persistent authority: independently connected callers cannot bypass cooldown.
sql(f"delete from arbor_private.account_export_cooldowns where user_id in ('{A}','{B}')")
status, data = request(claims(),reset_rate=False)
assert status==200 and len(data['export_operational_metadata'])==1
until=sql(f"select cooldown_until::text from arbor_private.account_export_cooldowns where user_id='{A}'")
for _ in range(5):
    assert request(claims(),reset_rate=False)[0]==429
assert sql(f"select cooldown_until::text from arbor_private.account_export_cooldowns where user_id='{A}'")==until
assert request(claims(B,T),reset_rate=False)[0]==200
assert sql(f"select count(*) from arbor_private.account_export_cooldowns where user_id in ('{A}','{B}')")=='2'
sql(f"update arbor_private.account_export_cooldowns set cooldown_until=now()-interval '1 second' where user_id='{A}'")
assert request(claims(),reset_rate=False)[0]==200
# Failed authorized work must commit admission, not open a retry loophole.
sql(f"delete from arbor_private.account_export_cooldowns where user_id='{A}';update profiles set full_name=repeat('x',70000) where user_id='{A}'")
assert request(claims(),reset_rate=False)[0]==413
assert request(claims(),reset_rate=False)[0]==429
sql(f"update profiles set full_name='Synthetic' where user_id='{A}';delete from arbor_private.account_export_cooldowns where user_id='{A}'")
# Caller rollback preference is rejected before expensive work or collection.
assert request(claims(),reset_rate=False,extra_headers={'Prefer':'tx=rollback'})[0]==400
assert sql(f"select count(*) from arbor_private.account_export_cooldowns where user_id='{A}'")=='0'
# Independent simultaneous requests share the same DB admission state.
with ThreadPoolExecutor() as pool:
    results=list(pool.map(lambda _:request(claims(),reset_rate=False)[0],range(4)))
assert results.count(200)==1 and results.count(429)==3,results
# Stale/deleted-session claims never create a rate row.
for session in (str(uuid.uuid4()),):
    sql(f"delete from arbor_private.account_export_cooldowns where user_id='{A}'")
    assert request(claims(session=session),reset_rate=False)[0]>=400
    assert sql(f"select count(*) from arbor_private.account_export_cooldowns where user_id='{A}'")=='0'
sql(f"update auth.sessions set created_at=now()-interval '16 minutes' where id='{S}'")
assert request(claims(),reset_rate=False)[0]>=400
assert sql(f"select count(*) from arbor_private.account_export_cooldowns where user_id='{A}'")=='0'
sql(f"update auth.sessions set created_at=now() where id='{S}'")
# No app-role table/purge access. One timestamp, no append-only history.
assert 'permission denied' in sql('set role authenticated;select * from arbor_private.account_export_cooldowns',False)
assert 'permission denied' in sql('set role authenticated;select arbor_private.purge_account_export_cooldowns()',False)
assert sql("select has_table_privilege('service_role','arbor_private.account_export_cooldowns','SELECT')")=='f'
# Full transaction rollback cannot preserve admission; direct SQL is trusted-admin only.
sql(f"delete from arbor_private.account_export_cooldowns where user_id='{A}'")
sql(f"begin;set role authenticated;set request.jwt.claims='{context}';select public.arbor_account_export_current_v1();rollback;")
assert sql(f"select count(*) from arbor_private.account_export_cooldowns where user_id='{A}'")=='0'
# Missing protection storage must never fall back to an unthrottled export.
sql('alter table arbor_private.account_export_cooldowns rename to cooldown_fixture_hidden')
try:
    status, error=request(claims(),reset_rate=False)
    assert status>=400 and 'account' not in error
finally:
    sql('alter table arbor_private.cooldown_fixture_hidden rename to account_export_cooldowns')
# Physical cleanup is bounded and skips active rows; no scheduled caller enabled.
sql("with users as(insert into auth.users(id,email) select gen_random_uuid(),'purge-fixture-'||i||'@example.test' from generate_series(1,1200)i returning id) insert into arbor_private.account_export_cooldowns select id,now()-interval '1 second' from users")
assert sql('select arbor_private.purge_account_export_cooldowns()')=='1000'
assert int(sql("select count(*) from arbor_private.account_export_cooldowns where cooldown_until<now()"))>=200
sql('select arbor_private.purge_account_export_cooldowns()')
assert sql("select count(*) from arbor_private.account_export_cooldowns where cooldown_until<now()")=='0'
print('PASS: actual localhost PostgREST JWT and direct-RPC security, persistent per-owner cooldown, five sequential429s, independent/concurrent callers one200/three429s, no cross-owner cooldown, failed413 admission persists, rollback preference rejection, stale/missing sessions collect nothing, private metadata/purger denial and bounded1000-row cleanup.')
print('LIMIT: full transaction aborts roll back admission; physical expiry needs an approved periodic cleanup caller. No production job enabled.')
print(f'Actual local HTTP requests exercised: {requests_made}.')
