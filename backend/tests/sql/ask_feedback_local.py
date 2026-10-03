"""Synthetic loopback-only feedback JWT/security/concurrency/retention qualification."""
import json,subprocess,uuid,time
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request,urlopen
from urllib.error import HTTPError
import jwt
P=['/opt/homebrew/opt/postgresql@17/bin/psql','-w','-X','-q','-At','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','55448','-U','arbor_requests_test','-d','arbor_ask_feedback_local']
def sql(q,ok=True):
 r=subprocess.run(P+['-c',q],capture_output=True,text=True,timeout=15);assert (r.returncode==0)==ok,r.stderr
 return r.stdout.strip() if ok else r.stderr
assert sql('select current_database()')=='arbor_ask_feedback_local'
assert sql("select current_setting('data_directory')")in['/tmp/arbor-requests-pg','/private/tmp/arbor-requests-pg']
checks=0
A,B,C,SA,SB,SC=[str(uuid.uuid4())for _ in range(6)]
sql(f"insert into auth.users(id,email) values('{A}','ask-a@example.test'),('{B}','ask-b@example.test'),('{C}','ask-c@example.test');insert into auth.sessions(id,user_id,created_at)values('{SA}','{A}',now()),('{SB}','{B}',now()),('{SC}','{C}',now());insert into arbor_private.account_lifecycle(user_id,state)values('{A}','active'),('{B}','active'),('{C}','active');update arbor_private.terms_control set enforcement_enabled=false;")
KEY='arbor-local-request-fixture-only-not-a-hosted-credential'
def claims(o=A,s=SA):
 n=int(time.time());return dict(role='authenticated',aud='authenticated',sub=o,session_id=s,iat=n,exp=n+3600)
def call(name,body=None,c=None,secret=KEY):
 h={'Content-Type':'application/json'}
 if c is not False:h['Authorization']='Bearer '+jwt.encode(c or claims(),secret,algorithm='HS256')
 try:
  with urlopen(Request('http://127.0.0.1:55453/rpc/'+name,data=json.dumps(body or {}).encode(),headers=h),timeout=15)as r:return r.status,json.load(r)
 except HTTPError as e:return e.code,json.load(e)
def expect(v):
 global checks
 assert v;checks+=1
access='arbor_ask_feedback_access_v1';save='arbor_ask_feedback_save_v1'
def vote(id=None,**kwargs):return {'p_id':id or str(uuid.uuid4()),'p_helpful':False,'p_reason':None,'p_intent':'actual_holdings','p_answer_version':'deterministic-ask-1',**kwargs}
sql("create or replace function arbor_private.ask_feedback_enabled()returns boolean language sql stable security invoker set search_path='' as $$select false$$")
expect(call(access)==(200,{'available':False}));expect(call(save,vote())[0]==403)
sql("create or replace function arbor_private.ask_feedback_enabled()returns boolean language sql stable security invoker set search_path='' as $$select true$$")
expect(call(access)==(200,{'available':True}));expect(call(save,vote(),c=False)[0]>=400);expect(call(access,secret='wrong-synthetic-secret-only-123456789012345')[0]==401)
key=str(uuid.uuid4());expect(call(save,vote(key))==(200,{'saved':True,'helpful':False,'reason':None}))
created=sql(f"select created_at from public.arbor_ask_feedback where id='{key}'")
for reason in ['unclear','not_my_question','numbers_look_wrong','missing_detail',None]:expect(call(save,vote(key,p_helpful=True,p_reason=reason))[0]==200)
expect(sql(f"select created_at from public.arbor_ask_feedback where id='{key}'")==created)
expect(call(save,vote(key),c=claims(B,SB))[0]==409);expect(call(save,vote(key,p_intent='education'))[0]==409)
for patch in [{'p_user_id':B},{'p_message':'PRIVATE'},{'p_reason':'PRIVATE'},{'p_intent':'PRIVATE'},{'p_answer_version':'future'},{'p_helpful':None}]:expect(call(save,vote(**patch))[0]>=400)
for role in ['anon','authenticated','service_role']:
 expect(sql(f"select has_table_privilege('{role}','public.arbor_ask_feedback','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')")=='f')
 expect(sql(f"select has_function_privilege('{role}','arbor_private.prune_ask_feedback(integer)','EXECUTE')")=='f')
expect(sql("select count(*) from pg_policy where polrelid='public.arbor_ask_feedback'::regclass")=='0')
expect(sql("select count(*) from information_schema.columns where table_schema='public' and table_name='arbor_ask_feedback'")=='7')
with ThreadPoolExecutor(max_workers=8)as pool:statuses=list(pool.map(lambda _:call(save,vote(),c=claims(B,SB))[0],range(32)))
expect(statuses.count(200)==20 and statuses.count(429)==12)
expect(sql(f"select count(*) from public.arbor_ask_feedback where user_id='{B}'")=='20')
with ThreadPoolExecutor(max_workers=8)as pool:expect(all(x==200 for x in pool.map(lambda _:call(save,vote(key))[0],range(16))))
expect(sql(f"select count(*) from public.arbor_ask_feedback where user_id='{A}'")=='1')
# Global UUID collision across owner locks is denied atomically, not a raw uniqueness error.
collision=str(uuid.uuid4())
with ThreadPoolExecutor(max_workers=2)as pool:
 outcomes=list(pool.map(lambda c:call(save,vote(collision),c=c)[0],[claims(),claims(C,SC)]))
expect(sorted(outcomes)==[200,409])
export=call('arbor_account_export_current_v1')
expect(export[0]==200 and export[1]['account']['id']==A)
expect(len(export[1]['ask_feedback'])in[1,2] and all(set(r)=={'id','helpful','reason','intent','answer_version','created_at'}for r in export[1]['ask_feedback']))
expect(json.loads(sql(f"select arbor_private.erasure_inventory('{A}')"))['arbor_ask_feedback']in[1,2])
for state in ['deactivated','deletion_pending','erasing']:
 sql(f"update arbor_private.account_lifecycle set state='{state}',deactivated_at=case when '{state}'='deactivated' then now() else null end where user_id='{A}'")
 expect(call(save,vote())[0]==403);expect(call(access)==(200,{'available':False}))
sql(f"update arbor_private.account_lifecycle set state='active',deactivated_at=null where user_id='{A}';update arbor_private.terms_control set enforcement_enabled=true")
expect(call(save,vote())[0]==403)
sql(f"update arbor_private.terms_control set enforcement_enabled=false;delete from auth.sessions where id='{SA}'")
expect(call(save,vote())[0]==401)
sql(f"insert into auth.sessions(id,user_id,created_at)values('{SA}','{A}',now());update public.arbor_ask_feedback set created_at=now()-interval '91 days' where id='{key}'")
expect(call(save,vote(key))[0]==409)
# Scoped support hold survives its elapsed dates; another category is not a blanket retention grant.
operation,request=[str(uuid.uuid4())for _ in range(2)]
sql(f"insert into arbor_private.account_erasure_operations(id,owner_id,request_id,request_version,state,verified_at,holds)values('{operation}','{A}','{request}',1,'reviewed',now(),jsonb_build_array(jsonb_build_object('category','support','reason','legal_claim','review_at',now()-interval '2 days','end_at',now()-interval '1 day')))")
expect(sql('select arbor_private.prune_ask_feedback(200)')=='0');expect(sql(f"select count(*) from public.arbor_ask_feedback where id='{key}'")=='1')
sql(f"update arbor_private.account_erasure_operations set holds='[]'::jsonb where id='{operation}'")
expect(sql('select arbor_private.prune_ask_feedback(200)')=='1');expect(sql(f"select count(*) from public.arbor_ask_feedback where id='{key}'")=='0')
# Busy owner lock makes cleanup skip, preserving a concurrent hold-review boundary.
sql(f"update public.arbor_ask_feedback set created_at=now()-interval '91 days' where user_id='{B}'")
locker=subprocess.Popen(P+['-c',f"begin;select pg_advisory_xact_lock(hashtextextended('arbor-account-lifecycle:{B}',0));select pg_sleep(2);commit;"],stdout=subprocess.DEVNULL)
time.sleep(.2);expect(sql('select arbor_private.prune_ask_feedback(200)')=='0');locker.wait(timeout=5)
expect(sql('select arbor_private.prune_ask_feedback(200)')=='20')
# Existing kernel actually erases the new category; other synthetic owners remain.
sql(f"update arbor_private.account_lifecycle set state='erasing' where user_id='{A}';update arbor_private.account_erasure_operations set state='erasing' where id='{operation}'")
result=json.loads(sql(f"select arbor_private.erasure_data('{operation}')"));expect(result['state']=='data_erased');expect(sql(f"select count(*) from public.arbor_ask_feedback where user_id='{A}'")=='0')
sql("create or replace function arbor_private.ask_feedback_enabled()returns boolean language sql stable security invoker set search_path='' as $$select false$$")
expect(call(access)==(200,{'available':False}))
print(json.dumps(dict(defaultClosed=True,checks=checks,realLocalPostgres=True,realJWT=True,concurrentNewVotes=32,admitted=20,concurrentEdits=16,globalUUIDCollisionDenied=True,ownerExportAndErasure=True,retentionDays=90,scopedElapsedHoldRetained=True,busyOwnerPruneSkipped=True,hostedWrites=0)))
