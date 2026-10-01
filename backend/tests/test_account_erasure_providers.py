"""Installed SDK wire contracts on MockTransport: zero network/persistent writes."""
import json
from datetime import datetime,timedelta,timezone
from uuid import uuid4
import httpx,pytest
from supabase_auth import SyncGoTrueAdminAPI,SyncGoTrueClient
from storage3 import SyncStorageClient
from app.services.account_erasure import Approval
from app.services.account_erasure_providers import IsolatedProject,SupabaseErasureProviders,OwnedObject,ObjectInventory,ProviderReview,PROVIDER_CATEGORIES,AdapterError,SessionInventory,IsolatedSessionInventoryReader
NOW=datetime(2026,10,1,tzinfo=timezone.utc);REF='aaaaaaaaaaaaaaaaaaaa';ORIGIN=f'https://{REF}.supabase.co'
META={'id':REF,'name':'arbor-erasure-test','organization_id':'bdvnhzpvywuzoylvffzt','status':'ACTIVE_HEALTHY'}
class Fixture:
 def __init__(self,enabled=False):
  self.owner,self.other,self.operation=uuid4(),uuid4(),uuid4();self.alive=True;self.calls=[];self.error=None;self.created=NOW;self.verified_owner=self.owner;self.complete=True;self.guard=True;self.noop=False;self.sessions=1;self.inventory_calls=0
  self.objects=[OwnedObject(self.owner,'private','nested/a.txt','v1')]
  def handle(r):
   self.calls.append((r.method,r.url.path,dict(r.url.params)));p=r.url.path
   if self.error=='permission':return httpx.Response(403,json={'code':'not_admin','msg':'private details'})
   if p==f'/auth/v1/admin/users/{self.owner}':
    if r.method=='GET':
     if not self.alive:return httpx.Response(404,json={'msg':'missing'} if self.error=='generic404' else {'error_code':'user_not_found','msg':'User not found'})
     return httpx.Response(200,json=self.user(self.owner))
    if r.method=='DELETE':
     assert json.loads(r.content)=={'should_soft_delete':False};self.alive=False
     if self.error=='auth_timeout':raise httpx.ReadTimeout('private details',request=r)
     return httpx.Response(200,json={})
   if p=='/auth/v1/user' and self.error=='expired':return httpx.Response(403,json={'error_code':'session_not_found','msg':'private details'})
   if p=='/auth/v1/user':return httpx.Response(200,json=self.user(self.verified_owner))
   if p=='/auth/v1/logout':
    assert r.method=='POST' and r.url.params['scope']=='global'
    if self.error!='logout_noop':self.sessions=0
    if self.error=='logout_timeout':raise httpx.ReadTimeout('private details',request=r)
    return httpx.Response(204)
   if p=='/storage/v1/object/private':
    assert r.method=='DELETE';names=json.loads(r.content)['prefixes'];assert len(names)<=1000
    if not self.noop:self.objects=[o for o in self.objects if o.name not in names]
    if self.error=='storage_timeout':raise httpx.ReadTimeout('private details',request=r)
    return httpx.Response(200,json=[])
   raise AssertionError('Unexpected SDK endpoint')
  client=httpx.Client(transport=httpx.MockTransport(handle),timeout=2,follow_redirects=False);headers={'Authorization':'Bearer synthetic-fixture-only','apikey':'synthetic-fixture-only'}
  auth=SyncGoTrueAdminAPI(url=ORIGIN+'/auth/v1',headers=headers,http_client=client)
  session=SyncGoTrueClient(url=ORIGIN+'/auth/v1',headers=headers,http_client=client,auto_refresh_token=False,persist_session=False)
  storage=SyncStorageClient(ORIGIN+'/storage/v1/',headers,http_client=client)
  self.adapter=SupabaseErasureProviders(project=IsolatedProject.from_metadata(META),owner=self.owner,operation=self.operation,expected_created_at=NOW,auth=auth,session_auth=session,storage=storage,inventory=lambda owner:ObjectInventory(REF,owner,self.complete,tuple(self.objects)),owner_token=lambda owner:'synthetic-owner-session-only',guard_probe=lambda owner:self.guard,execution_enabled=enabled,session_inventory=self.session_inventory)
 def session_inventory(self,owner):
  self.inventory_calls+=1
  return SessionInventory(REF,owner,self.operation,True,self.sessions,datetime.now(timezone.utc))
 def user(self,owner):return {'id':str(owner),'aud':'authenticated','email':'synthetic@example.test','created_at':self.created.isoformat(),'app_metadata':{},'user_metadata':{}}
 def approve(self,intended_phase,**changes):self.adapter.authorize(Approval(**{'owner_id':self.owner,'operation_id':self.operation,'phase':intended_phase,'expires_at':datetime.now(timezone.utc)+timedelta(minutes=2),**changes}))
def test_preflight_get_only():
 f=Fixture();r=f.adapter.preflight(f.owner);assert r['owned_object_count']==1 and not r['execution_enabled'];assert all(c[0]=='GET' for c in f.calls)
@pytest.mark.parametrize('method,phase',[('revoke_sessions','begin'),('erase_storage','data'),('delete_auth','auth')])
def test_default_no_execution(method,phase):
 f=Fixture();f.approve(phase)
 with pytest.raises(AdapterError):getattr(f.adapter,method)(f.owner)
 assert f.calls==[]
@pytest.mark.parametrize('change',[{'id':'gnjjtlswwhkpiabyayvi'},{'id':'yzoljwvcwhbjeifyvyfh'},{'name':'arbor'},{'status':'INACTIVE'},{'organization_id':'other'}])
def test_target_deny(change):
 with pytest.raises(AdapterError):IsolatedProject.from_metadata({**META,**change})
def test_client_target_deny():
 for url in ['https://gnjjtlswwhkpiabyayvi.supabase.co/auth/v1',ORIGIN+'/auth/v1?key=private',ORIGIN+'/storage/v1',ORIGIN.replace('https','http')+'/auth/v1']:
  with pytest.raises(AdapterError):IsolatedProject.from_metadata(META).check_client(url,'/auth/v1')
@pytest.mark.parametrize('change',[{'operation_id':uuid4()},{'owner_id':uuid4()},{'expires_at':NOW},{'phase':'complete'}])
def test_grant_deny(change):
 f=Fixture(True);f.approve('data',**change)
 with pytest.raises(AdapterError):f.adapter.erase_storage(f.owner)
 assert f.calls==[]
def test_other_owner_and_guard_deny():
 f=Fixture(True);f.approve('data')
 with pytest.raises(AdapterError):f.adapter.erase_storage(f.other)
 f.guard=False
 with pytest.raises(AdapterError):f.adapter.erase_storage(f.owner)
 assert f.calls==[]
def test_identity_recreation_deny():
 f=Fixture(True);f.created=NOW+timedelta(seconds=1);f.objects=[];f.approve('auth')
 with pytest.raises(AdapterError):f.adapter.delete_auth(f.owner)
 assert not any(c[0]=='DELETE' for c in f.calls)
def test_logout_verified_owner_global():
 f=Fixture(True);f.approve('begin');f.adapter.revoke_sessions(f.owner);assert ('POST','/auth/v1/logout',{'scope':'global'}) in f.calls
 f.sessions=1;f.verified_owner=f.other;before=len(f.calls)
 with pytest.raises(AdapterError):f.adapter.revoke_sessions(f.owner)
 assert not any(c[0]=='POST' for c in f.calls[before:])
@pytest.mark.parametrize('bad',['partial','other','duplicate','version','large','bucket'])
def test_inventory_deny(bad):
 f=Fixture(True);f.approve('data')
 if bad=='partial':f.complete=False
 if bad=='other':f.objects=[OwnedObject(f.other,'private','nested/a.txt','v1')]
 if bad=='duplicate':f.objects*=2
 if bad=='version':f.objects=[OwnedObject(f.owner,'private','a','')]
 if bad=='bucket':f.objects=[OwnedObject(f.owner,'..','a','v1')]
 if bad=='large':f.objects=[OwnedObject(f.owner,'private',str(i),'v1') for i in range(10001)]
 with pytest.raises(AdapterError):f.adapter.erase_storage(f.owner)
 assert not any(c[0]=='DELETE' for c in f.calls)
def test_storage_sdk_batch_and_absence():
 f=Fixture(True);f.objects=[OwnedObject(f.owner,'private',str(i),'v1') for i in range(1001)];f.approve('data');f.adapter.erase_storage(f.owner);assert f.objects==[] and sum(c[0]=='DELETE' for c in f.calls)==2
@pytest.mark.parametrize('failure',['storage_timeout','noop'])
def test_storage_uncertainty(failure):
 f=Fixture(True);f.approve('data');f.error=failure;f.noop=failure=='noop'
 with pytest.raises(AdapterError):f.adapter.erase_storage(f.owner)
 f.error=None;f.noop=False;f.adapter.erase_storage(f.owner);assert f.objects==[]
def test_auth_waits_for_storage():
 f=Fixture(True);f.approve('auth')
 with pytest.raises(AdapterError):f.adapter.delete_auth(f.owner)
 assert f.alive and not any(c[0]=='DELETE' for c in f.calls)
def test_auth_hard_delete_absence_repeat():
 f=Fixture(True);f.objects=[];f.approve('auth');f.adapter.delete_auth(f.owner);assert f.adapter.auth_absent(f.owner);f.adapter.delete_auth(f.owner);assert sum(c[0]=='DELETE' for c in f.calls)==1
@pytest.mark.parametrize('failure',['permission','generic404'])
def test_error_not_absence(failure):
 f=Fixture(True);f.error=failure;f.alive=False
 with pytest.raises(AdapterError) as e:f.adapter.auth_absent(f.owner)
 assert 'private' not in str(e.value)
def test_auth_timeout_no_duplicate():
 f=Fixture(True);f.objects=[];f.error='auth_timeout';f.approve('auth')
 with pytest.raises(AdapterError):f.adapter.delete_auth(f.owner)
 f.error=None;f.adapter.delete_auth(f.owner);assert sum(c[0]=='DELETE' for c in f.calls)==1
def test_provider_assessment_explicit():
 f=Fixture()
 with pytest.raises(AdapterError):f.adapter.assess_external_copies(f.owner)
 f.adapter.review=ProviderReview(f.owner,f.operation,NOW,{c:'pending' for c in PROVIDER_CATEGORIES});assert f.adapter.assess_external_copies(f.owner)=='pending_copies'
 f.adapter.review=ProviderReview(f.other,f.operation,NOW,{c:'confirmed_absent' for c in PROVIDER_CATEGORIES})
 with pytest.raises(AdapterError):f.adapter.assess_external_copies(f.owner)

def test_guard_exception_is_sanitized():
 f=Fixture(True);f.approve('data')
 def fail(owner):raise RuntimeError('private token payload')
 f.adapter.guard_probe=fail
 with pytest.raises(AdapterError) as e:f.adapter.erase_storage(f.owner)
 assert 'token' not in str(e.value) and f.calls==[]


def test_repeated_revocation_does_not_authenticate_revoked_owner_token():
 f=Fixture(True);f.approve('begin');f.adapter.revoke_sessions(f.owner)
 first=list(f.calls);f.error='expired';f.approve('data');f.adapter.revoke_sessions(f.owner)
 assert all(call[1] not in ('/auth/v1/user','/auth/v1/logout') for call in f.calls[len(first):])
 assert f.sessions==0 and sum(call[1]=='/auth/v1/logout' for call in f.calls)==1

def test_zero_sessions_never_requests_or_decodes_owner_token():
 f=Fixture(True);f.sessions=0;f.approve('data')
 def token(owner):raise AssertionError('Should not request token')
 f.adapter.owner_token=token;f.adapter.revoke_sessions(f.owner)
 assert all(call[1].startswith('/auth/v1/admin/users/') for call in f.calls)

@pytest.mark.parametrize('bad',['missing','incomplete','other','project','operation','stale','future','naive','bool','negative','error'])
def test_session_absence_evidence_fail_closed(bad):
 from dataclasses import replace
 f=Fixture(True);f.sessions=0;f.approve('data')
 base=f.session_inventory(f.owner)
 changes={'incomplete':{'complete':False},'other':{'owner_id':f.other},'project':{'project_ref':'bbbbbbbbbbbbbbbbbbbb'},'operation':{'operation_id':uuid4()},'stale':{'captured_at':datetime.now(timezone.utc)-timedelta(seconds=31)},'future':{'captured_at':datetime.now(timezone.utc)+timedelta(seconds=31)},'naive':{'captured_at':datetime.now()},'bool':{'session_count':False},'negative':{'session_count':-1}}
 if bad=='missing':f.adapter.session_inventory=None
 elif bad=='error':
  def fail(owner):raise RuntimeError('private credential payload')
  f.adapter.session_inventory=fail
 else:f.adapter.session_inventory=lambda owner:replace(base,**changes[bad])
 with pytest.raises(AdapterError,match='session inventory') as error:f.adapter.revoke_sessions(f.owner)
 assert 'credential' not in str(error.value)
 assert not any(call[1] in ('/auth/v1/user','/auth/v1/logout') for call in f.calls)

@pytest.mark.parametrize('failure',['expired','logout_noop','logout_timeout'])
def test_nonzero_sessions_or_provider_failure_not_false_success(failure):
 f=Fixture(True);f.approve('data');f.error=failure
 with pytest.raises(AdapterError):f.adapter.revoke_sessions(f.owner)
 if failure=='logout_timeout':
  assert f.sessions==0
  f.adapter.revoke_sessions(f.owner) # Reconciles independent absence, not timeout status.
  assert sum(call[1]=='/auth/v1/logout' for call in f.calls)==1
 else:assert f.sessions==1

def test_new_session_between_absence_reads_blocks_retry():
 f=Fixture(True);f.sessions=0;f.approve('data')
 def race(owner):
  count=f.inventory_calls;f.inventory_calls+=1
  return SessionInventory(REF,owner,f.operation,True,0 if count==0 else 1,datetime.now(timezone.utc))
 f.adapter.session_inventory=race
 with pytest.raises(AdapterError,match='sessions remain'):f.adapter.revoke_sessions(f.owner)
 assert not any(call[1]=='/auth/v1/logout' for call in f.calls)

def test_changed_identity_or_barrier_after_zero_blocks_retry():
 for changed in ('identity','barrier'):
  f=Fixture(True);f.sessions=0;f.approve('data')
  def first(owner):
   if changed=='identity':f.created=NOW+timedelta(seconds=1)
   else:f.guard=False
   return SessionInventory(REF,owner,f.operation,True,0,datetime.now(timezone.utc))
  f.adapter.session_inventory=first
  with pytest.raises(AdapterError):f.adapter.revoke_sessions(f.owner)
  assert not any(call[1]=='/auth/v1/logout' for call in f.calls)

def test_integrated_workflow_repeated_revocation_uses_authoritative_absence():
 from contextlib import contextmanager
 from threading import RLock
 from copy import deepcopy
 from app.services.account_erasure_workflow import LocalWorkflow,ReviewEvidence
 f=Fixture(True);lock=RLock()
 class Repo:
  def __init__(self):self.op=None;self.counts={'ledger':2};self.q={'request_id':uuid4(),'version':1,'state':'deletion_pending'}
  @contextmanager
  def locked(self,owner):
   assert owner==f.owner
   with lock:yield
  def request(self,owner):return deepcopy(self.q)
  def inventory(self,owner):return deepcopy(self.counts)
  def review(self,e,counts):
   self.op={'id':f.operation,'owner_id':f.owner,'request_id':e.request_id,'request_version':1,'counts':counts,'holds':[],'state':'reviewed'};return deepcopy(self.op)
  def read(self,key):assert key==f.operation;return deepcopy(self.op)
  def begin(self,o):self.op['state']='erasing';return deepcopy(self.op)
  def erase_data(self,o):self.counts={'ledger':0};self.op['state']='data_erased';return deepcopy(self.op)
  def mark_auth_erased(self,o):self.op['state']='auth_erased';return deepcopy(self.op)
  def complete(self,o):self.op.update(state='completed',provider_status=o['provider_status']);return deepcopy(self.op)
 repo=Repo();f.adapter.guard_probe=lambda owner:repo.op['state'] in ('erasing','data_erased','auth_erased','completed')
 f.adapter.review=ProviderReview(f.owner,f.operation,NOW,{c:'pending' for c in PROVIDER_CATEGORIES})
 workflow=LocalWorkflow(repo,f.adapter,synthetic=True)
 workflow.review(ReviewEvidence(f.owner,repo.q['request_id'],1,NOW,'recent_owner_session','synthetic operator',True),NOW)
 def approve(phase):return Approval(f.operation,f.owner,phase,datetime.now(timezone.utc)+timedelta(minutes=2))
 assert workflow.step(approve('begin'),datetime.now(timezone.utc))['state']=='erasing'
 f.error='expired' # Real failed-gate wire response if revoked token were checked.
 assert workflow.step(approve('data'),datetime.now(timezone.utc))['state']=='data_erased'
 assert sum(call[1]=='/auth/v1/user' for call in f.calls)==1
 assert sum(call[1]=='/auth/v1/logout' for call in f.calls)==1
 assert workflow.step(approve('auth'),datetime.now(timezone.utc))['state']=='auth_erased'
 assert workflow.step(approve('complete'),datetime.now(timezone.utc))['state']=='completed'
 before=list(f.calls);workflow.step(approve('complete'),datetime.now(timezone.utc));assert f.calls==before
 assert workflow.receipt(f.operation)['communication_status']=='not_sent'


def test_inventory_reader_single_authoritative_query_and_wiring():
 f=Fixture(True);queries=[]
 def read(query):
  queries.append(query)
  return {'project_ref':REF,'owner_id':str(f.owner),'operation_id':str(f.operation),'created_at':NOW.isoformat(),'barrier_valid':True,'complete':True,'session_count':0,'captured_at':datetime.now(timezone.utc).isoformat()}
 reader=IsolatedSessionInventoryReader(project=f.adapter.project,owner=f.owner,operation=f.operation,expected_created_at=NOW,read=read)
 f.adapter.session_inventory=reader;f.approve('data');f.adapter.revoke_sessions(f.owner)
 assert len(queries)==2
 assert all(query.startswith('SELECT ') for query in queries)
 assert 'FROM auth.sessions s WHERE s.user_id=o.owner_id' in queries[0]
 assert 'not_after' not in queries[0] # Every row counts, even expired/nullable expiry.
 assert 'l.version=o.request_version+1' in queries[0]
 assert str(f.owner) in queries[0] and str(f.operation) in queries[0]
 assert not any(call[1] in ('/auth/v1/user','/auth/v1/logout') for call in f.calls)

@pytest.mark.parametrize('bad',['missing','owner','operation','created','barrier','complete','stale','future','count','permission'])
def test_management_reader_missing_or_changed_evidence_not_absence(bad):
 f=Fixture(True)
 row={'project_ref':REF,'owner_id':str(f.owner),'operation_id':str(f.operation),'created_at':NOW.isoformat(),'barrier_valid':True,'complete':True,'session_count':0,'captured_at':datetime.now(timezone.utc).isoformat()}
 changes={'owner':{'owner_id':str(f.other)},'operation':{'operation_id':str(uuid4())},'created':{'created_at':(NOW+timedelta(seconds=1)).isoformat()},'barrier':{'barrier_valid':False},'complete':{'complete':False},'stale':{'captured_at':(datetime.now(timezone.utc)-timedelta(seconds=31)).isoformat()},'future':{'captured_at':(datetime.now(timezone.utc)+timedelta(seconds=31)).isoformat()},'count':{'session_count':False}}
 row.update(changes.get(bad,{}))
 def read(query):
  if bad=='permission':raise RuntimeError('secret transport payload')
  return None if bad=='missing' else row
 reader=IsolatedSessionInventoryReader(project=f.adapter.project,owner=f.owner,operation=f.operation,expected_created_at=NOW,read=read)
 with pytest.raises(AdapterError,match='not confirmed') as error:reader(f.owner)
 assert 'secret' not in str(error.value)
 with pytest.raises(AdapterError):reader(f.other)

@pytest.mark.parametrize('elapsed',[180,181,600])
def test_slow_guard_expires_before_provider_action(monkeypatch,elapsed):
 import app.services.account_erasure_providers as module
 clock=[datetime.now(timezone.utc)]
 class Clock(datetime):
  @classmethod
  def now(cls,tz=None):return clock[0]
 monkeypatch.setattr(module,'datetime',Clock)
 f=Fixture(True);f.sessions=0
 f.adapter.authorize(Approval(f.operation,f.owner,'data',clock[0]+timedelta(seconds=180)))
 def slow(owner):clock[0]+=timedelta(seconds=elapsed);return True
 f.adapter.guard_probe=slow
 with pytest.raises(AdapterError) as failure:f.adapter.revoke_sessions(f.owner)
 assert failure.value.code=='approval_expired' and not f.calls
 assert f.objects and f.alive and f.sessions==0


def test_slow_inventory_failure_classified_and_fresh_recovery(monkeypatch):
 import app.services.account_erasure_providers as module
 clock=[datetime.now(timezone.utc)]
 class Clock(datetime):
  @classmethod
  def now(cls,tz=None):return clock[0]
 monkeypatch.setattr(module,'datetime',Clock)
 f=Fixture(True)
 def slow(owner):
  clock[0]+=timedelta(seconds=95)
  return ObjectInventory(REF,owner,True,tuple(f.objects))
 f.adapter.inventory=slow
 f.adapter.authorize(Approval(f.operation,f.owner,'data',clock[0]+timedelta(seconds=180)))
 with pytest.raises(AdapterError) as failure:f.adapter.erase_storage(f.owner)
 assert failure.value.code=='approval_expired'
 assert f.objects and not any(c[0]=='DELETE' for c in f.calls)
 f.adapter.preflight(f.owner)
 f.adapter.inventory=lambda owner:ObjectInventory(REF,owner,True,tuple(f.objects))
 f.adapter.authorize(Approval(f.operation,f.owner,'data',clock[0]+timedelta(seconds=180)))
 f.adapter.erase_storage(f.owner)
 assert not f.objects and sum(c[0]=='DELETE' for c in f.calls)==1


def test_approval_exact_clock_boundary_and_mismatch():
 from app.services.account_erasure import ApprovalFailure
 f=Fixture(True);now=datetime.now(timezone.utc)
 approval=Approval(f.operation,f.owner,'data',now)
 with pytest.raises(ApprovalFailure) as failure:approval.require({'id':f.operation,'owner_id':f.owner},'data',now)
 assert failure.value.code=='approval_expired'
 approval.require({'id':f.operation,'owner_id':f.owner},'data',now-timedelta(microseconds=1))
 with pytest.raises(ApprovalFailure) as failure:approval.require({'id':f.operation,'owner_id':f.other},'data',now-timedelta(seconds=1))
 assert failure.value.code=='approval_mismatch'


def test_paired_guard_session_read_consumed_once_and_race_detected():
 from app.services.account_erasure_providers import IsolatedGuardSessionEvidence
 f=Fixture(True);f.sessions=0;reads=[]
 def reader(owner):reads.append(owner);return f.session_inventory(owner)
 paired=IsolatedGuardSessionEvidence(reader)
 f.adapter.guard_probe=paired.guard;f.adapter.session_inventory=paired.inventory
 f.approve('data');f.adapter.revoke_sessions(f.owner)
 assert len(reads)==2
 with pytest.raises(AdapterError):paired.inventory(f.owner)
 assert paired.guard(f.owner)
 with pytest.raises(AdapterError):paired.inventory(f.other)
 with pytest.raises(AdapterError):paired.inventory(f.owner)
 # A new session between independent checkpoints is detected by the next read.
 def race(owner):
  evidence=reader(owner)
  f.sessions=1
  return evidence
 paired.reader=race;f.sessions=0
 f.approve('data')
 with pytest.raises(AdapterError):f.adapter.revoke_sessions(f.owner)
 assert not any(c[0] in ('POST','DELETE') for c in f.calls)


def test_paired_evidence_does_not_bypass_freshness(monkeypatch):
 from app.services.account_erasure_providers import IsolatedGuardSessionEvidence
 from dataclasses import replace
 f=Fixture(True);f.sessions=0
 paired=IsolatedGuardSessionEvidence(lambda owner:replace(f.session_inventory(owner),captured_at=datetime.now(timezone.utc)-timedelta(seconds=31)))
 f.adapter.guard_probe=paired.guard;f.adapter.session_inventory=paired.inventory;f.approve('data')
 with pytest.raises(AdapterError):f.adapter.revoke_sessions(f.owner)
 assert not any(c[0] in ('POST','DELETE') for c in f.calls)
