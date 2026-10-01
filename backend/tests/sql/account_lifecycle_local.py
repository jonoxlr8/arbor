"""Loopback-only real PostgreSQL/PostgREST lifecycle tests. No environment secrets."""
import json,os,subprocess,time,uuid
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request,urlopen
from urllib.error import HTTPError
import jwt
assert os.environ.get('ARBOR_LOCAL_LIFECYCLE_TEST')=='1'
for k,v in {'PGHOST':'127.0.0.1','PGPORT':'55433','PGUSER':'arbor_export_test','PGDATABASE':'arbor_lifecycle_qualification'}.items():assert os.environ.get(k)==v
ARGS=['psql','-w','-X','-q','-At','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','55433','-U','arbor_export_test','-d','arbor_lifecycle_qualification']
SECRET='arbor-synthetic-local-test-only-not-a-hosted-credential';ORIGIN='http://127.0.0.1:55435';calls=0

def sql(q,ok=True):
 r=subprocess.run(ARGS+['-c',q],capture_output=True,text=True,timeout=20);assert (r.returncode==0)==ok,r.stderr
 return r.stdout.strip() if ok else r.stderr
assert sql("select current_setting('data_directory')") in ('/tmp/arbor-export-pg','/private/tmp/arbor-export-pg')
A,B,S,T=[str(uuid.uuid4()) for _ in range(4)]
sql(f"insert into auth.users(id,email) values('{A}','closure-a@example.test'),('{B}','closure-b@example.test');insert into auth.sessions(id,user_id,created_at) values('{S}','{A}',now()),('{T}','{B}',now());insert into holdings(user_id,ticker,quantity) values('{A}','CLOSE-A',12),('{B}','KEEP-B',34);")
before=sql(f"select to_jsonb(h)::text from holdings h where user_id='{B}'")
def claims(owner=None,session=None):
 now=int(time.time());return {'sub':owner or A,'session_id':session or S,'role':'authenticated','aud':'authenticated','iat':now,'exp':now+3600}
def request(path='/rpc/arbor_account_lifecycle_v1',params=None,c=None,method='POST',secret=SECRET,headers=None,timeout=12):
 global calls
 calls+=1;h={'Content-Type':'application/json',**(headers or {})}
 if c is not False:h['Authorization']='Bearer '+jwt.encode(claims() if c is None else c,secret,algorithm='HS256')
 try:
  with urlopen(Request(ORIGIN+path,data=json.dumps(params or {}).encode() if method!='GET' else None,headers=h,method=method),timeout=timeout) as r:
   raw=r.read();return r.status,json.loads(raw) if raw else None
 except HTTPError as e:return e.code,json.load(e)
def status(c=None):
 code,data=request(params={'p_action':'status'},c=c);assert code==200,(code,data);return data
def action(name,v,i=None,c=None):
 time.sleep(1.05)
 return request(params={'p_action':name,'p_expected_version':v,'p_action_id':i or str(uuid.uuid4()),'p_confirm':True},c=c)
def fresh():
 global S
 S=str(uuid.uuid4());sql(f"insert into auth.sessions(id,user_id,created_at) values('{S}','{A}',clock_timestamp())")
assert status()['access_allowed']
assert request(c=False)[0]==401
assert request(secret='wrong-synthetic-signing-key-at-least-32-bytes')[0]==401
for change in ({'sub':B},{'session_id':T},{'session_id':str(uuid.uuid4())},{'role':'anon'},{'exp':0},{'iat':int(time.time())+100}):assert request(c={**claims(),**change})[0]>=400
assert request(params={'p_action':'status','p_owner':B})[0]==404
assert request(params={'p_action':'deactivate','p_expected_version':0})[0]==400
assert request(headers={'Prefer':'tx=rollback'})[0]==400
for edit in ('created_at=null',"created_at=clock_timestamp()+interval '1 minute'","not_after=clock_timestamp()-interval '1 second'"):
 sql(f"update auth.sessions set {edit} where id='{S}'");assert request()[0]==401
 sql(f"update auth.sessions set created_at=clock_timestamp(),not_after=null where id='{S}'")
sql(f"update auth.sessions set created_at=now()-interval '16 minutes' where id='{S}'")
assert action('deactivate',0)[0]==403 and status()['access_allowed']
sql(f"update auth.sessions set created_at=clock_timestamp() where id='{S}'")
D,H=[str(uuid.uuid4()) for _ in range(2)]
sql("insert into arbor_portfolio_products(product_id,provider,price_key) values('gotrade_vt','gotrade','gotrade_vt') on conflict do nothing")
sql(f"insert into arbor_pending_recording_reminders(id,user_id,lease_until) values('{D}','{A}',now()+interval '5 minutes');insert into arbor_pending_investment_recordings(id,user_id,product_id,provider,started_at,reminder_delivery_id) values('{H}','{A}','gotrade_vt','gotrade',now()-interval '2 days','{D}');")
ident=str(uuid.uuid4());code,closed=action('deactivate',0,ident)
assert code==200 and closed['state']=='deactivated' and not closed['access_allowed'],(code,closed)
assert action('deactivate',0,ident)[1]['version']==1
assert action('request_deletion',0,ident)[0]==409
assert request(params={'p_action':'login'})[0]==403
for table in ('holdings','profiles','arbor_portfolio_holdings','arbor_investment_entries','arbor_portfolio_snapshots','arbor_monthly_checkins','arbor_pending_investment_recordings'):assert request('/'+table,method='GET')[1]==[],table
assert request('/holdings',{'user_id':A,'ticker':'BLOCKED','quantity':1})[0]>=400
for name,params in [('arbor_record_investment',{'p_product_id':'gotrade_vt','p_provider':'gotrade','p_investment_date':'2026-09-30','p_units':1,'p_amount_paid_php':100,'p_idempotency_key':str(uuid.uuid4())}),('arbor_capture_portfolio',{}),('arbor_monthly_checkin',{}),('arbor_reconstructed_portfolio_history',{})]:
 code,error=request('/rpc/'+name,params);assert code==403,(name,code,error)
for name,params in [
 ('arbor_revise_investment',{'p_entry_id':str(uuid.uuid4()),'p_expected_revision':1,'p_investment_date':'2026-09-30','p_units':1,'p_amount_paid_php':100,'p_void':False}),
 ('arbor_correct_opening_position',{'p_holding_id':str(uuid.uuid4()),'p_expected_updated_at':'2026-09-30T00:00:00Z','p_opening_units':1,'p_opening_cost_php':100}),
 ('arbor_start_pending_recording',{'p_product_id':'gotrade_vt','p_provider':'gotrade'}),
 ('arbor_resolve_pending_recording',{'p_id':str(uuid.uuid4()),'p_resolution':'dismissed'}),
]:
 code,error=request('/rpc/'+name,params);assert code==403,(name,code,error)
context=json.dumps(claims()).replace("'","''")
assert 'account_restricted' in sql(f"set role authenticated;set request.jwt.claims='{context}';select arbor_private.monthly_checkin('read',null,null)",False)
assert sql(f"select closure_suppressed_at is not null and stopped_at is not null from arbor_pending_recording_reminders where id='{D}'")=='t'
assert status(claims(B,T))['state']=='active'
assert request('/holdings',c=claims(B,T),method='GET')[1][0]['ticker']=='KEEP-B'
sql(f"delete from arbor_private.account_export_cooldowns where user_id='{A}'")
code,data=request('/rpc/arbor_account_export_current_v1');assert code==200,(code,data)
assert data['account']['id']==A and data['account_lifecycle'][0]['state']=='deactivated'
assert data['pending_recordings'][0]['closure_suppressed_at'] is not None and 'last_action_id' not in json.dumps(data)
fresh();code,reopened=request(params={'p_action':'login'});assert code==200 and reopened['access_allowed'],(code,reopened)
assert sql(f"select closure_suppressed_at is not null from arbor_pending_investment_recordings where id='{H}'")=='t'
old=sql(f"select id from auth.sessions where user_id='{A}' order by created_at limit 1")
assert not status(claims(A,old))['access_allowed']
code,pending=action('request_deletion',reopened['version']);assert code==200 and pending['state']=='deletion_pending'
assert request(params={'p_action':'request_deletion','p_expected_version':pending['version'],'p_action_id':str(uuid.uuid4()),'p_confirm':True})[0]==429
fresh();assert request(params={'p_action':'login'})[1]['state']=='deletion_pending'
assert status()['deletion_request']['id']==pending['deletion_request']['id']
assert action('deactivate',pending['version'])[0]==409
code,returned=action('cancel_deletion',pending['version']);assert code==200 and returned['access_allowed'] and returned['deletion_request'] is None,(code,returned)
assert action('cancel_deletion',returned['version'])[0]==409
with ThreadPoolExecutor() as pool:results=list(pool.map(lambda name:action(name,returned['version']),('deactivate','request_deletion')))
assert sorted(x[0] for x in results)==[200,409],results
st=status();fresh()
if st['state']=='deletion_pending':assert action('cancel_deletion',st['version'])[0]==200
else:assert request(params={'p_action':'login'})[1]['access_allowed']
# Shared owner admission stays held until transaction end. A close waits
# for existing owner work; sleeps occur only in this disposable fixture.
with ThreadPoolExecutor() as pool:
 held=pool.submit(sql,f"begin;select pg_advisory_xact_lock_shared(hashtextextended('arbor-account-lifecycle:{A}',0));select pg_sleep(1.5);commit;")
 time.sleep(.15)
 started=time.monotonic();closed_wait=action('deactivate',status()['version']);elapsed=time.monotonic()-started
 assert closed_wait[0]==200 and elapsed>=1.05,(closed_wait,elapsed)
 held.result()
fresh();assert request(params={'p_action':'login'})[1]['access_allowed']
sql('alter table arbor_ask_usage_monthly rename to lifecycle_usage_fixture')
try:
 sql(f"delete from arbor_private.account_export_cooldowns where user_id='{A}'")
 code,data=request('/rpc/arbor_account_export_current_v1')
 assert code==200 and data['source_availability']['ask_usage']=='table_absent' and data['ask_usage']==[]
finally:sql('alter table lifecycle_usage_fixture rename to arbor_ask_usage_monthly')
sql(f"update arbor_pending_recording_reminders set stopped_at=null,closure_suppressed_at=null,attempt_count=1,first_attempt_at=now() where id='{D}'")
code,closed=action('deactivate',status()['version']);assert code==200 and closed['in_flight_reminders']==1
assert sql(f"set role service_role;select public.arbor_prepare_pending_recording_reminder('{D}',(select claim_token from arbor_pending_recording_reminders where id='{D}'),repeat('a',64))")=='f'
assert sql(f"set role service_role;select public.arbor_finish_pending_recording_reminder('{D}',(select claim_token from arbor_pending_recording_reminders where id='{D}'),'sent','synthetic-provider-id')")=='t'
assert status()['in_flight_reminders']==0
assert sql("select has_function_privilege('authenticated','public.arbor_reminders_allowed_v1(uuid)','EXECUTE')")=='f'
assert 'permission denied' in sql('set role authenticated;select * from arbor_private.account_lifecycle',False)
assert sql("select bool_and(proconfig @> array['search_path=\"\"']) from pg_proc where proname like '%lifecycle%' and pronamespace in ('public'::regnamespace,'arbor_private'::regnamespace)")=='t'
sql(f"update arbor_private.account_lifecycle set state='erasing' where user_id='{A}'")
fresh();assert request(params={'p_action':'login'})[0]==409
assert action('cancel_deletion',status()['version'])[0]==409
sql(f"delete from arbor_private.account_export_cooldowns where user_id='{A}'")
assert request('/rpc/arbor_account_export_current_v1')[0]==403
assert sql(f"select to_jsonb(h)::text from holdings h where user_id='{B}'")==before
assert sql("select confdeltype from pg_constraint where conrelid='arbor_investment_entries'::regclass and confrelid='auth.users'::regclass")=='r'
print(json.dumps({'http_requests':calls,'synthetic_only':True,'hosted_changes':0,'passed':['JWT/session/recent-auth','RLS/direct writes','guarded financial RPCs','owner isolation','idempotence/version race','old-token reopen denial','explicit cancellation','reminder admission/finish','export lifecycle coverage','erasure boundary/no deletion','unchanged B/ledger RESTRICT']}))
