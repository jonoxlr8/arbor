from dataclasses import replace
from datetime import datetime,timedelta,timezone
from uuid import uuid4
import pytest
from app.services.account_erasure import Approval,ApprovalFailure,PhaseFailure
from app.services.account_erasure_continuation import DatabaseContinuation,DatabaseEvidence
NOW=datetime(2026,10,1,tzinfo=timezone.utc)
class Repo:
 def __init__(self):
  self.owner,self.op=uuid4(),uuid4();self.writes=0
  self.operation=dict(id=self.op,owner_id=self.owner,state='erasing',holds=[],counts={'ledger':2})
  self.e=DatabaseEvidence(self.owner,self.op,NOW,NOW,True,True,0,0,{'ledger':2})
  self.fail=False
 def read(self,key):assert key==self.op;return self.operation.copy()
 def evidence(self,owner,key):assert owner==self.owner and key==self.op;return self.e
 def erase_database_bound(self,a,e):
  if self.fail:raise ApprovalFailure('approval_expired')
  self.writes+=1;self.operation['state']='data_erased';return self.operation.copy()
def setup():
 r=Repo();clock=[NOW];w=DatabaseContinuation(r,lambda owner:None,NOW,synthetic=True,clock=lambda:clock[0]);a=Approval(r.op,r.owner,'database',NOW+timedelta(seconds=180));return r,w,a,clock

def test_storage_not_replayed_database_once_durable_retry():
 r,w,a,c=setup();assert w.step(a)['state']=='data_erased'
 c[0]+=timedelta(days=1);assert w.step(a)['state']=='data_erased' and r.writes==1

@pytest.mark.parametrize('changes',[{'complete':False},{'barrier_valid':False},{'sessions':1},{'sessions':False},{'owned_objects':1},{'owner_id':uuid4()},{'operation_id':uuid4()},{'counts':{'ledger':3}},{'created_at':NOW+timedelta(seconds=1)},{'captured_at':NOW-timedelta(seconds=31)}])
def test_checkpoint_fail_closed(changes):
 r,w,a,c=setup();r.e=replace(r.e,**changes)
 with pytest.raises(PhaseFailure):w.step(a)
 assert not r.writes

@pytest.mark.parametrize('delay',[180,181,600])
def test_slow_read_expiry_no_auto_renew(delay):
 r,w,a,c=setup()
 def slow(owner,key):c[0]+=timedelta(seconds=delay);return replace(r.e,captured_at=c[0])
 r.evidence=slow
 with pytest.raises(PhaseFailure) as failure:w.step(a)
 assert failure.value.code=='approval_expired' and not r.writes


def test_identity_delay_makes_evidence_stale():
 r,w,a,c=setup();w.verify_identity=lambda owner:c.__setitem__(0,NOW+timedelta(seconds=31))
 with pytest.raises(PhaseFailure):w.step(a)
 assert not r.writes


def test_transaction_expiry_reported_no_false_success():
 r,w,a,c=setup();r.fail=True
 with pytest.raises(PhaseFailure) as failure:w.step(a)
 assert failure.value.stage=='database_dispatch' and failure.value.code=='approval_expired' and not r.writes


def test_fresh_review_and_separate_approval_recover():
 r,w,a,c=setup();c[0]+=timedelta(seconds=180)
 with pytest.raises(PhaseFailure):w.step(a)
 r.e=replace(r.e,captured_at=c[0]);new=replace(a,expires_at=c[0]+timedelta(seconds=180))
 assert w.step(new)['state']=='data_erased' and r.writes==1


def test_wrong_owner_and_production_rejected():
 r,w,a,c=setup()
 with pytest.raises(PhaseFailure):w.step(replace(a,owner_id=uuid4()))
 assert not r.writes
 with pytest.raises(ValueError):DatabaseContinuation(r,lambda owner:None,NOW,synthetic=False)


def test_dispatch_transaction_binds_owner_identity_expiry_after_lock():
 from app.services.account_erasure_continuation import database_dispatch_sql
 r,w,a,c=setup();r.e=replace(r.e,counts={'arbor_investment_entries':2})
 query=database_dispatch_sql(a,r.e)
 assert query.index('pg_advisory_xact_lock')<query.index('erasure_approval_expired')<query.index('PERFORM arbor_private.erasure_data')
 assert str(r.owner) in query and str(r.op) in query and 'auth.sessions' in query and 'storage.objects' in query and 'created_at=' in query
 assert 'jsonb_strip_nulls' in query and 'request_id=o.request_id' in query
 with pytest.raises(ApprovalFailure):database_dispatch_sql(replace(a,phase='data'),r.e)
 with pytest.raises(ApprovalFailure):database_dispatch_sql(a,replace(r.e,counts={'arbitrary_table':1}))
