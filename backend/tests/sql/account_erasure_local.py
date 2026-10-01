"""Actual local SQL + synthetic provider-adapter qualification; never hosted."""
import json, os, subprocess, time, uuid
import jwt
from urllib.request import Request,urlopen
from urllib.error import HTTPError
from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor
from app.services.account_erasure import Approval, advance
assert os.environ.get('ARBOR_LOCAL_ERASURE_TEST')=='1'
ARGS=['psql','-w','-X','-q','-At','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','55433','-U','arbor_export_test','-d','arbor_lifecycle_qualification']
checks=0
http_calls=0
def rpc(owner,session,name,params=None):
    global http_calls
    http_calls+=1
    now=int(time.time())
    token=jwt.encode({"sub":owner,"session_id":session,"role":"authenticated","aud":"authenticated","iat":now,"exp":now+3600},"arbor-synthetic-local-test-only-not-a-hosted-credential",algorithm="HS256")
    request=Request("http://127.0.0.1:55435/rpc/"+name,data=json.dumps(params or {}).encode(),headers={"Content-Type":"application/json","Authorization":"Bearer "+token})
    try:
        with urlopen(request,timeout=10) as r:return r.status,json.load(r)
    except HTTPError as e:return e.code,json.load(e)
def sql(query,ok=True):
    global checks
    checks+=1
    r=subprocess.run(ARGS+['-c',query],capture_output=True,text=True,timeout=15)
    assert (r.returncode==0)==ok,r.stderr
    return r.stdout.strip() if ok else r.stderr
assert sql("select current_setting('data_directory')") in ('/tmp/arbor-export-pg','/private/tmp/arbor-export-pg')
assert sql('select current_database()')=='arbor_lifecycle_qualification'
def fixture():
    owner,sid,request=[str(uuid.uuid4()) for _ in range(3)]
    sql(f"insert into auth.users(id,email) values('{owner}','erase-fixture@example.test');insert into auth.sessions(id,user_id,created_at) values('{sid}','{owner}',now());insert into holdings(user_id,ticker,quantity) values('{owner}','SYNTHETIC',5);insert into profiles(user_id,full_name,country) values('{owner}','Synthetic owner','Philippines');insert into arbor_private.account_lifecycle(user_id,state,version) values('{owner}','deletion_pending',1);insert into arbor_private.account_deletion_requests(user_id,request_id,status,requested_at) values('{owner}','{request}','pending',now());")
    return owner,sid,request
A,S,Q=fixture();B,T,R=fixture();operation=str(uuid.uuid4())
other=sql(f"select to_jsonb(h)::text from holdings h where user_id='{B}'")
# Insert actual ledger/holdings/pending dependencies, all invented.
H,D,P=[str(uuid.uuid4()) for _ in range(3)]
sql("insert into arbor_portfolio_products(product_id,provider,price_key) values('gotrade_vt','gotrade','gotrade_vt') on conflict do nothing")
# Temporarily active to create fixture through the same guard, then restore pending.
sql(f"update arbor_private.account_lifecycle set state='active' where user_id='{A}';insert into arbor_portfolio_holdings(id,user_id,product_id,provider,units,cost_basis_php,opening_units,opening_cost_php) values('{H}','{A}','gotrade_vt','gotrade',2,200,1,100);insert into arbor_investment_entries(user_id,holding_id,idempotency_key,payload_digest,investment_date,units,amount_paid_php) values('{A}','{H}','{uuid.uuid4()}','{'a'*64}','2026-09-01',1,100);insert into arbor_portfolio_snapshots(user_id,day,value_php) values('{A}','2026-09-01',200);insert into arbor_monthly_checkins(user_id,month,amount_php,completed_at) values('{A}','2026-09-01',100,now());insert into arbor_ask_usage_monthly(user_id,period,successful_count) values('{A}','2026-09-01',2);update arbor_private.account_lifecycle set state='deletion_pending' where user_id='{A}';insert into arbor_pending_recording_reminders(id,user_id,lease_until,stopped_at) values('{D}','{A}',now(),now());insert into arbor_pending_investment_recordings(id,user_id,product_id,provider,reminder_delivery_id) values('{P}','{A}','gotrade_vt','gotrade','{D}');")
assert 'foreign key' in sql(f"delete from auth.users where id='{A}'",False)
review=f"select arbor_private.erasure_review('{A}','{Q}',1,'{operation}',true)"
assert json.loads(sql(review))['state']=='reviewed'
code,status=rpc(A,S,'arbor_account_lifecycle_v1');assert code==200 and status['processing']['state']=='reviewed'
sql(f"delete from arbor_private.account_export_cooldowns where user_id='{A}'")
code,exported=rpc(A,S,'arbor_account_export_current_v1');assert code==200 and len(exported['erasure_operations'])==1 and 'counts' not in exported['erasure_operations'][0]
assert 'erasure_request_changed' in sql(f"select arbor_private.erasure_review('{B}','{Q}',1,'{uuid.uuid4()}',true)",False)
# Private metadata/functions must be unavailable to every app role, including service.
for role in ['anon','authenticated','service_role']:
    assert sql(f"select has_function_privilege('{role}','arbor_private.erasure_data(uuid)','EXECUTE')")=='f'
    assert 'permission denied' in sql(f"set role {role};select * from arbor_private.account_erasure_operations",False)
    assert 'permission denied' in sql(f"set role {role};select arbor_private.erasure_begin('{operation}')",False)
assert sql("select bool_and(not prosecdef and proconfig @> array['search_path=\"\"']) from pg_proc where pronamespace='arbor_private'::regnamespace and proname like 'erasure_%'")=='t'
# Holds require reason and bounded review date, never an unbounded blanket audit flag.
hold=json.dumps([{'category':'ledger','reason':'legal_claim','review_at':(datetime.now(timezone.utc)+timedelta(days=10)).isoformat(),'end_at':(datetime.now(timezone.utc)+timedelta(days=20)).isoformat()}])
sql(f"select arbor_private.erasure_review('{A}','{Q}',1,'{operation}',true,'{hold}')")
assert 'erasure_held' in sql(f"select arbor_private.erasure_begin('{operation}')",False)
invalid=hold.replace('legal_claim','audit_forever')
assert 'erasure_hold_invalid' in sql(f"select arbor_private.erasure_review('{A}','{Q}',1,'{operation}',true,'{invalid}')",False)
sql(review)
# Uncertain reminder outcome blocks irreversible admission.
sql(f"update arbor_pending_recording_reminders set attempt_count=1,first_attempt_at=now(),stopped_at=null where id='{D}'")
assert 'erasure_delivery_outcome_unresolved' in sql(f"select arbor_private.erasure_begin('{operation}')",False)
sql(f"update arbor_pending_recording_reminders set stopped_at=now() where id='{D}'")
class Store:
    def read(self,key):
        row=json.loads(sql(f"select to_jsonb(o) from arbor_private.account_erasure_operations o where id='{key}'"))
        row['id']=uuid.UUID(row['id']);row['owner_id']=uuid.UUID(row['owner_id']);return row
    def call(self,name,o):sql(f"select arbor_private.{name}('{o['id']}')");return self.read(o['id'])
    def begin(self,o):return self.call('erasure_begin',o)
    def erase_data(self,o):return self.call('erasure_data',o)
    def mark_auth_erased(self,o):return self.call('erasure_auth_confirm',o)
    def complete(self,o):
        sql(f"select arbor_private.erasure_finish('{o['id']}','pending_copies')")
        return self.read(o['id'])
class SyntheticProviders:
    """No network/Auth API credentials. Only these newly generated local owners."""
    def __init__(self):self.storage={A:['fake-object']};self.fail_storage=True;self.calls=[]
    def revoke_sessions(self,owner):
        assert str(owner)==A;self.calls.append('revoke');sql(f"delete from auth.sessions where user_id='{A}'")
    def erase_storage(self,owner):
        assert str(owner)==A;self.calls.append('storage')
        if self.fail_storage:raise RuntimeError('synthetic timeout')
        self.storage[A]=[]
    def delete_auth(self,owner):
        assert str(owner)==A and self.storage[A]==[];self.calls.append('auth');sql(f"delete from auth.users where id='{A}'")
    def auth_absent(self,owner):return sql(f"select not exists(select 1 from auth.users where id='{A}')")=='t'
    def assess_external_copies(self,owner):return True
store=Store();providers=SyntheticProviders()
def advance_phase(phase):
    current=store.read(uuid.UUID(operation))
    return advance(store,providers,current['id'],Approval(current['id'],current['owner_id'],phase,datetime.now(timezone.utc)+timedelta(minutes=5)))
assert advance_phase('begin')['state']=='erasing'
assert rpc(A,S,'arbor_account_lifecycle_v1')[0]==401
F=str(uuid.uuid4());sql(f"insert into auth.sessions(id,user_id,created_at) values('{F}','{A}',clock_timestamp())")
time.sleep(1.05)
assert rpc(A,F,'arbor_account_lifecycle_v1',{'p_action':'cancel_deletion','p_expected_version':2,'p_action_id':str(uuid.uuid4()),'p_confirm':True})[0]==409
assert rpc(A,F,'arbor_account_export_current_v1')[0]==403
assert sql(f"select state from arbor_private.account_lifecycle where user_id='{A}'")=='erasing'
try:advance_phase('data');raise AssertionError('expected synthetic timeout')
except RuntimeError:pass
assert store.read(operation)['state']=='erasing' and sql(f"select count(*) from arbor_investment_entries where user_id='{A}'")=='1'
# Direct context spoof by app role cannot bypass the guard or invoke erasure.
assert 'permission denied' in sql(f"set role authenticated;set arbor.erasure_owner='{A}';select arbor_private.erasure_data('{operation}')",False)
providers.fail_storage=False
assert advance_phase('data')['state']=='data_erased'
assert sql(f"select count(*) from arbor_investment_entries where user_id='{A}'")=='0'
assert sql(f"select state from arbor_private.account_lifecycle where user_id='{A}'")=='erasing'
assert 'erasure_auth_still_present' in sql(f"select arbor_private.erasure_auth_confirm('{operation}')",False)
assert json.loads(sql(f"select arbor_private.erasure_data('{operation}')"))['state']=='data_erased'
assert advance_phase('auth')['state']=='auth_erased'
assert sql(f"select count(*) from arbor_private.account_lifecycle where user_id='{A}'")=='0'
assert sql(f"select count(*) from arbor_private.account_deletion_requests where user_id='{A}'")=='0'
assert advance_phase('complete')['state']=='completed'
receipt=json.loads(sql(f"select arbor_private.erasure_finish('{operation}','pending_copies')"))
assert receipt['active_system_data_erased'] and not receipt['whole_account_erasure_claim']
assert sql(f"select to_jsonb(h)::text from holdings h where user_id='{B}'")==other
assert sql("select count(*) from arbor_portfolio_products where product_id='gotrade_vt'")=='1'
assert sql("select confdeltype from pg_constraint where conrelid='arbor_investment_entries'::regclass and confrelid='auth.users'::regclass")=='r'
# Optional schema absence is legitimate, but actual schema/access errors fail closed.
sql('alter table arbor_ask_usage_monthly rename to erasure_usage_fixture')
try:assert json.loads(sql(f"select arbor_private.erasure_inventory('{B}')"))['arbor_ask_usage_monthly'] is None
finally:sql('alter table erasure_usage_fixture rename to arbor_ask_usage_monthly')
sql('alter table holdings rename to erasure_holdings_fixture')
try:assert 'erasure_schema_incompatible' in sql(f"select arbor_private.erasure_inventory('{B}')",False)
finally:sql('alter table erasure_holdings_fixture rename to holdings')
# Cancel winning first invalidates the reviewed version. Erasing winning rejects cancellation.
C,U,V=fixture();O=str(uuid.uuid4())
sql(f"select arbor_private.erasure_review('{C}','{V}',1,'{O}',true);update arbor_private.account_lifecycle set state='active',version=2 where user_id='{C}';update arbor_private.account_deletion_requests set status='withdrawn',withdrawn_at=now() where user_id='{C}'")
assert 'erasure_request_changed' in sql(f"select arbor_private.erasure_begin('{O}')",False)
# Actual transaction failure restores deleted rows and journal phase.
E,ES,EQ=fixture();EO=str(uuid.uuid4())
sql(f"select arbor_private.erasure_review('{E}','{EQ}',1,'{EO}',true);select arbor_private.erasure_begin('{EO}')")
assert 'division by zero' in sql(f"begin;select arbor_private.erasure_data('{EO}');select 1/0;commit",False)
assert sql(f"select count(*) from holdings where user_id='{E}'")=='1'
assert sql(f"select state from arbor_private.account_erasure_operations where id='{EO}'")=='erasing'
# Statement cancellation rolls back work; the durable admission remains erasing.
with ThreadPoolExecutor() as pool:
    held=pool.submit(sql,f"begin;select pg_advisory_xact_lock(hashtextextended('arbor-account-lifecycle:{E}',0));select pg_sleep(0.4);commit")
    time.sleep(.1)
    assert 'statement timeout' in sql(f"set statement_timeout='50ms';select arbor_private.erasure_data('{EO}')",False)
    held.result()
assert sql(f"select state from arbor_private.account_erasure_operations where id='{EO}'")=='erasing'
assert sql(f"select count(*) from holdings where user_id='{E}'")=='1'
# Owner locking prevents close/cancel and erasure interleaving; second owner unaffected.
with ThreadPoolExecutor() as pool:
    held=pool.submit(sql,f"begin;select pg_advisory_xact_lock(hashtextextended('arbor-account-lifecycle:{E}',0));select pg_sleep(0.5);commit")
    time.sleep(.1);start=time.monotonic();sql(f"select arbor_private.erasure_data('{EO}')");assert time.monotonic()-start>=.25;held.result()
# Retention prunes details after terminal+30d; marker keeps pending task from re-admission.
RD,RP=[str(uuid.uuid4()) for _ in range(2)]
sql(f"insert into arbor_pending_recording_reminders(id,user_id,lease_until,sent_at,first_attempt_at) values('{RD}','{B}',now(),now()-interval '31 days',now()-interval '31 days');insert into arbor_pending_investment_recordings(id,user_id,product_id,provider,started_at,reminder_delivery_id,reminder_sent_at) values('{RP}','{B}','gotrade_vt','gotrade',now()-interval '40 days','{RD}',now()-interval '31 days')")
assert 'retention_limit_invalid' in sql('select arbor_private.erasure_retention(501)',False)
sql('select arbor_private.erasure_retention(100)')
assert sql(f"select reminder_delivery_id is null and reminder_metadata_pruned_at is not null and reminder_sent_at is not null from arbor_pending_investment_recordings where id='{RP}'")=='t'
assert sql(f"select count(*) from arbor_pending_recording_reminders where id='{RD}'")=='0'
assert sql(f"select count(*) from arbor_private.account_erasure_operations where id='{operation}'")=='1'
# Restoring a removed identity cannot turn missing lifecycle into active access.
RE=str(uuid.uuid4());sql(f"insert into auth.users(id,email) values('{A}','restored-synthetic@example.test');insert into auth.sessions(id,user_id,created_at) values('{RE}','{A}',now())")
assert rpc(A,RE,'arbor_account_active_v1')[1] is False
assert rpc(A,RE,'arbor_account_export_current_v1')[0]==403
assert sql(f"select arbor_reminders_allowed_v1('{A}')")=='f'
sql(f"delete from auth.sessions where user_id='{A}';delete from auth.users where id='{A}'")
sql(f"update arbor_private.account_erasure_operations set receipt_expires_at=now()-interval '1 day' where id='{operation}'")
sql(f"select arbor_private.erasure_update_holds('{operation}','{hold}')")
sql('select arbor_private.erasure_retention(100)')
assert sql(f"select count(*) from arbor_private.account_erasure_operations where id='{operation}'")=='1'
sql(f"select arbor_private.erasure_update_holds('{operation}','[]')")
sql('select arbor_private.erasure_retention(100)')
assert sql(f"select count(*) from arbor_private.account_erasure_operations where id='{operation}'")=='0'
BIG,BS,BQ=fixture()
sql(f"update arbor_private.account_lifecycle set state='active' where user_id='{BIG}';insert into holdings(user_id,ticker,quantity) select '{BIG}', 'BOUND-'||g::text,1 from generate_series(1,10001) g")
assert 'erasure_manual_large_account_review_required' in sql(f"select arbor_private.erasure_inventory('{BIG}')",False)
assert sql(f"select count(*) from holdings where user_id='{BIG}'")=='10002'
print(json.dumps({'local_sql_checks':checks,'actual_postgrest_requests':http_calls,'synthetic_only':True,'provider_api':'synthetic adapters only','passed':['private ACL','invoker/search_path','ledger dependency order','durable restriction until Auth cascade','owner isolation/shared product preservation','scoped holds','uncertain reminder and provider failure','phase approval/idempotency','transaction rollback','owner locking','optional usage compatibility','retention marker/receipt expiry'],'hosted_actions':0}))
