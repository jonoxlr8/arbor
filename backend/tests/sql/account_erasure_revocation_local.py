"""Actual disposable local SQL/session checks + synthetic SDK; no hosted access."""
import os,json,subprocess,time
from datetime import datetime,timedelta,timezone
from uuid import UUID,uuid4
from urllib.request import Request,urlopen
from urllib.error import HTTPError
import httpx,jwt
from supabase_auth import SyncGoTrueAdminAPI,SyncGoTrueClient
from storage3 import SyncStorageClient
from app.services.account_erasure import Approval
from app.services.account_erasure_providers import SupabaseErasureProviders,IsolatedProject,SessionInventory,ObjectInventory,AdapterError,IsolatedSessionInventoryReader
assert os.environ.get('ARBOR_LOCAL_ERASURE_TEST')=='1'
ARGS=['psql','-w','-X','-q','-At','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','55433','-U','arbor_export_test','-d','arbor_lifecycle_qualification']
checks=0

def sql(query):
 global checks
 checks+=1
 r=subprocess.run(ARGS+['-c',"set statement_timeout='8s';set lock_timeout='2s';"+query],capture_output=True,text=True,timeout=12)
 if r.returncode:raise RuntimeError('Local SQL check failed')
 return r.stdout.strip()
assert sql('select current_database()')=='arbor_lifecycle_qualification'
assert sql("select current_setting('data_directory')") in ('/tmp/arbor-export-pg','/private/tmp/arbor-export-pg')
owner,other,session,operation,request=[uuid4() for _ in range(5)]
created=datetime.now(timezone.utc)
assert str(owner)!='2b8ecf21-28a4-4323-88d3-d736f95502da'
sql(f"insert into auth.users(id,email,created_at) values('{owner}','synthetic-revoke@example.test','{created.isoformat()}'),('{other}','synthetic-control@example.test','{created.isoformat()}');insert into auth.sessions(id,user_id,created_at) values('{session}','{owner}',now()),('{uuid4()}','{other}',now());insert into holdings(user_id,ticker,quantity) values('{other}','SYNTHETIC-CONTROL',1);insert into arbor_private.account_lifecycle(user_id,state,version) values('{owner}','deletion_pending',1);insert into arbor_private.account_deletion_requests(user_id,request_id,status,requested_at) values('{owner}','{request}','pending',now());select arbor_private.erasure_review('{owner}','{request}',1,'{operation}',true);select arbor_private.erasure_begin('{operation}')")
control=sql(f"select md5(to_jsonb(h)::text) from holdings h where user_id='{other}'")
calls=[];REF='aaaaaaaaaaaaaaaaaaaa';origin='https://'+REF+'.supabase.co'

def handle(r):
 calls.append((r.method,r.url.path))
 user={'id':str(owner),'aud':'authenticated','email':'synthetic-revoke@example.test','created_at':created.isoformat(),'app_metadata':{},'user_metadata':{}}
 if r.url.path==f'/auth/v1/admin/users/{owner}':return httpx.Response(200,json=user)
 if r.url.path=='/auth/v1/user':
  if sql(f"select count(*) from auth.sessions where user_id='{owner}'")=='0':return httpx.Response(403,json={'error_code':'session_not_found','msg':'synthetic expired session'})
  return httpx.Response(200,json=user)
 if r.url.path=='/auth/v1/logout':
  assert r.method=='POST' and r.url.params['scope']=='global'
  sql(f"delete from auth.sessions where user_id='{owner}'")
  return httpx.Response(204)
 raise AssertionError('Unexpected SDK action')
client=httpx.Client(transport=httpx.MockTransport(handle),timeout=2,follow_redirects=False)
headers={'Authorization':'Bearer synthetic-local-only','apikey':'synthetic-local-only'}
auth=SyncGoTrueAdminAPI(url=origin+'/auth/v1',headers=headers,http_client=client)
user=SyncGoTrueClient(url=origin+'/auth/v1',headers=headers,http_client=client,auto_refresh_token=False,persist_session=False)
storage=SyncStorageClient(origin+'/storage/v1/',headers,http_client=client)

def barrier(o):
 assert o==owner
 return sql(f"select count(*) from arbor_private.account_erasure_operations where id='{operation}' and owner_id='{owner}' and state='erasing'")=='1'
project=IsolatedProject.from_metadata({'id':REF,'name':'arbor-erasure-test','organization_id':'bdvnhzpvywuzoylvffzt','status':'ACTIVE_HEALTHY'})
reader=IsolatedSessionInventoryReader(project=project,owner=owner,operation=operation,expected_created_at=created,read=lambda query:json.loads(sql(query)))
def inventory(o):
 assert o==owner and barrier(o)
 return reader(o)
adapter=SupabaseErasureProviders(project=IsolatedProject.from_metadata({'id':REF,'name':'arbor-erasure-test','organization_id':'bdvnhzpvywuzoylvffzt','status':'ACTIVE_HEALTHY'}),owner=owner,operation=operation,expected_created_at=created,auth=auth,session_auth=user,storage=storage,inventory=lambda o:ObjectInventory(REF,owner,True,()),owner_token=lambda o:'synthetic-local-only',guard_probe=barrier,execution_enabled=True,session_inventory=inventory)
adapter.authorize(Approval(operation,owner,'data',datetime.now(timezone.utc)+timedelta(minutes=2)))
adapter.revoke_sessions(owner);assert sql(f"select count(*) from auth.sessions where user_id='{owner}'")=='0'
before=list(calls);adapter.revoke_sessions(owner)
assert all(path not in ('/auth/v1/user','/auth/v1/logout') for _,path in calls[len(before):])
assert sum(path=='/auth/v1/logout' for _,path in calls)==1
# Actual local PostgREST rejects the old session, independently of mock Auth.
stamp=int(time.time());token=jwt.encode({'sub':str(owner),'session_id':str(session),'role':'authenticated','aud':'authenticated','iat':stamp,'exp':stamp+3600},'arbor-synthetic-local-test-only-not-a-hosted-credential',algorithm='HS256')
req=Request('http://127.0.0.1:55435/rpc/arbor_account_active_v1',data=b'{}',headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
try:urlopen(req,timeout=8);raise AssertionError('Old session accepted')
except HTTPError as error:assert error.code==401
# A newly inserted synthetic session between two absence reads must fail closed.
reads=0

def race(o):
 global reads
 reads+=1
 if reads==2:sql(f"insert into auth.sessions(id,user_id,created_at) values('{uuid4()}','{owner}',now())")
 return inventory(o)
adapter.session_inventory=race
try:adapter.revoke_sessions(owner);raise AssertionError('Race accepted')
except AdapterError:pass
assert sql(f"select count(*) from auth.sessions where user_id='{owner}'")=='1'
assert sql(f"select md5(to_jsonb(h)::text) from holdings h where user_id='{other}'")==control
assert sql(f"select count(*) from auth.sessions where user_id='{other}'")=='1'
# Tested single-use pairing on actual local SQL: each guard performs a new read.
from app.services.account_erasure_providers import IsolatedGuardSessionEvidence
sql(f"delete from auth.sessions where user_id='{owner}'")
paired_reads=[]
def fresh_read(o):
 paired_reads.append(o)
 return reader(o)
paired=IsolatedGuardSessionEvidence(fresh_read)
adapter.guard_probe=paired.guard;adapter.session_inventory=paired.inventory
before=list(calls)
adapter.authorize(Approval(operation,owner,'data',datetime.now(timezone.utc)+timedelta(minutes=2)))
adapter.revoke_sessions(owner)
assert len(paired_reads)==2 and all(path not in ('/auth/v1/user','/auth/v1/logout') for _,path in calls[len(before):])
try:paired.inventory(owner);raise AssertionError('Evidence reused')
except AdapterError:pass
assert sql(f"select count(*) from auth.sessions where user_id='{other}'")=='1'
assert sql(f"select md5(to_jsonb(h)::text) from holdings h where user_id='{other}'")==control
adapter.execution_enabled=False
print(json.dumps({'actual_local_PostgreSQL':True,'actual_local_PostgREST_old_session_401':True,'SDK_transport':'synthetic_no_network','repeat_revocation_without_revoked_auth':True,'new_session_race_denied':True,'control_owner_preserved':True,'checks':checks,'hosted_actions':0,'execution_disabled':True}))
