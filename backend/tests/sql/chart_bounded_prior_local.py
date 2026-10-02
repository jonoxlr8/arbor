"""Actual SQL qualification; refuses every target except a disposable loopback DB."""
import json, os, subprocess, uuid, time
assert os.environ.get("ARBOR_LOCAL_CHART_TEST") == "1"
P=["/opt/homebrew/opt/postgresql@17/bin/psql","-w","-X","-q","-At","-v","ON_ERROR_STOP=1","-h","127.0.0.1","-p","55433","-U","arbor_export_test","-d","arbor_chart_carry_review"]
def sql(q):
 r=subprocess.run(P+["-c",q],capture_output=True,text=True,timeout=30)
 assert r.returncode==0,r.stderr
 return r.stdout.strip()
assert sql("select current_database()") == "arbor_chart_carry_review"
assert sql("select current_setting('data_directory')") in ("/tmp/arbor-export-pg","/private/tmp/arbor-export-pg")
u=str(uuid.uuid4()); email="chart-"+u+"@example.test"
d=json.loads(sql("select public.arbor_terms_current_v1()"))
token=json.loads(sql(f"select public.arbor_terms_signup_intent_v1('{email}','{d['version']}','{d['digest']}',true)"))["intent_token"]
sql(f"insert into auth.users(id,email,raw_user_meta_data) values('{u}','{email}','{{\"arbor_terms_intent\":\"{token}\"}}'); insert into auth.sessions(id,user_id,created_at) values('{u}','{u}',now())")
claims=json.dumps(dict(sub=u,session_id=u,role="authenticated",aud="authenticated",iat=int(time.time()),exp=int(time.time())+3600))
owner=f"set local request.jwt.claims='{claims}';set local request.jwt.claim.sub='{u}';"
sql(f"begin;{owner}set local role authenticated;select public.arbor_record_investment_with_share_basis('gotrade_vgt','gotrade','2025-12-29',1,100,'{uuid.uuid4()}',null,null,false,'before_split');commit")
def observation(key,day,value,source):
 return f"('{key}','{day}T21:00:00Z','{day}',{value},'{source}','{'PHP' if source=='bsp' else 'USD'}','https://example.test/saved-observation','2026-10-01T00:00:00Z')"
checks=0

def point(day, price_day, price, fx_day, fx, expected):
 global checks
 values=[]
 if price_day: values.append(observation('gotrade_vgt',price_day,price,'marketstack'))
 if fx_day: values.append(observation('usd_php',fx_day,fx,'bsp'))
 seed="insert into public.arbor_historical_market_observations(price_key,observed_at,observation_date,value,source,currency,provenance,fetched_at) values "+','.join(values)+";" if values else ""
 q=f"begin;delete from public.arbor_historical_market_observations;delete from public.arbor_historical_nonpublishing_days;{seed}{owner}set local role authenticated;select coalesce(jsonb_agg(p),'[]') from public.arbor_reconstructed_portfolio_history() p where p->>'day'='{day}';rollback"
 rows=json.loads(sql(q));checks+=1
 if expected is None: assert rows==[],(day,rows);return
 assert len(rows)==1,(day,rows)
 p=rows[0];assert p['value_php']==expected,(day,p)
 assert p['recorded_cost_php']=='100.00'
 dates={x['price_key']:x['observation_date'] for x in p['source_dates']}
 assert dates=={'gotrade_vgt':price_day,'usd_php':fx_day},dates
 assert all(x['valuation_date']==day for x in p['source_dates'])

# Four quarantined VGT observations: use only the actual saved positive predecessor.
for day,prior,price in [('2026-06-04','2026-06-03','123.91'),('2026-06-09','2026-06-08','117.25'),('2026-06-10','2026-06-08','117.25'),('2026-06-15','2026-06-12','116.74')]:
 from decimal import Decimal
 point(day,prior,price,day,'50',f"{Decimal(price)*8*50:.2f}")
# Nine official same-day FX gaps. Saved verified prior rate remains dated as observed.
for day,prior,rate in [('2025-12-30','2025-12-29','58.805'),('2025-12-31','2025-12-29','58.805'),('2026-02-17','2026-02-16','58.059'),('2026-03-20','2026-03-19','59.562'),('2026-04-02','2026-04-01','60.678'),('2026-04-09','2026-04-08','60.206'),('2026-05-01','2026-04-30','61.506'),('2026-05-27','2026-05-26','61.437'),('2026-06-12','2026-06-11','61.497')]:
 from decimal import Decimal
 factor=1 if day<'2026-04-21' else 8
 point(day,day,'100',prior,rate,f"{Decimal(rate)*factor*100:.2f}")
# Boundary, missing predecessor, future-only, weekend, missing weekday and split quote basis.
point('2026-06-12','2026-06-08','100','2026-06-08','50','40000.00')
point('2026-06-13','2026-06-08','100','2026-06-13','50',None)
point('2026-06-13','2026-06-13','100','2026-06-08','50',None)
point('2026-06-12',None,'100','2026-06-12','50',None)
point('2026-06-12','2026-06-15','100','2026-06-12','50',None)
point('2026-06-13','2026-06-12','100','2026-06-12','50','40000.00')
point('2026-04-21','2026-04-20','809.13','2026-04-20','50','40456.50')
point('2026-04-22','2026-04-21','101.02','2026-04-21','50','40408.00')
assert sql("select has_function_privilege('anon','public.arbor_reconstructed_portfolio_history(integer,integer)','EXECUTE')")=='f'
print(json.dumps({'valuation_cases_passed':checks,'four_VGT_gaps':True,'nine_FX_gaps':True,'four_day_boundary':True,'no_prior_or_future_fill':True,'split_quote_basis_preserved':True,'cost_unchanged':True,'hosted_writes':0}))
