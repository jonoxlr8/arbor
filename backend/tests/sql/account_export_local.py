"""Disposable localhost-only PostgreSQL export qualification; no hosted credentials."""
import json,os,subprocess,time,uuid
from concurrent.futures import ThreadPoolExecutor
assert os.environ.get('ARBOR_LOCAL_EXPORT_TEST')=='1'
assert os.environ.get('PGHOST')=='127.0.0.1' and os.environ.get('PGPORT')=='55433'
assert os.environ.get('PGUSER')=='arbor_export_test' and os.environ.get('PGDATABASE')=='postgres'
args=['psql','-w','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','55433','-U','arbor_export_test','-d','postgres']
def sql(s,ok=True):
 r=subprocess.run(args+['-c',s],capture_output=True,text=True,timeout=15)
 if ok:assert r.returncode==0,r.stderr
 else:assert r.returncode!=0,'unexpected success'
 return r.stdout.strip() if ok else r.stderr
assert sql("select current_setting('data_directory')") in ['/tmp/arbor-export-pg','/private/tmp/arbor-export-pg']
sql('alter table auth.sessions add column if not exists not_after timestamptz;revoke all on schema arbor_private from service_role;revoke all on auth.sessions from service_role;')
A,B,S,T=[str(uuid.uuid4()) for _ in range(4)]
sql(f"insert into auth.users(id,email) values('{A}','synthetic-a@example.test'),('{B}','synthetic-b@example.test');insert into auth.sessions(id,user_id) values('{S}','{A}'),('{T}','{B}');")
def call(a=A,s=S):return f"select public.arbor_account_export_v1('{a}','{s}')::text"
def export(a=A,s=S):return json.loads(sql('set role service_role;'+call(a,s)))
assert export()['account']['id']==A
for role in ['anon','authenticated']:
 assert 'permission denied' in sql('set role '+role+';'+call(),False)
assert 'export_reauthentication_required' in sql('set role service_role;'+call(A,T),False)
sql(f"update auth.sessions set created_at=now()-interval '16 minutes' where id='{S}'")
assert 'export_reauthentication_required' in sql('set role service_role;'+call(),False)
sql(f"update auth.sessions set created_at=now() where id='{S}'")
# Hosted-layout compatibility: nullable session timestamps, no private-schema usage or Auth SELECT.
assert sql("select has_schema_privilege('service_role','arbor_private','USAGE')")=='f'
assert 'permission denied' in sql('set role service_role;select created_at from auth.sessions',False)
assert 'permission denied' in sql("set role service_role;select arbor_private.export_project_json(null,'{}',0)",False)
for update in ("created_at=null", "created_at=now()+interval '1 minute'", "not_after=now()-interval '1 minute'"):
 sql(f"update auth.sessions set {update} where id='{S}'")
 assert 'export_reauthentication_required' in sql('set role service_role;'+call(),False)
 sql(f"update auth.sessions set created_at=now(),not_after=null where id='{S}'")
assert export()['source_availability']['ask_usage']=='table_present'
sql(f"insert into public.arbor_ask_usage_monthly(user_id,period,successful_count) values('{A}','2026-09-01',2),('{B}','2026-09-01',3)")
assert export()['ask_usage']==[{'period':'2026-09-01','successful_count':'2'}]
# Missing optional table is explicit; this does not claim data was never collected.
absent=json.loads(sql('begin;drop table public.arbor_ask_usage_monthly;set role service_role;'+call()+';rollback;'))
assert absent['ask_usage']==[] and absent['source_availability']['ask_usage']=='table_absent'
assert 'successful_count' in sql('begin;alter table public.arbor_ask_usage_monthly rename column successful_count to broken;set role service_role;'+call(),False)
# Unprivileged definer owner fails closed, rather than granting service-role table access.
sql("do $$ begin if not exists(select 1 from pg_roles where rolname='arbor_export_denied_owner') then create role arbor_export_denied_owner nologin;end if;end $$")
assert 'permission denied' in sql('begin;alter function public.arbor_account_export_v1(uuid,uuid) owner to arbor_export_denied_owner;set role service_role;'+call(),False)
spoof=json.loads(sql('begin;create temp table profiles(user_id uuid,full_name text);set search_path=pg_temp,public;set role service_role;'+call()+';rollback;'))
assert spoof['account']['id']==A
assert sql("select bool_and(proconfig @> array['search_path=\"\"']) from pg_proc where oid in ('public.arbor_account_export_v1(uuid,uuid)'::regprocedure,'arbor_private.export_project_json(jsonb,jsonb,integer)'::regprocedure)")=='t'
sql(f"insert into holdings(user_id,ticker,quantity,average_cost) select '{A}','DEMO'||i,0.123456789012,10 from generate_series(1,1001)i;insert into holdings(user_id,ticker,quantity) values('{B}','OTHER',999);")
r=export();assert len(r['legacy_holdings'])==1001 and all(x['ticker']!='OTHER' for x in r['legacy_holdings']);assert r['legacy_holdings'][0]['quantity']=='0.123456789012'
sql(f"insert into profiles(user_id,full_name,country,currency,strategy_engine_version,v2_inputs) values('{A}','Synthetic','Philippines','PHP','2.0','{{\"emergency_savings\":\"ready\",\"high_interest_debt\":\"none\",\"horizon\":\"ten_plus_years\",\"risk_response\":\"hold\",\"plan_state\":{{\"revision_nonce\":\"internal\",\"historical_plan\":null}}}}')")
r=export();assert 'revision_nonce' not in json.dumps(r)
sql(f"update profiles set v2_inputs=v2_inputs || '{{\"saved_preferences\":{{\"password\":\"injected\"}}}}' where user_id='{A}'")
assert 'export_unknown_nested_field' in sql('set role service_role;'+call(),False)
sql(f"update profiles set v2_inputs=v2_inputs-'saved_preferences',full_name='old' where user_id='{A}';update holdings set asset_name='old' where user_id='{A}';")
# One statement snapshot begins before wait; writer changes two sections in one transaction.
with ThreadPoolExecutor() as pool:
 future=pool.submit(sql,'set role service_role;with wait as materialized (select pg_sleep(1)) '+call().replace('select public','select public',1)+' from wait')
 time.sleep(.3)
 sql(f"begin;update profiles set full_name='new' where user_id='{A}';update holdings set asset_name='new' where user_id='{A}';commit;")
 old=json.loads(future.result());assert old['profile'][0]['full_name']=='old' and all(x['asset_name']=='old' for x in old['legacy_holdings'])
assert export()['profile'][0]['full_name']=='new'
sql(f"insert into holdings(user_id,ticker,quantity) select '{A}','BOUND'||i,1 from generate_series(1,9000)i")
assert 'export_too_large' in sql('set role service_role;'+call(),False)
sql(f"delete from holdings where user_id='{A}' and ticker='BOUND1'")
assert len(export()['legacy_holdings'])==10000
sql(f"delete from holdings where user_id='{A}' and ticker like 'BOUND%';update profiles set full_name=repeat('x',70000) where user_id='{A}'")
assert 'export_oversized_record' in sql('set role service_role;'+call(),False)
sql(f"update profiles set full_name='Synthetic' where user_id='{A}'")
sql(f"update holdings set asset_name=repeat('x',22000) where user_id='{A}'")
assert 'export_too_large' in sql('set role service_role;'+call(),False)
sql(f"update holdings set asset_name='Synthetic' where user_id='{A}'")
before=sql(f"select count(*) from holdings where user_id='{B}'")
first=export();second=export();assert first['legacy_holdings']==second['legacy_holdings']
assert sql(f"select count(*) from holdings where user_id='{B}'")==before
# Top-level cancellation bounds a blocked SQL call. Function-level timeout is separately noted.
with ThreadPoolExecutor() as pool:
 lock=pool.submit(sql,'begin;lock table public.holdings in access exclusive mode;select pg_sleep(2);commit;')
 time.sleep(.2)
 err=sql("set statement_timeout='200ms';set role service_role;"+call(),False)
 assert 'statement timeout' in err
 lock.result()
print('Hosted-layout checks passed: optional usage absent/present, cross-owner usage exclusion, malformed usage schema denial, service-role Auth/private helper denial with successful definer export, unprivileged owner denial, null/future creation and expired expiry rejection, null expiry permitted, search-path spoof rejection.')
print('SQL qualification passed: empty export, denied direct roles, session/owner pairing and age, 1001 exact rows, nested secret denial/nonce omission, concurrent snapshot, 10000 accepted/10001 rejected, 20MiB rejection, oversized record, repeat read/no B mutation, blocked-query cancellation.')
print('This script qualifies the PostgreSQL kernel. Companion account_export_jwt_local.py qualifies local PostgREST; hosted REST behavior remains separately gated.')
