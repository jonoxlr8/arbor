"""Disposable loopback PostgreSQL/PostgREST; never reads hosted configuration."""
import hashlib,json,os,subprocess,time,uuid
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request,urlopen
from urllib.error import HTTPError
import jwt
assert os.environ.get('ARBOR_LOCAL_TERMS_TEST')=='1'
DB='arbor_terms_qualification_v5';ORIGIN='http://127.0.0.1:55436';KEY='arbor-synthetic-local-test-only-not-a-hosted-credential'
ARGS=['/opt/homebrew/opt/postgresql@17/bin/psql','-w','-X','-q','-At','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','55433','-U','arbor_export_test','-d',DB]
checks=calls=0

def sql(q,ok=True):
 r=subprocess.run(ARGS+['-c',q],capture_output=True,text=True,timeout=15)
 assert (r.returncode==0)==ok,r.stderr
 return r.stdout.strip()if ok else r.stderr

def expect(v):
 global checks
 assert v;checks+=1
expect(sql('select current_database()')==DB)
expect(sql("select current_setting('data_directory')") in ('/tmp/arbor-export-pg','/private/tmp/arbor-export-pg'))
sql("update arbor_private.terms_control set enforcement_enabled=false")
A,B,S,T=[str(uuid.uuid4())for _ in range(4)]
sql(f"insert into auth.users(id,email)values('{A}','terms-a-{A}@example.test'),('{B}','terms-b-{B}@example.test');insert into auth.sessions(id,user_id,created_at)values('{S}','{A}',clock_timestamp()),('{T}','{B}',clock_timestamp());insert into holdings(user_id,ticker,quantity)values('{A}','TERMS-A',12),('{B}','TERMS-B',34);")
financial=sql(f"select jsonb_agg(to_jsonb(h)order by id)from holdings h where user_id in('{A}','{B}')")
def claims(owner=A,session=S):
 n=int(time.time());return {'role':'authenticated','aud':'authenticated','sub':owner,'session_id':session,'iat':n,'exp':n+3600}
def request(name='arbor_terms_account_v1',params=None,c=None,key=KEY,headers=None,method='POST'):
 global calls
 calls+=1;h={'Content-Type':'application/json',**(headers or {})}
 if c is not False:h['Authorization']='Bearer '+jwt.encode(c or claims(),key,algorithm='HS256')
 path=name if name.startswith('/')else '/rpc/'+name
 try:
  with urlopen(Request(ORIGIN+path,data=json.dumps(params or{}).encode()if method!='GET'else None,headers=h,method=method),timeout=12)as r:return r.status,json.load(r)
 except HTTPError as e:return e.code,json.load(e)
code,doc=request('arbor_terms_current_v1',c=False);expect(code==200)
version,digest=doc['version'],doc['digest'];body={'p_action':'accept','p_version':version,'p_digest':digest,'p_confirm':True}
expect(doc['enforcement_enabled'] is False)
# Explicit local activation only; no Auth dashboard/gateway involved.
sql("update arbor_private.terms_documents set published_at=coalesce(published_at,clock_timestamp()),effective_at=coalesce(effective_at,clock_timestamp());update arbor_private.terms_control set enforcement_enabled=true")
expect(request()[1]['required'] is True)
expect(request('arbor_account_active_v1')[1]is False)
table_result=request('/holdings',method='GET');assert table_result[1]==[],table_result;checks+=1
expect(request(c=False)[0]>=400)
expect(request(key='wrong-synthetic-signature-at-least-32bytes')[0]==401)
expect(request(params={'p_action':'accept','p_owner':B})[0]==404)
for changed in ({'sub':B},{'session_id':T},{'session_id':str(uuid.uuid4())},{'role':'anon'},{'exp':0},{'iat':int(time.time())+100}):expect(request(c={**claims(),**changed})[0]>=400)
for changed in ('created_at=null',"not_after=clock_timestamp()-interval '1 second'","created_at=clock_timestamp()+interval '1 minute'"):
 sql(f"update auth.sessions set {changed} where id='{S}'");expect(request(params=body)[0]==401);sql(f"update auth.sessions set created_at=clock_timestamp(),not_after=null where id='{S}'")
sql(f"update auth.sessions set created_at=clock_timestamp()-interval '16 minutes'where id='{S}'")
expect(request(params=body)[0]==403);expect(request()[0]==200)
sql(f"update auth.sessions set created_at=clock_timestamp()where id='{S}'")
code,error=request(params={**body,'p_confirm':False});assert code==400,(code,error);checks+=1
expect(request(params={**body,'p_digest':'0'*64})[0]==409)
expect(request(params=body,headers={'Prefer':'tx=rollback'})[0]==400)
code,accepted=request(params=body);expect(code==200 and not accepted['required'])
expect(request(params=body)[1]['accepted_at']==accepted['accepted_at'])
expect(request('arbor_account_active_v1')[1]is True)
expect(request(c=claims(B,T))[1]['required']is True)
expect('terms_receipt_immutable'in sql(f"update arbor_private.terms_acceptances set accepted_at=now()where user_id='{A}'",False))
expect('terms_document_immutable'in sql("update arbor_private.terms_documents set version='rewritten'",False))
expect(sql("select bool_and(proconfig @>array['search_path=\"\"'])from pg_proc where proname like '%terms%'and pronamespace in('public'::regnamespace,'arbor_private'::regnamespace)")=='t')
for role in ('anon','authenticated','service_role'):
 expect(sql(f"select has_table_privilege('{role}','arbor_private.terms_acceptances','SELECT')")=='f')
 expect(sql(f"select has_function_privilege('{role}','public.arbor_terms_before_user_created_v1(jsonb)','EXECUTE')")=='f')
# Current version update preserves older receipts and requires an explicit new action.
sql(f"insert into arbor_private.terms_documents select 'test-next',content_digest,document_text,clock_timestamp(),clock_timestamp()from arbor_private.terms_documents where version='{version}' on conflict(version) do nothing;update arbor_private.terms_control set current_version='test-next'")
expect(request()[1]['required']is True);expect(request(params=body)[0]==409)
expect(request(params={**body,'p_version':'test-next'})[0]==200)
expect(sql(f"select count(*)from arbor_private.terms_acceptances where user_id='{A}'")=='2')
sql(f"update arbor_private.terms_control set current_version='{version}'")
# Declining preserves export and lifecycle request access; it changes no account.
code,export=request('arbor_account_export_current_v1',c=claims(B,T));expect(code==200 and export['account']['id']==B and export['terms_acceptances']==[])
expect(request('arbor_account_lifecycle_v1',{'p_action':'status'},c=claims(B,T))[0]==200)
code,export=request('arbor_account_export_current_v1');expect(code==200 and len(export['terms_acceptances'])==2)
expect(all(set(r)=={'version','content_digest','accepted_at','source'}for r in export['terms_acceptances']))
expect('intent_token'not in json.dumps(export))
expect('terms_acceptances'in json.loads(sql(f"select arbor_private.erasure_inventory('{A}')")))
# Auth-role-like hook invocation uses only public schema/one function permission.
# Role/grants are transaction-rolled-back, not a credential or persistent grant.
hook_acl=sql("begin;create role arbor_terms_hook_local nologin;grant usage on schema public to arbor_terms_hook_local;grant execute on function public.arbor_terms_before_user_created_v1(jsonb)to arbor_terms_hook_local;set role arbor_terms_hook_local;select public.arbor_terms_before_user_created_v1('{}');reset role;rollback;")
expect('error'in hook_acl)
# Signup intents are bounded, email/version-bound capabilities, not metadata authority.
def intent(email):return request('arbor_terms_signup_intent_v1',{'p_email':email,'p_version':version,'p_digest':digest,'p_confirm':True},c=False)
def hook(token,email):
 event=json.dumps({'user':{'email':email,'user_metadata':{'arbor_terms_intent':token}}}).replace("'","''")
 return json.loads(sql(f"select public.arbor_terms_before_user_created_v1('{event}'::jsonb)"))
email='signup-'+str(uuid.uuid4())+'@example.test'
code,data=intent(email);expect(code==200);token=data['intent_token'];expect(len(token)==64)
expect(intent(email)[0]==429)
expect(request('arbor_terms_signup_intent_v1',{'p_email':email,'p_version':version,'p_digest':digest,'p_confirm':False},c=False)[0]==400)
expect(hook(token,email)=={})
expect('error'in hook(token,'wrong@example.test'));expect('error'in hook('0'*64,email))
U=str(uuid.uuid4());meta=json.dumps({'arbor_terms_intent':token})
insert=f"insert into auth.users(id,email,raw_user_meta_data)values('{U}','{email}','{meta}')"
expect('terms_signup_intent_required'in sql(f"insert into auth.users(id,email)values('{uuid.uuid4()}','no-intent@example.test')",False))
# Auth insert failure rolls back its receipt and consumption; hook itself never consumes.
expect('division by zero'in sql('begin;'+insert+';select 1/0;commit;',False))
expect(sql(f"select count(*)from arbor_private.terms_acceptances where user_id='{U}'")=='0')
expect(hook(token,email)=={})
sql(insert)
expect(sql(f"select source from arbor_private.terms_acceptances where user_id='{U}'")=='signup')
expect(sql(f"select raw_user_meta_data ? 'arbor_terms_intent'from auth.users where id='{U}'")=='f')
expect('error'in hook(token,email))
expect('terms_signup_intent_invalid'in sql(f"insert into auth.users(id,email,raw_user_meta_data)values('{uuid.uuid4()}','{email}','{meta}')",False))
# Concurrent Auth inserts using one intent: only one receipt survives.
email2='race-'+str(uuid.uuid4())+'@example.test';_,r=intent(email2);nonce=r['intent_token'];meta=json.dumps({'arbor_terms_intent':nonce})
def create(_):
 q=f"insert into auth.users(id,email,raw_user_meta_data)values('{uuid.uuid4()}','{email2}','{meta}')"
 r=subprocess.run(ARGS+['-c',q],capture_output=True,text=True);return r.returncode==0
with ThreadPoolExecutor(max_workers=2)as pool:expect(sorted(pool.map(create,range(2)))==[False,True])
expect(sql(f"select count(*)from arbor_private.terms_acceptances a join auth.users u on u.id=a.user_id where u.email='{email2}'")=='1')
# Expiry/version changes reject before account creation.
email3='expire-'+str(uuid.uuid4())+'@example.test';_,r=intent(email3)
sql("update arbor_private.terms_signup_intents set created_at=statement_timestamp()-interval '11 minutes',expires_at=statement_timestamp()-interval '1 minute'")
expect('error'in hook(r['intent_token'],email3))
# B's request never auto-cancels when Terms are accepted.
code,pending=request('arbor_account_lifecycle_v1',{'p_action':'request_deletion','p_expected_version':0,'p_action_id':str(uuid.uuid4()),'p_confirm':True},c=claims(B,T));expect(code==200 and pending['state']=='deletion_pending')
expect(request(params=body,c=claims(B,T))[0]==200)
expect(request('arbor_account_lifecycle_v1',{'p_action':'status'},c=claims(B,T))[1]['state']=='deletion_pending')
sql(f"update arbor_private.account_lifecycle set state='erasing'where user_id='{B}'")
expect(request(params=body,c=claims(B,T))[0]==403)
expect(sql(f"select jsonb_agg(to_jsonb(h)order by id)from holdings h where user_id in('{A}','{B}')")==financial)
# Owner-only receipt removal is part of the existing erasure transaction, rollback-qualified.
operation,request_id=[str(uuid.uuid4())for _ in range(2)]
erase=sql(f"begin;insert into arbor_private.account_lifecycle(user_id,state,version)values('{U}','deletion_pending',1);insert into arbor_private.account_deletion_requests(user_id,request_id,status,requested_at)values('{U}','{request_id}','pending',clock_timestamp());select arbor_private.erasure_review('{U}','{request_id}',1,'{operation}',true);select arbor_private.erasure_begin('{operation}');select arbor_private.erasure_data('{operation}');select count(*)from arbor_private.terms_acceptances where user_id='{U}';rollback;")
expect(erase.splitlines()[-1]=='0');expect(sql(f"select count(*)from arbor_private.terms_acceptances where user_id='{U}'")=='1')
expect(sql("select confdeltype from pg_constraint where conrelid='arbor_investment_entries'::regclass and confrelid='auth.users'::regclass")=='r')
# An ordinary caller cannot read the intent table, rewrite a receipt, or invoke the hook.
expect('permission denied'in sql('set role authenticated;select *from arbor_private.terms_signup_intents',False))
# Anonymous capacity abuse has a strict global bound; fairness is not guaranteed.
sql("delete from arbor_private.terms_signup_intents;insert into arbor_private.terms_signup_intents select encode(sha256(convert_to('capacity-token-'||i,'UTF8')),'hex'),encode(sha256(convert_to('capacity-email-'||i,'UTF8')),'hex'),'2026-10-01.1',statement_timestamp(),statement_timestamp()+interval '10 minutes'from generate_series(1,1000)i")
expect(intent('capacity-check@example.test')[0]==429);expect(sql('select count(*)from arbor_private.terms_signup_intents')=='1000')
sql('delete from arbor_private.terms_signup_intents')
expect(request('arbor_terms_signup_intent_v1',{'p_email':'rollback@example.test','p_version':version,'p_digest':digest,'p_confirm':True},c=False,headers={'Prefer':'tx=rollback'})[0]==400)
# Concurrent owner acceptance is idempotent and preserves the original evidence time.
with ThreadPoolExecutor(max_workers=2)as pool:results=list(pool.map(lambda _:request(params=body),range(2)))
expect(all(r[0]==200 and r[1]['accepted_at']==accepted['accepted_at']for r in results))
# Bounded lock contention; sleeps run only in this disposable database.
with ThreadPoolExecutor(max_workers=2)as pool:
 held=pool.submit(sql,f"begin;select pg_advisory_xact_lock(hashtextextended('arbor-account-lifecycle:{A}',0));select pg_sleep(3);commit;")
 time.sleep(.15);started=time.monotonic();code,error=request();elapsed=time.monotonic()-started;held.result()
 expect(code>=400 and error.get('code')=='55P03' and elapsed<2.8)

# Missing control fails closed, rather than silently authorizing users.
sql('delete from arbor_private.terms_control')
expect(request()[0]==503);expect(request('arbor_account_active_v1')[0]==503)
sql(f"insert into arbor_private.terms_control(current_version,enforcement_enabled)values('{version}',true)")
print(json.dumps({'checks':checks,'http_requests':calls,'database':DB,'hosted_actions':0,'financial_fingerprints_unchanged':True,'managed_auth_hook_qualification':'not performed'}))
