"""Real persisted submissions and RLS on a separate disposable loopback cluster."""
import json,os,subprocess,time,uuid
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request,urlopen
from urllib.error import HTTPError
import jwt

assert os.environ.get('ARBOR_LOCAL_REQUEST_TEST')=='1'
P=['/opt/homebrew/opt/postgresql@17/bin/psql','-w','-X','-q','-At','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','55448','-U','arbor_requests_test','-d','postgres']
ORIGIN='http://127.0.0.1:55449';KEY='arbor-local-request-fixture-only-not-a-hosted-credential'
def sql(q):return subprocess.check_output(P+['-c',q],text=True).strip()
assert sql("select current_setting('data_directory')") in ['/tmp/arbor-requests-pg','/private/tmp/arbor-requests-pg']
A,B,S,T=[str(uuid.uuid4())for _ in range(4)]
sql(f"insert into auth.users(id,email)values('{A}','request-a@example.test'),('{B}','request-b@example.test');insert into auth.sessions(id,user_id,created_at)values('{S}','{A}',now()),('{T}','{B}',now());insert into arbor_private.account_lifecycle(user_id,state)values('{A}','active'),('{B}','active');")
def claims(owner=A,session=S):
 n=int(time.time());return {'role':'authenticated','aud':'authenticated','sub':owner,'session_id':session,'iat':n,'exp':n+3600}
def call(path,body=None,owner=A,session=S,c=None,method='POST',key=KEY):
 h={'Content-Type':'application/json'}
 if c is not False:h['Authorization']='Bearer '+jwt.encode(c or claims(owner,session),key,algorithm='HS256')
 try:
  with urlopen(Request(ORIGIN+path,data=json.dumps(body).encode()if body is not None else None,headers=h,method=method),timeout=10)as r:return r.status,json.load(r)
 except HTTPError as e:return e.code,json.load(e)
def body(name='Example Index Fund',provider='Example Broker',retry=None):return{'p_investment_name':name,'p_provider':provider,'p_idempotency_key':retry or str(uuid.uuid4())}
path='/rpc/arbor_request_investment_v1';first=body();checks=0
def expect(value):
 global checks
 assert value;checks+=1
expect(call(path,first,c=False)[0]>=400);expect(call(path,first,key='wrong-local-signature-long-enough')[0]==401)
expect(call(path,first,c={**claims(),'session_id':str(uuid.uuid4())})[0]>=400)
code,r=call(path,first);expect(code==200 and r['status']=='received');expect(set(r)=={'id','investment_name','provider','received_at','status'})
code,replay=call(path,first);expect(code==200 and replay['status']=='already_received' and replay['id']==r['id'] and replay['received_at']==r['received_at'])
expect(call(path,{**first,'p_investment_name':'Different Fund'})[0]==409)
expect(call(path,body('  EXAMPLE   Index Fund ','Example Broker'))[1]['id']==r['id'])
expect(call(path,first,owner=B,session=T)[1]['id']!=r['id'])
expect(len(call('/arbor_investment_requests',method='GET')[1])==1)
expect(call('/arbor_investment_requests',{'user_id':B,'investment_name':'forged','provider':'forged','idempotency_key':str(uuid.uuid4())})[0]>=400)
expect(call('/arbor_investment_requests',{'received_at':'2000-01-01','investment_name':'forged','provider':'forged','idempotency_key':str(uuid.uuid4())})[0]>=400)
expect(call('/arbor_investment_requests?id=eq.'+r['id'],{'provider':'edited'},method='PATCH')[0]>=400)
expect(call('/arbor_investment_requests?id=eq.'+r['id'],method='DELETE')[0]>=400)
expect(call(path,body('','provider'))[0]==422);expect(call(path,body('x'*121,'provider'))[0]==422)
expect(call(path,body('Name','x'*81))[0]==422)
same=body('Concurrent Duplicate','Broker')
with ThreadPoolExecutor(max_workers=8)as pool:results=list(pool.map(lambda _:call(path,same),range(8)))
expect(all(code==200 for code,_ in results));expect(sum(v['status']=='received' for _,v in results)==1)
expect(len({v['id']for _,v in results})==1)
with ThreadPoolExecutor(max_workers=12)as pool:results=list(pool.map(lambda i:call(path,body('Distinct Fund '+str(i),'Broker')),range(12)))
expect(sum(code==200 for code,_ in results)==8);expect(sum(code==429 for code,_ in results)==4)
expect(sql(f"select count(*) from public.arbor_investment_requests where user_id='{A}'")=='10')
expect(call(path,first)[1]['status']=='already_received')
# Current Terms-aware admission denies reads and retries until the gate is met.
# No Terms receipt is created or accepted by this fixture.
sql('update arbor_private.terms_control set enforcement_enabled=true')
try:
 expect(call(path,first)[0]>=400)
 expect(call('/arbor_investment_requests',method='GET')[1]==[])
finally:sql('update arbor_private.terms_control set enforcement_enabled=false')

export=json.loads(sql(f"select public.arbor_account_export_v1('{A}','{S}')"))
expect(len(export['investment_requests'])==10 and all(set(x)=={'investment_name','provider','received_at'}for x in export['investment_requests']))
expect(sql(f"select count(*) from public.arbor_investment_requests where user_id in('{A}','{B}') and lower(investment_name)='example index fund' and lower(provider)='example broker'")=='2')
sql(f"update arbor_private.account_lifecycle set state='deactivated',deactivated_at=now() where user_id='{A}'")
expect(call(path,body())[0]>=400);expect(call('/arbor_investment_requests',method='GET')[1]==[])
sql(f"update arbor_private.account_lifecycle set state='active',deactivated_at=null where user_id='{A}';delete from auth.sessions where id='{S}'")
expect(call(path,body())[0]>=400)
sql(f"delete from auth.sessions where user_id='{B}';delete from arbor_private.account_lifecycle where user_id='{B}';delete from auth.users where id='{B}'")
expect(sql(f"select count(*) from public.arbor_investment_requests where user_id='{B}'")=='0')
expect(sql('select count(*) from public.arbor_portfolio_holdings')=='0')
print(json.dumps({'checks':checks,'realLocalPostgresPersisted':True,'concurrentDuplicateAndLimit':True,'ownerRLS':True,'revokedSessionAndInactiveAccountDenied':True,'ownerExport':True,'authDeleteCascade':True,'holdingsCreated':0,'hostedWrites':0}))
