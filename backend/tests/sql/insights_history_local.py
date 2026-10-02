"""Fresh loopback PostgreSQL 17 with synthetic fixtures; never hosted."""
import json,subprocess
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
ROOT=Path(__file__).resolve().parents[2]
ARGS=['/opt/homebrew/bin/psql','-X','-q','-At','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','55471','-U','arbor_insights_test','-d','postgres']
def sql(text,ok=True):
 r=subprocess.run(ARGS+['-c',text],capture_output=True,text=True,timeout=20)
 assert (r.returncode==0)==ok,r.stderr or 'Unexpected permission success'
 return r.stdout.strip()
assert sql("select current_setting('data_directory')") in ('/tmp/arbor-insights-pg','/private/tmp/arbor-insights-pg')
sql('drop database if exists arbor_insights_fixture');sql('create database arbor_insights_fixture');ARGS[-1]='arbor_insights_fixture'
a,b='00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'
sql(f"""do $$begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon;end if;if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated;end if;if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls;end if;end $$;create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated;insert into auth.users values('{a}'),('{b}');
create table profiles(user_id uuid primary key references auth.users(id) on delete cascade,strategy_engine_version text,full_name text,country text,currency text,goal_target numeric,current_portfolio_value numeric,monthly_investment numeric,v2_inputs jsonb);
alter table profiles enable row level security;grant select,insert,update on profiles to authenticated;
create policy profile_owner on profiles to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
insert into profiles values('{a}','2.0','Synthetic','Philippines','PHP',null,0,5000,'{{"plan_state":{{"revision_nonce":"0"}}}}'),('{b}','2.0','Synthetic','Philippines','PHP',null,0,null,'{{}}');""")
for name in ['3u_b_live_portfolio.sql','20260924070525_3u_b_5_manual_fund_values.sql','20260925114901_toap_nav_ingestion.sql','20260926111500_dated_investment_entries.sql','20260929120000_portfolio_snapshot_recorded_cost.sql']:
 sql((ROOT/'migrations'/name).read_text())
vgt=(ROOT/'migrations/20261002040000_vgt_share_basis.sql').read_text()
sql(vgt[:vgt.index('-- Retain the strict original holding view')]+"commit;")
sql("""do $$declare d text;begin d:=pg_get_functiondef('public.arbor_capture_portfolio()'::regprocedure);
d:=replace(d,'h.units*price.value','(case when h.product_id=''gotrade_vgt'' then public.arbor_vgt_holding_units(h.id,(now() at time zone ''Asia/Manila'')::date,(price.as_of at time zone ''UTC'')::date,true) else h.units end)*price.value');execute d;end $$;""")
sql("create function public.arbor_account_active_v1() returns boolean language sql stable as $$select coalesce(current_setting('fixture.active',true),'true')<>'false'$$;create schema arbor_private;create function public.arbor_account_export_v1(uuid,uuid) returns jsonb language plpgsql as $$declare result jsonb;item jsonb;p_verified_owner alias for $1;begin result:=jsonb_build_object('snapshots','[]'::jsonb);FOR item IN SELECT jsonb_build_object('captured_at',to_jsonb(t)->>'captured_at') FROM public.arbor_portfolio_snapshots t WHERE user_id=p_verified_owner LOOP result:=jsonb_set(result,'{snapshots}',(result->'snapshots')||jsonb_build_array(item));END LOOP;RETURN result;end $$;")
source=(ROOT/'migrations/account_export_v1.sql').read_text()
helper=source[source.index('CREATE OR REPLACE FUNCTION arbor_private.export_project_json'):]
helper=helper[:helper.index('END $$;')+len('END $$;')]
sql(helper)
sql('revoke all on function public.arbor_account_export_v1(uuid,uuid) from public,anon,authenticated;grant execute on function public.arbor_account_export_v1(uuid,uuid) to service_role')
acl=sql("select proacl::text from pg_proc where oid='public.arbor_account_export_v1(uuid,uuid)'::regprocedure")
sql(f"insert into arbor_portfolio_snapshots(user_id,day,value_php,captured_at) values('{a}',current_date-10,100,now()-interval '10 days')")
sql((ROOT/'migrations/insights_history_v1.sql').read_text())
assert sql('select allocation_values is null from arbor_portfolio_snapshots')=='t'
assert sql("select proacl::text from pg_proc where oid='public.arbor_account_export_v1(uuid,uuid)'::regprocedure")==acl
def owner(id,text,ok=True):return sql(f"begin;set local request.jwt.claim.sub='{id}';set local role authenticated;{text};commit",ok)
month=sql("select to_char(clock_timestamp() at time zone 'Asia/Manila','YYYY-MM')")
assert owner(a,'select amount_php from arbor_budget_versions')=='5000'
assert owner(b,'select amount_php is null from arbor_budget_versions')=='t'
assert owner(a,"set local fixture.active='false';select count(*) from arbor_plan_versions")=='0'
for statement in ["update arbor_budget_versions set amount_php=99","delete from arbor_plan_versions",f"insert into arbor_budget_versions values('{a}','2000-01-01',1,now())"]:owner(a,statement,False)
sql('begin;set local role anon;select * from arbor_budget_versions;rollback',False)
for amount in [3000,2000]:owner(a,f"update profiles set monthly_investment={amount} where user_id='{a}'")
assert owner(a,'select count(*),min(amount_php) from arbor_budget_versions')=='1|2000'
assert owner(a,'select count(*) from arbor_plan_versions')=='1'
sql(f"insert into arbor_budget_versions values('{a}',date_trunc('month',now())::date-interval '1 month',7000,now())")
owner(a,f"set local timezone='America/Los_Angeles';update profiles set monthly_investment=1000 where user_id='{a}'")
assert owner(a,'select amount_php from arbor_budget_versions order by month')=='7000\n1000'
def race(amount):return owner(a,f"update profiles set monthly_investment={amount},v2_inputs='{{\"plan_state\":{{\"revision_nonce\":\"race\"}}}}' where user_id='{a}' and v2_inputs->'plan_state'->>'revision_nonce'='0' returning monthly_investment")
with ThreadPoolExecutor(2) as ex:results=list(ex.map(race,[4000,6000]))
assert sum(bool(r) for r in results)==1,results
assert owner(a,f"select amount_php from arbor_budget_versions where month='{month}-01'")==next(r for r in results if r)
assert owner(b,'select amount_php is null from arbor_budget_versions')=='t'
sql("insert into arbor_market_prices(price_key,value,as_of,source,currency,kind,verified) values('gotrade_vt',100,now(),'marketstack','USD','etf_eod',true),('gotrade_vgt',100,now(),'marketstack','USD','etf_eod',true),('usd_php',50,now(),'exchangerate_api','PHP','fx',true)")
owner(a,"insert into arbor_portfolio_holdings(product_id,provider,units,cost_basis_php) values('gotrade_vt','gotrade',2,10000)")
sql(f"insert into arbor_portfolio_holdings(user_id,product_id,provider,units,opening_units,cost_basis_php) values('{a}','gotrade_vgt','gotrade',2,2,10000)")
assert owner(a,'select arbor_capture_portfolio()')=='f' # unknown opening share basis
sql(f"update arbor_portfolio_holdings set opening_share_basis='before_split' where user_id='{a}' and product_id='gotrade_vgt'")
assert owner(a,'select arbor_capture_portfolio()')=='t'
observed=json.loads(owner(a,'select allocation_values from arbor_portfolio_snapshots where day=current_date'))
assert {v['product_id']:v['value_php'] for v in observed}=={'gotrade_vt':'10000.00','gotrade_vgt':'80000.00'}
owner(a,"update arbor_portfolio_snapshots set allocation_values='[]'",False)
export=json.loads(sql(f"select public.arbor_account_export_v1('{a}','{a}')"))
assert len(export['budget_versions'])==2 and export['plan_versions']
assert 'revision_nonce' not in json.dumps(export)
owner(a,f"select public.arbor_account_export_v1('{a}','{a}')",False)
sql(f"delete from profiles where user_id='{a}'")
assert sql(f"select count(*) from arbor_budget_versions where user_id='{a}'")=='0'
assert sql(f"select count(*) from arbor_plan_versions where user_id='{a}'")=='0'
assert owner(b,'select count(*) from arbor_plan_versions')=='1'
print(json.dumps({'postgres':17,'synthetic_only':True,'repeated_edits':True,'closed_month_preserved':True,'owner_isolation':True,'writes_denied':True,'concurrent_CAS_one_winner':True,'atomic_capture':True,'cascade_erasure':True,'hosted_writes':0}))
