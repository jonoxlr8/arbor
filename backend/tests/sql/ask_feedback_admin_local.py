"""Owned synthetic loopback database only: read projection, role/session gates."""
import json,subprocess,uuid,time,jwt
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request,urlopen
from urllib.error import HTTPError
P=['/opt/homebrew/opt/postgresql@17/bin/psql','-w','-X','-q','-At','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','55448','-U','arbor_requests_test','-d','arbor_ask_feedback_install_local']
def sql(q):
 r=subprocess.run(P+['-c',q],capture_output=True,text=True,timeout=15);assert r.returncode==0,r.stderr;return r.stdout.strip()
assert sql('select current_database()')=='arbor_ask_feedback_install_local'
assert sql("select current_setting('data_directory')")in['/tmp/arbor-requests-pg','/private/tmp/arbor-requests-pg']
A,B,SA,SB=[str(uuid.uuid4())for _ in range(4)];checks=0
sql(f"insert into auth.users(id,email)values('{A}','reader-owner@example.test'),('{B}','reader-user@example.test');insert into auth.sessions(id,user_id,created_at)values('{SA}','{A}',now()),('{SB}','{B}',now());insert into arbor_private.account_lifecycle(user_id,state)values('{A}','active'),('{B}','active');delete from arbor_private.admin_owner;insert into arbor_private.admin_owner(user_id)values('{A}');update arbor_private.terms_control set enforcement_enabled=false;")
KEY='arbor-local-request-fixture-only-not-a-hosted-credential'
def claims(a=A,s=SA):
 n=int(time.time());return dict(role='authenticated',aud='authenticated',sub=a,session_id=s,iat=n,exp=n+3600)
def call(name,params=None,c=None):
 h={'Content-Type':'application/json'}
 if c is not False:h['Authorization']='Bearer '+jwt.encode(c or claims(),KEY,algorithm='HS256')
 try:
  with urlopen(Request('http://127.0.0.1:55453/rpc/'+name,data=json.dumps(params or {}).encode(),headers=h),timeout=15)as r:return r.status,json.load(r)
 except HTTPError as e:return e.code,json.load(e)
def expect(v):
 global checks
 assert v;checks+=1
access='arbor_admin_ask_feedback_access_v1';read='arbor_admin_ask_feedback_v1'
expect(call(access)==(200,{'allowed':False}));expect(call(read)[0]==403)
sql(f"create or replace function arbor_private.ask_feedback_review_enabled(p_actor uuid)returns boolean language sql stable security invoker set search_path='' as $$select p_actor='{A}'::uuid$$")
expect(call(access)==(200,{'allowed':True}));expect(call(access,c=claims(B,SB))==(200,{'allowed':False}));expect(call(read,c=claims(B,SB))[0]==403);expect(call(read,c=False)[0]>=400)
for i in range(55):sql(f"insert into public.arbor_ask_feedback(id,user_id,helpful,reason,intent,answer_version)values('{uuid.uuid4()}','{B}',{'true'if i%2 else'false'},'unclear','plan','deterministic-ask-1')")
before=sql("select md5(string_agg(t::text,',' order by id))from public.arbor_ask_feedback t")
status,data=call(read);expect(status==200);expect(set(data)=={'items','topics','has_more','offset'});expect(len(data['items'])==50 and data['has_more']);expect(all(set(r)=={'helpful','reason','intent','created_at'}for r in data['items']));expect(data['topics']==[dict(intent='plan',helpful=27,not_helpful=28)]);expect(len(call(read,{'p_limit':50,'p_offset':50})[1]['items'])==5)
for params in [{'p_limit':0},{'p_limit':51},{'p_limit':None},{'p_offset':-1},{'p_offset':10001},{'p_user_id':B},{'p_email':'private'}]:expect(call(read,params)[0]>=400)
with ThreadPoolExecutor(max_workers=8)as pool:expect(all(r[0]==200 for r in pool.map(lambda _:call(read),range(20))))
expect(before==sql("select md5(string_agg(t::text,',' order by id))from public.arbor_ask_feedback t"))
for role in ['anon','authenticated','service_role']:
 expect(sql(f"select has_table_privilege('{role}','public.arbor_ask_feedback','SELECT,INSERT,UPDATE,DELETE')")=='f')
 expect(sql(f"select has_function_privilege('{role}','arbor_private.ask_feedback_review_enabled(uuid)','EXECUTE')")=='f')
expect(sql("select count(*)from pg_proc where proname like 'arbor_admin_ask_feedback%' and proconfig @> array['search_path=\"\"']")=='2')
for state in ['deactivated','deletion_pending','erasing']:
 sql(f"update arbor_private.account_lifecycle set state='{state}',deactivated_at=case when '{state}'='deactivated' then now()else null end where user_id='{A}'")
 expect(call(read)[0]==403)
sql(f"update arbor_private.account_lifecycle set state='active',deactivated_at=null where user_id='{A}';update arbor_private.terms_control set enforcement_enabled=true")
expect(call(read)[0]==403);sql(f"update arbor_private.terms_control set enforcement_enabled=false;delete from auth.sessions where id='{SA}'");expect(call(read)[0]==401)
sql(f"insert into auth.sessions(id,user_id,created_at)values('{SA}','{A}',now());delete from arbor_private.admin_owner")
expect(call(read)[0]==403)
sql("create or replace function arbor_private.ask_feedback_review_enabled(p_actor uuid)returns boolean language sql stable security invoker set search_path='' as $$select false$$")
expect(call(access)==(200,{'allowed':False}));expect(sql('select arbor_private.ask_feedback_enabled()')=='f')
print(json.dumps(dict(checks=checks,realLocalJWT=True,defaultClosed=True,actorBoundReadOnly=True,projectionFields=4,concurrentReads=20,unchangedRows=True,sessionTermsLifecycleRevocation=True,hostedWrites=0)))
