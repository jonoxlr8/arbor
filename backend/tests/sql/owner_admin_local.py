"""Real JWT/RPC/RLS persistence; existing synthetic cluster, separate DB."""
import json,subprocess,uuid,time
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request,urlopen
from urllib.error import HTTPError
import jwt
P=['/opt/homebrew/opt/postgresql@17/bin/psql','-w','-X','-q','-At','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','55448','-U','arbor_requests_test','-d','arbor_owner_admin_local']
def sql(q):return subprocess.check_output(P+['-c',q],text=True).strip()
assert sql("select current_setting('data_directory')")in['/tmp/arbor-requests-pg','/private/tmp/arbor-requests-pg']
assert sql('select current_database()')=='arbor_owner_admin_local'
KEY='arbor-local-request-fixture-only-not-a-hosted-credential';ORIGIN='http://127.0.0.1:55451';checks=0
A,B,C,SA,SB,SC=[str(uuid.uuid4())for _ in range(6)]
sql(f"insert into auth.users(id,email)values('{A}','admin-local@example.test'),('{B}','submitter-b@example.test'),('{C}','submitter-c@example.test');insert into auth.sessions(id,user_id,created_at)values('{SA}','{A}',now()),('{SB}','{B}',now()),('{SC}','{C}',now());insert into arbor_private.account_lifecycle(user_id,state)values('{A}','active'),('{B}','active'),('{C}','active');update arbor_private.terms_control set enforcement_enabled=false;delete from arbor_private.admin_owner;")
def claims(owner=A,session=SA):
 n=int(time.time());return{'role':'authenticated','aud':'authenticated','sub':owner,'session_id':session,'iat':n,'exp':n+3600}
def call(path,body=None,owner=A,session=SA,c=None,key=KEY,method='POST'):
 h={'Content-Type':'application/json'}
 if c is not False:h['Authorization']='Bearer '+jwt.encode(c or claims(owner,session),key,algorithm='HS256')
 try:
  with urlopen(Request(ORIGIN+path,data=json.dumps(body).encode()if body is not None else None,headers=h,method=method),timeout=15)as r:return r.status,json.load(r)
 except HTTPError as e:return e.code,json.load(e)
def expect(value):
 global checks
 assert value;checks+=1
access='/rpc/arbor_admin_access_v1';listing='/rpc/arbor_admin_requests_v1';detail='/rpc/arbor_admin_request_v1';update='/rpc/arbor_admin_request_status_v1'
expect(call(access,{})==(200,{'allowed':False}));expect(call(listing,{})[0]==403);expect(call(listing,{},c=False)[0]>=400);expect(call(access,{},key='wrong-synthetic-signature-key-123456789')[0]==401)
sql(f"insert into arbor_private.admin_owner(user_id)values('{A}')")
expect(call(access,{})==(200,{'allowed':True}));expect(call(access,{},owner=B,session=SB)==(200,{'allowed':False}));expect(call(listing,{},owner=B,session=SB)[0]==403)
expect(call(listing,{},c={**claims(B,SB),'user_metadata':{'admin':True,'owner':A}})[0]==403)
expect(call('/arbor_investment_request_reviews',method='GET',owner=B,session=SB)[0]>=400);expect(call('/arbor_investment_request_reviews',{'status':'resolved','request_id':str(uuid.uuid4())})[0]>=400);expect(call('/rpc/require_request_admin',{})[0]>=400)
def submit(o,s,name):return call('/rpc/arbor_request_investment_v1',{'p_investment_name':name,'p_provider':'Sample Provider','p_idempotency_key':str(uuid.uuid4())},owner=o,session=s)[1]['id']
RID=submit(B,SB,'Sample Missing Fund');OTHER=submit(C,SC,'Other Sample Fund')
r=call(detail,{'p_id':RID})[1];expect(r['status']=='new' and r['revision']==0 and r['updated_at']is None);expect(set(r)=={'id','investment_name','provider','received_at','status','revision','updated_at'});expect(call(detail,{'p_id':RID},owner=B,session=SB)[0]==403)
expect(call(listing,{'p_limit':0})[0]==422);expect(call(listing,{'p_offset':10001})[0]==422)
change={'p_id':RID,'p_status':'reviewing','p_expected_revision':0}
with ThreadPoolExecutor(max_workers=2)as pool:results=list(pool.map(lambda _:call(update,change),range(2)))
expect(sorted(code for code,_ in results)==[200,409]);r=call(detail,{'p_id':RID})[1];expect(r['revision']==1 and r['status']=='reviewing');expect(call(update,{'p_id':RID,'p_status':'reviewing','p_expected_revision':1})[1]['revision']==1);expect(call(update,{'p_id':RID,'p_status':'resolved','p_expected_revision':1})[1]['revision']==2);expect(call(update,{'p_id':RID,'p_status':'bad','p_expected_revision':2})[0]==422);expect(call(update,{'p_id':RID,'p_status':'new','p_expected_revision':2},owner=B,session=SB)[0]==403)
export=json.loads(sql(f"select public.arbor_account_export_v1('{B}','{SB}')"));expect(len(export['investment_request_reviews'])==1 and export['investment_request_reviews'][0]['status']=='resolved');expect(set(export['investment_request_reviews'][0])=={'investment_name','provider','received_at','status','updated_at'});expect(len(json.loads(sql(f"select public.arbor_account_export_v1('{C}','{SC}')"))['investment_request_reviews'])==0)
expect(json.loads(sql(f"select arbor_private.erasure_inventory('{B}')"))['arbor_investment_request_reviews']==1);expect(json.loads(sql(f"select arbor_private.erasure_inventory('{A}')"))['admin_owner']==1)
for state in['deactivated','deletion_pending','erasing']:
 sql(f"update arbor_private.account_lifecycle set state='{state}',deactivated_at=case when '{state}'='deactivated' then now() else null end where user_id='{A}'")
 expect(call(listing,{})[0]==403)
sql(f"update arbor_private.account_lifecycle set state='active',deactivated_at=null where user_id='{A}';update arbor_private.account_lifecycle set state='deletion_pending' where user_id='{B}'")
expect(call(detail,{'p_id':RID})[0]==404);expect(call(update,{'p_id':RID,'p_status':'new','p_expected_revision':2})[0]==404);expect(all(x['id']!=RID for x in call(listing,{})[1]['items']))
sql(f"update arbor_private.account_lifecycle set state='active' where user_id='{B}';update arbor_private.terms_control set enforcement_enabled=true");expect(call(listing,{})[0]==403)
sql(f"update arbor_private.terms_control set enforcement_enabled=false;delete from auth.sessions where id='{SA}'");expect(call(listing,{})[0]==401)
sql(f"insert into auth.sessions(id,user_id,created_at)values('{SA}','{A}',now());delete from public.arbor_investment_requests where id='{RID}'")
expect(sql(f"select count(*) from public.arbor_investment_request_reviews where request_id='{RID}'")=='0');expect(call(detail,{'p_id':OTHER})[0]==200)
sql(f"delete from arbor_private.admin_owner where user_id='{A}'");expect(call(access,{})==(200,{'allowed':False}));expect(call(listing,{})[0]==403)
print(json.dumps({'checks':checks,'realLocalPostgres':True,'directGrantDenied':True,'ordinaryAnonymousForgedOwnerDenied':True,'concurrentRevisionConflict':True,'exportIsolation':True,'erasureInventory':True,'retentionCascade':True,'actorSubmitterLifecycle':True,'termsRevokedSessionDenied':True,'hostedWrites':0}))
