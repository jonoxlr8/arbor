"""Synthetic local PostgreSQL/PostgREST qualification; no hosted writes or erasure calls."""
import json,subprocess,uuid,time
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request,urlopen
from urllib.error import HTTPError
import jwt
P=['/opt/homebrew/opt/postgresql@17/bin/psql','-w','-X','-q','-At','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','55448','-U','arbor_requests_test','-d','arbor_admin_deletion_review_local']
def sql(q):return subprocess.check_output(P+['-c',q],text=True).strip()
assert sql('select current_database()')=='arbor_admin_deletion_review_local'
assert sql("select current_setting('data_directory')")in['/tmp/arbor-requests-pg','/private/tmp/arbor-requests-pg']
KEY='arbor-local-request-fixture-only-not-a-hosted-credential';checks=0
A,B,SA,SB=[str(uuid.uuid4())for _ in range(4)]
sql(f"insert into auth.users(id,email)values('{A}','deletion-review-a@example.test'),('{B}','deletion-review-b@example.test');insert into auth.sessions(id,user_id,created_at)values('{SA}','{A}',now()),('{SB}','{B}',now());insert into arbor_private.account_lifecycle(user_id,state)values('{A}','active'),('{B}','active');update arbor_private.terms_control set enforcement_enabled=false;delete from arbor_private.admin_owner;insert into arbor_private.admin_owner(user_id)values('{A}')")
def claims(o=A,s=SA):
 n=int(time.time());return dict(role='authenticated',aud='authenticated',sub=o,session_id=s,iat=n,exp=n+3600)
def call(name,body=None,c=None,key=KEY):
 h={'Content-Type':'application/json'}
 if c is not False:h['Authorization']='Bearer '+jwt.encode(c or claims(),key,algorithm='HS256')
 try:
  with urlopen(Request('http://127.0.0.1:55452/rpc/'+name,data=json.dumps(body or {}).encode(),headers=h),timeout=10)as r:return r.status,json.load(r)
 except HTTPError as e:return e.code,json.load(e)
def expect(v):
 global checks
 assert v;checks+=1
access='arbor_admin_deletion_access_v1';listing='arbor_admin_deletions_v1';detail='arbor_admin_deletion_v1'
# Explicit fixture reset: deployment proposal ships this function false.
sql("create or replace function arbor_private.deletion_review_enabled(p_actor uuid)returns boolean language sql stable security invoker set search_path='' as $$select false$$")
expect(call('arbor_admin_access_v1')==(200,{'allowed':True}));expect(call(access)==(200,{'allowed':False}));expect(call(listing)[0]==403);expect(call(listing,c=False)[0]>=400);expect(call(access,key='wrong-fixture-only-key-not-hosted-12345678')[0]==401)
sql(f"create or replace function arbor_private.deletion_review_enabled(p_actor uuid)returns boolean language sql stable security invoker set search_path='' as $$select p_actor='{A}'::uuid$$")
expect(call(access)==(200,{'allowed':True}));expect(call(access,c=claims(B,SB))==(200,{'allowed':False}));expect(call(listing,c={**claims(B,SB),'user_metadata':{'admin':True}})[0]==403)
rows={}
for kind,state in [('pending',None),('withdrawn',None),('held','reviewed'),('erasing','erasing'),('data_erased','data_erased'),('auth_erased','auth_erased'),('completed','completed'),('unconfirmed','completed')]:
 owner,rid,oid=[str(uuid.uuid4())for _ in range(3)];rows[kind]=rid
 if kind not in ['auth_erased','completed']:
  lifecycle='active'if kind=='withdrawn'else 'erasing'if kind in ['erasing','data_erased']else'deletion_pending'
  sql(f"insert into auth.users(id,email)values('{owner}','{kind}-{owner}@example.test');insert into arbor_private.account_lifecycle(user_id,state)values('{owner}','{lifecycle}');insert into arbor_private.account_deletion_requests(user_id,request_id,status,requested_at,withdrawn_at)values('{owner}','{rid}','{'withdrawn'if kind=='withdrawn'else'pending'}',now(),{'now()'if kind=='withdrawn'else'null'})")
 if state:
  holds="jsonb_build_array(jsonb_build_object('category','ledger','reason','legal_claim','review_at',now()+interval '1 day','end_at',now()+interval '2 days'))"if kind=='held'else"'[]'::jsonb"
  complete="now()"if state=='completed'else'null';expiry="now()+interval '30 days'"if state=='completed'else'null';provider='pending_copies'if state=='completed'else'unassessed'
  sql(f"insert into arbor_private.account_erasure_operations(id,owner_id,request_id,request_version,state,verified_at,completed_at,receipt_expires_at,holds,provider_status)values('{oid}','{owner}','{rid}',1,'{state}',now(),{complete},{expiry},{holds},'{provider}')")
expected={'request_id','requested_at','request_status','withdrawn_at','lifecycle_state','processing_state','holds','verified_at','completed_at','receipt_expires_at','provider_status','receipt_id'}
for kind,rid in rows.items():
 code,row=call(detail,{'p_request':rid});expect(code==200);expect(set(row)==expected)
 if kind=='completed':expect(row['receipt_id']is not None and row['requested_at']is None and row['request_status']=='record_unavailable')
 elif kind=='unconfirmed':expect(row['receipt_id']is None)
 elif kind=='held':expect(len(row['holds'])==1)
 elif kind=='withdrawn':expect(row['withdrawn_at']is not None)
expect(len(call(listing,{'p_limit':1,'p_offset':1})[1]['items'])==1)
for params in [{'p_limit':0},{'p_limit':None},{'p_offset':10001}]:expect(call(listing,params)[0]==422)
expect(call(detail,{'p_request':str(uuid.uuid4())})[0]==404);expect(call(listing,{'p_owner':B})[0]>=400)
sql(f"update arbor_private.account_erasure_operations set receipt_expires_at=now()-interval '1 day' where request_id='{rows['completed']}'")
expect(call(detail,{'p_request':rows['completed']})[0]==404)
sql(f"update arbor_private.account_erasure_operations set holds=jsonb_build_array(jsonb_build_object('category','ledger','reason','legal_claim','review_at',now()-interval '2 days','end_at',now()-interval '1 day')) where request_id='{rows['completed']}'")
r=call(detail,{'p_request':rows['completed']})[1];expect(r['receipt_id']is None and len(r['holds'])==1)
def snapshot():return sql("select md5(coalesce((select jsonb_agg(to_jsonb(q))::text from arbor_private.account_deletion_requests q),'')||coalesce((select jsonb_agg(to_jsonb(o))::text from arbor_private.account_erasure_operations o),''))")
before=snapshot()
with ThreadPoolExecutor(max_workers=4)as pool:expect(all(code==200 for code,_ in pool.map(lambda _:call(listing),range(20))))
expect(snapshot()==before)
for role in ['authenticated','service_role']:
 for privilege in ['SELECT','INSERT','UPDATE','DELETE']:expect(sql(f"select has_table_privilege('{role}','arbor_private.deletion_review_rows','{privilege}')")=='f')
 expect(sql(f"select has_function_privilege('{role}','arbor_private.require_deletion_review()','EXECUTE')")=='f')
for state in ['deactivated','deletion_pending','erasing']:
 sql(f"update arbor_private.account_lifecycle set state='{state}',deactivated_at=case when '{state}'='deactivated' then now() else null end where user_id='{A}'");expect(call(listing)[0]==403)
sql(f"update arbor_private.account_lifecycle set state='active',deactivated_at=null where user_id='{A}';update arbor_private.terms_control set enforcement_enabled=true");expect(call(listing)[0]==403)
sql(f"update arbor_private.terms_control set enforcement_enabled=false;delete from auth.sessions where id='{SA}'");expect(call(listing)[0]==401)
sql(f"insert into auth.sessions(id,user_id,created_at)values('{SA}','{A}',now());delete from arbor_private.admin_owner;insert into arbor_private.admin_owner(user_id)values('{B}')");expect(call(listing)[0]==403);expect(call(access,c=claims(B,SB))==(200,{'allowed':False}))
sql(f"delete from arbor_private.admin_owner;insert into arbor_private.admin_owner(user_id)values('{A}');create or replace function arbor_private.deletion_review_enabled(p_actor uuid)returns boolean language sql stable security invoker set search_path='' as $$select false$$")
expect(call(access)==(200,{'allowed':False}));expect(call('arbor_admin_access_v1')==(200,{'allowed':True}))
print(json.dumps(dict(checks=checks,realLocalPostgres=True,realJWT=True,defaultClosed=True,canonicalReadOnly=True,concurrentReads=20,expiredReceiptAndElapsedHold=True,lifecycleTermsSessionOwnerRotationDenied=True,hostedWrites=0,deletionExecutorsCalled=0)))
