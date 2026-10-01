from contextlib import contextmanager
from copy import deepcopy
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from threading import RLock
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4
import pytest
from app.services.account_erasure import Approval
from app.services.account_erasure_workflow import LocalWorkflow, ReviewEvidence
NOW=datetime(2026,10,1,tzinfo=timezone.utc)
class Repo:
 def __init__(self):
  self.owner=uuid4();self.q=dict(request_id=uuid4(),version=1,state='deletion_pending');self.counts={'ledger':2};self.other={'ledger':4};self.lock=RLock()
 @contextmanager
 def locked(self,owner):
  assert owner==self.owner
  with self.lock:yield
 def request(self,owner):return deepcopy(self.q)
 def inventory(self,owner):return deepcopy(self.counts)
 def review(self,e,counts):
  self.op=dict(id=uuid4(),owner_id=self.owner,request_id=e.request_id,request_version=e.request_version,counts=counts,state='reviewed',holds=[]);return deepcopy(self.op)
 def read(self,key):
  assert key==self.op['id'];return deepcopy(self.op)
 def move(self,state):self.op['state']=state;return deepcopy(self.op)
 def begin(self,o):return self.move('erasing')
 def erase_data(self,o):self.counts={'ledger':0};return self.move('data_erased')
 def mark_auth_erased(self,o):return self.move('auth_erased')
 def complete(self,o):self.op['provider_status']=o['provider_status'];return self.move('completed')
class Provider:
 def __init__(self):self.calls=[];self.absent=False;self.fail=False
 def revoke_sessions(self,owner):self.calls.append('revoke')
 def erase_storage(self,owner):
  self.calls.append('storage')
  if self.fail:raise RuntimeError('private provider payload')
 def delete_auth(self,owner):self.calls.append('auth');self.absent=True
 def auth_absent(self,owner):return self.absent
 def assess_external_copies(self,owner):return 'pending_copies'
def setup():
 r,p=Repo(),Provider();w=LocalWorkflow(r,p,synthetic=True);e=ReviewEvidence(r.owner,r.q['request_id'],1,NOW,'recent_owner_session','operator',True);return r,p,w,e
def a(r,phase):return Approval(r.op['id'],r.owner,phase,NOW+timedelta(minutes=5))
def test_full_flow_minimal_truthful_unsent_receipt():
 r,p,w,e=setup();w.review(e,NOW)
 for phase in ['begin','data','auth','complete']:w.step(a(r,phase),NOW)
 receipt=w.receipt(r.op['id']);assert receipt['communication_status']=='not_sent' and not receipt['whole_account_erasure_claim'];assert receipt['provider_status']=='pending_copies';assert r.other=={'ledger':4} and r.counts=={'ledger':0}
 calls=p.calls[:];w.step(a(r,'complete'),NOW);assert calls==p.calls
@pytest.mark.parametrize('changes',[{'completion_channel_confirmed':False},{'operator':''},{'identity_method':'password'},{'request_version':2},{'verified_at':NOW.replace(tzinfo=None)}])
def test_review_rejects_missing_evidence(changes):
 r,p,w,e=setup()
 with pytest.raises(ValueError):w.review(replace(e,**changes),NOW)
 assert not p.calls
@pytest.mark.parametrize('change',['cancel','version','inventory','hold'])
def test_changed_admission_blocks(change):
 r,p,w,e=setup();w.review(e,NOW)
 if change=='cancel':r.q['state']='active'
 if change=='version':r.q['version']=2
 if change=='inventory':r.counts['ledger']=3
 if change=='hold':r.op['holds']=[{'category':'ledger'}]
 with pytest.raises(ValueError):w.step(a(r,'begin'),NOW)
 assert not p.calls
def test_partial_failure_retry():
 r,p,w,e=setup();w.review(e,NOW);w.step(a(r,'begin'),NOW);p.fail=True
 with pytest.raises(RuntimeError,match='Phase not confirmed'):w.step(a(r,'data'),NOW)
 assert r.op['state']=='erasing' and r.counts['ledger']==2
 with pytest.raises(ValueError):w.receipt(r.op['id'])
 p.fail=False;w.step(a(r,'data'),NOW);assert r.op['state']=='data_erased'
def test_concurrent_admission():
 r,p,w,e=setup();w.review(e,NOW);approval=a(r,'begin')
 def run(_):
  try:return w.step(approval,NOW)['state']
  except ValueError:return 'stale'
 with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(run,range(2)))
 assert sorted(results)==['erasing','stale'] and p.calls==['revoke']
def test_production_disabled():
 with pytest.raises(ValueError):LocalWorkflow(Repo(),Provider(),synthetic=False)

def test_local_repository_review_reconciles_existing_operation(monkeypatch):
 from scripts import account_erasure_repository_local as module
 r,p,w,e=setup();operation=uuid4();queries=[]
 def query(sql):
  queries.append(sql)
  if 'where owner_id=' in sql:return str(operation)
  return '{}'
 monkeypatch.setattr(module,'query',query)
 repository=object.__new__(module.LocalRepository)
 repository.read=lambda key:{'id':key,'counts':{'ledger':2}}
 assert repository.review(e,{'ledger':2})['id']==operation
 assert str(operation) in queries[1]
 assert 'erasure_review' in queries[1]

def test_repository_does_not_accept_changed_review_inventory(monkeypatch):
 from scripts import account_erasure_repository_local as module
 r,p,w,e=setup()
 monkeypatch.setattr(module,'query',lambda sql:'' if 'where owner_id=' in sql else '{}')
 repository=object.__new__(module.LocalRepository)
 repository.read=lambda key:{'id':key,'counts':{'ledger':3}}
 with pytest.raises(ValueError,match='Inventory changed'):repository.review(e,{'ledger':2})


def test_expired_storage_phase_has_safe_stage_and_code():
 from app.services.account_erasure import PhaseFailure
 from app.services.account_erasure_providers import AdapterError
 r,p,w,e=setup();w.review(e,NOW);w.step(a(r,'begin'),NOW)
 def expired(owner):raise AdapterError('never expose raw provider payload',code='approval_expired')
 p.erase_storage=expired
 with pytest.raises(PhaseFailure) as failure:w.step(a(r,'data'),NOW)
 assert (failure.value.phase,failure.value.stage,failure.value.code)==('data','storage_removal','approval_expired')
 assert 'payload' not in str(failure.value) and r.op['state']=='erasing' and r.counts['ledger']==2


def test_unknown_provider_code_and_payload_not_disclosed():
 from app.services.account_erasure import PhaseFailure
 r,p,w,e=setup();w.review(e,NOW);w.step(a(r,'begin'),NOW);p.fail=True
 with pytest.raises(PhaseFailure) as failure:w.step(a(r,'data'),NOW)
 assert failure.value.code=='phase_unconfirmed' and failure.value.stage=='storage_removal'
 assert 'private' not in str(failure.value)
