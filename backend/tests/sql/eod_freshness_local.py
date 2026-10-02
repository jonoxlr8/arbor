"""Synthetic PostgreSQL 17 conformance; refuses any non-disposable connection."""
from pathlib import Path
from datetime import datetime,timedelta,time,timezone,date
from types import SimpleNamespace
import json,subprocess,os
from decimal import Decimal
from app.services.reference_freshness import CALENDAR,EASTERN,closed,reference_age_seconds
ROOT=Path(__file__).resolve().parents[2]
ARGS=['/opt/homebrew/bin/psql','-X','-q','-At','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','55472','-U','arbor_eod_test','-d','postgres']
def sql(text,ok=True):
 r=subprocess.run(ARGS+['-c',text],capture_output=True,text=True,timeout=60)
 assert (r.returncode==0)==ok,r.stderr or 'Unexpected success'
 return r.stdout.strip()
assert sql("select current_setting('data_directory')") in ('/tmp/arbor-eod-pg','/private/tmp/arbor-eod-pg')
sql('drop database if exists arbor_eod_fixture');sql('create database arbor_eod_fixture');ARGS[-1]='arbor_eod_fixture'
a,b='00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'
sql(f"do $$begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon;end if;if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated;end if;if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls;end if;end $$;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('{a}'),('{b}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;")
for name in ['3u_b_live_portfolio.sql','20260924070525_3u_b_5_manual_fund_values.sql','20260925114901_toap_nav_ingestion.sql','20260926111500_dated_investment_entries.sql','20260929120000_portfolio_snapshot_recorded_cost.sql']:
 sql((ROOT/'migrations'/name).read_text())
vgt=(ROOT/'migrations/20261002040000_vgt_share_basis.sql').read_text();sql(vgt[:vgt.index('-- Retain the strict original holding view')]+'commit;')
sql("""do $$declare d text;begin d:=pg_get_functiondef('public.arbor_capture_portfolio()'::regprocedure);d:=replace(d,'h.units*price.value','(case when h.product_id=''gotrade_vgt'' then public.arbor_vgt_holding_units(h.id,(now() at time zone ''Asia/Manila'')::date,(price.as_of at time zone ''UTC'')::date,true) else h.units end)*price.value');execute d;end $$;
create schema arbor_private;create function arbor_private.require_active_account() returns void language plpgsql as $$begin if current_setting('fixture.active',true)='false' then raise exception 'account_restricted';end if;end $$;
do $$declare d text;begin d:=pg_get_functiondef('public.arbor_capture_portfolio()'::regprocedure);d:=regexp_replace(d,'\\mbegin\\M','BEGIN'||chr(10)||' PERFORM arbor_private.require_active_account();','i');execute d;end $$;""")
old=sql("select proacl::text from pg_proc where oid='public.arbor_capture_portfolio()'::regprocedure")
sql((ROOT/'migrations/eod_session_freshness_v1.sql').read_text())
assert sql("select proacl::text from pg_proc where oid='public.arbor_capture_portfolio()'::regprocedure")==old
body=sql("select pg_get_functiondef('public.arbor_capture_portfolio()'::regprocedure)")
assert 'require_active_account()' in body and 'arbor_vgt_holding_units' in body and "fx.fetched_at,now()) between 0 and 172800" in body
assert 'price.as_of <= price.fetched_at and price.fetched_at <= now()' in body # fund provenance/freshness path retained
# Ensure generated calendar bytes exactly track the committed single authority.
before=(ROOT/'migrations/eod_session_freshness_v1.sql').read_bytes()
subprocess.run([os.environ.get('PYTHON','/Users/jonoxlr8/Projects/arbor/backend/.venv/bin/python'),str(ROOT/'scripts/generate_eod_freshness_sql.py')],check=True)
assert before==(ROOT/'migrations/eod_session_freshness_v1.sql').read_bytes()

vectors=[];maximum_fresh_wall=0
for offset in range(365):
 day=date(2026,1,1)+timedelta(days=offset)
 if closed(day):continue
 close=datetime.combine(day,time.fromisoformat(CALENDAR['early_closes'].get(day.isoformat(),'16:00')),EASTERN).astimezone(timezone.utc)
 for hour in range(169):
  now=close+timedelta(hours=hour)
  price=SimpleNamespace(price_key='gotrade_vt',as_of=datetime.combine(day,time(),timezone.utc),source='marketstack',kind='etf_eod',currency='USD',verified=True,fetched_at=close)
  age=reference_age_seconds(price,now)
  if age is not None and age<=172800:maximum_fresh_wall=max(maximum_fresh_wall,hour)
 for key in CALENDAR['products']:
  for seconds in [-1,0,3600,86400,172800,172801,345600,345601,432000,604800,604801]:
   now=close+timedelta(seconds=seconds)
   price=SimpleNamespace(price_key=key,as_of=datetime.combine(day,time(),timezone.utc),source='marketstack',kind='etf_eod',currency='USD',verified=True,fetched_at=close)
   vectors.append({'key':key,'observed':price.as_of.isoformat(),'source':price.source,'kind':price.kind,'currency':price.currency,'verified':True,'fetched':close.isoformat(),'now':now.isoformat(),'expected':reference_age_seconds(price,now)})
assert maximum_fresh_wall==120,maximum_fresh_wall # 48h + longest verified closure block (72h)
# Additional conservative fallbacks and corrupt/future cases.
for changes in [{'key':'unknown'},{'source':'unknown'},{'kind':'intraday'},{'verified':False},{'observed':'2026-09-07T00:00:00Z'},{'observed':'2026-10-03T00:00:00Z'},{'fetched':'2026-09-30T19:59:59Z'},{'fetched':'2026-10-03T00:00:00Z'},{'observed':'2027-01-01T00:00:00Z','fetched':'2027-01-04T00:00:00Z','now':'2027-01-04T00:00:00Z'},{'key':'usd_php','source':'exchangerate_api','kind':'fx','currency':'PHP'}]:
 v={'key':'gotrade_vt','observed':'2026-09-30T00:00:00Z','source':'marketstack','kind':'etf_eod','currency':'USD','verified':True,'fetched':'2026-10-02T03:25:11Z','now':'2026-10-02T07:19:18Z',**changes}
 p=SimpleNamespace(price_key=v['key'],as_of=datetime.fromisoformat(v['observed']),source=v['source'],kind=v['kind'],currency=v['currency'],verified=v['verified'],fetched_at=datetime.fromisoformat(v['fetched']))
 v['expected']=reference_age_seconds(p,datetime.fromisoformat(v['now']));vectors.append(v)
# A temp file avoids OS argument limits; contains synthetic calendar tests only.
path=Path('/tmp/arbor-eod-conformance.sql')
payload=json.dumps(vectors,separators=(',',':')).replace("'","''")
path.write_text("with cases as (select * from jsonb_to_recordset('"+payload+"'::jsonb) as v(key text,observed timestamptz,source text,kind text,currency text,verified boolean,fetched timestamptz,now timestamptz,expected numeric)) select count(*) from cases where public.arbor_reference_age_seconds(key,observed,source,kind,currency,verified,fetched,now) is distinct from expected;")
for zone in ('UTC','Pacific/Auckland','America/Los_Angeles'):
 r=subprocess.run(ARGS+['-c',f"set timezone='{zone}'",'-f',str(path)],capture_output=True,text=True,timeout=60);assert r.returncode==0,r.stderr;assert r.stdout.strip()=='0',r.stdout
# Fixed observed diagnosis is eligible; FX remains independently blocking.
assert Decimal(sql("select public.arbor_reference_age_seconds('gotrade_vt','2026-09-30T00:00:00Z','marketstack','etf_eod','USD',true,'2026-10-02T03:25:11Z','2026-10-02T07:19:18Z')"))==127158
sql("begin;set local role anon;select public.arbor_reference_age_seconds('gotrade_vt',now(),'marketstack','etf_eod','USD',true,now(),now());rollback",False)
# Capture uses same classifier, retains owner/lifecycle/fund/FX/VGT boundaries.
# Synthetic fixture dates chosen from the frozen diagnosis; all prices are fake100.
sql("insert into arbor_market_prices(price_key,value,as_of,fetched_at,source,currency,kind,verified) values('gotrade_vt',100,'2026-09-30T00:00:00Z',now(),'marketstack','USD','etf_eod',true),('gotrade_vgt',100,'2026-09-30T00:00:00Z',now(),'marketstack','USD','etf_eod',true),('usd_php',50,'2026-10-01T00:02:31Z',now(),'exchangerate_api','PHP','fx',true)")
sql(f"insert into arbor_portfolio_holdings(user_id,product_id,provider,units,opening_units,opening_share_basis,cost_basis_php) values('{a}','gotrade_vt','gotrade',1,1,null,5000),('{a}','gotrade_vgt','gotrade',1,1,'after_split',5000)")
# Freeze only the test copy of capture's current clock; production function keeps now().
sql("do $$declare d text;begin d:=pg_get_functiondef('public.arbor_capture_portfolio()'::regprocedure);d:=replace(d,'now()',$clock$TIMESTAMPTZ '2026-10-02T07:19:18Z'$clock$);execute d;end $$;")
# fetched_at fixed to the same synthetic frozen clock for classifier consistency.
sql("update arbor_market_prices set fetched_at='2026-10-02T03:25:11Z'")
def owner(id,text,ok=True):return sql(f"begin;set local request.jwt.claim.sub='{id}';set local role authenticated;{text};commit",ok)
assert owner(a,'select arbor_capture_portfolio()')=='t'
assert owner(a,'select value_php from arbor_portfolio_snapshots')=='10000.00'
assert owner(b,'select count(*) from arbor_portfolio_snapshots')=='0'
owner(a,"set local fixture.active='false';select arbor_capture_portfolio()",False)
sql("delete from arbor_portfolio_snapshots;update arbor_market_prices set fetched_at='2026-10-03T00:00:00Z' where price_key='usd_php'")
assert owner(a,'select arbor_capture_portfolio()')=='f'
sql("update arbor_market_prices set fetched_at='2026-10-02T03:25:11Z' where price_key='usd_php'")
sql("delete from arbor_portfolio_snapshots;update arbor_market_prices set as_of='2026-09-29T00:00:00Z' where price_key='usd_php'")
assert owner(a,'select arbor_capture_portfolio()')=='f'
assert sql('select count(*) from arbor_portfolio_snapshots')=='0'
print(json.dumps({'postgres':17,'python_sql_vectors':len(vectors),'mismatches':0,'maximum_planning_wall_hours_2026':maximum_fresh_wall,'outer_wall_cap_hours':168,'capture_owner_lifecycle_vgt_preserved':True,'stale_fx_blocks_capture':True,'raw_prices_dates_not_rewritten':True,'hosted_writes':0}))
