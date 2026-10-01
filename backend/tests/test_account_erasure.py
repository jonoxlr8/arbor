from copy import deepcopy
from datetime import datetime, timedelta, timezone
from uuid import uuid4
import pytest
from app.services.account_erasure import Approval, advance, review_targets, support_cleanup_due

NOW=datetime(2026,10,1,tzinfo=timezone.utc)
class Store:
    def __init__(self):
        self.operation={'id':uuid4(),'owner_id':uuid4(),'state':'reviewed','holds':[]}
        self.other={'financial_data':'unchanged'}
        self.fail=None
    def read(self, key):
        assert key==self.operation['id']
        return deepcopy(self.operation)
    def transition(self, state):
        if self.fail==state: raise RuntimeError('private database detail')
        self.operation['state']=state
        return deepcopy(self.operation)
    def begin(self, operation): return self.transition('erasing')
    def erase_data(self, operation): return self.transition('data_erased')
    def mark_auth_erased(self, operation): return self.transition('auth_erased')
    def complete(self, operation): return self.transition('completed')
class Providers:
    def __init__(self): self.calls=[];self.fail=None;self.absent=False;self.assessed=True
    def call(self, phase):
        self.calls.append(phase)
        if self.fail==phase:raise RuntimeError('private provider token')
    def revoke_sessions(self, owner): self.call('revoke')
    def erase_storage(self, owner): self.call('storage')
    def delete_auth(self, owner): self.call('auth');self.absent=True
    def auth_absent(self, owner): return self.absent
    def assess_external_copies(self, owner): return self.assessed

def approval(s, intended_phase, **changes):
    return Approval(**{'operation_id':s.operation['id'],'owner_id':s.operation['owner_id'],'phase':intended_phase,'expires_at':NOW+timedelta(minutes=5),**changes})
def run(s,p,phase):return advance(s,p,s.operation['id'],approval(s,phase),NOW)
def test_full_order_isolation_and_completed_retry():
    s,p=Store(),Providers()
    for phase in ['begin','data','auth','complete']:run(s,p,phase)
    assert p.calls==['revoke','revoke','storage','auth']
    assert s.other=={'financial_data':'unchanged'}
    assert run(s,p,'complete')['state']=='completed' and len(p.calls)==4
@pytest.mark.parametrize('field,value',[('owner_id',uuid4()),('operation_id',uuid4()),('phase','auth'),('expires_at',NOW),('expires_at',NOW.replace(tzinfo=None))])
def test_approval_is_bounded(field,value):
    s,p=Store(),Providers()
    with pytest.raises(ValueError):advance(s,p,s.operation['id'],approval(s,'begin',**{field:value}),NOW)
    assert p.calls==[] and s.operation['state']=='reviewed'
@pytest.mark.parametrize('failure,state,phase',[('revoke','erasing','begin'),('storage','erasing','data'),('auth','data_erased','auth')])
def test_provider_uncertainty_never_advances(failure,state,phase):
    s,p=Store(),Providers()
    if phase!='begin':run(s,p,'begin')
    if phase=='auth':run(s,p,'data')
    p.fail=failure
    with pytest.raises(RuntimeError,match='Phase not confirmed') as e:run(s,p,phase)
    assert 'token' not in str(e.value) and s.operation['state']==state
    p.fail=None
    # Begin committed its barrier before revocation failed; retry data safely.
    run(s,p,'data' if phase=='begin' else phase)
@pytest.mark.parametrize('state,phase',[('data_erased','data'),('auth_erased','auth'),('completed','complete')])
def test_store_failure_no_silent_success(state,phase):
    s,p=Store(),Providers();run(s,p,'begin')
    if phase in ['auth','complete']:run(s,p,'data')
    if phase=='complete':run(s,p,'auth')
    previous=s.operation['state'];s.fail=state
    with pytest.raises(RuntimeError):run(s,p,phase)
    assert s.operation['state']==previous
    s.fail=None;run(s,p,phase)
def test_unassessed_provider_copies_block_completion():
    s,p=Store(),Providers()
    for phase in ['begin','data','auth']:run(s,p,phase)
    p.assessed=False
    with pytest.raises(RuntimeError):run(s,p,'complete')
    assert s.operation['state']=='auth_erased'

def test_completion_carries_provider_status_without_upgrading_boolean_evidence():
    s,p=Store(),Providers()
    for phase in ['begin','data','auth']:run(s,p,phase)
    received=[]
    s.complete=lambda operation:received.append(operation['provider_status']) or s.transition('completed')
    run(s,p,'complete')
    assert received==['pending_copies']
def test_holds_stop_execution():
    s,p=Store(),Providers();s.operation['holds']=[{'category':'ledger'}]
    with pytest.raises(ValueError):run(s,p,'begin')
    assert p.calls==[]
def test_business_day_targets_and_no_fake_legal_deadline():
    friday=NOW.replace(day=2)
    targets=review_targets(friday,NOW)
    assert targets['acknowledge_by'].day==6 and targets['assess_by'].day==9
    assert targets['complete_target']==NOW+timedelta(days=30)
    assert review_targets(NOW)['complete_target'] is None
@pytest.mark.parametrize('held,reopened',[(True,False),(False,True),(True,True)])
def test_support_hold_and_reopening(held,reopened):
    assert not support_cleanup_due(NOW,NOW+timedelta(days=400),held=held,reopened=reopened)
def test_support_calendar_month_end():
    resolved=datetime(2026,8,31,tzinfo=timezone.utc)
    assert not support_cleanup_due(resolved,datetime(2027,2,27,tzinfo=timezone.utc))
    assert support_cleanup_due(resolved,datetime(2027,2,28,tzinfo=timezone.utc))

@pytest.mark.parametrize("processing", [{"state":"reviewed","verified_at":"invalid","completion_target":"2026-10-31T00:00:00Z","held":False},{"state":"reviewed","verified_at":"2026-10-01T00:00:00Z","completion_target":"2026-10-31T00:00:00Z","held":False,"private_note":"forbidden"}])
def test_status_rejects_invalid_or_private_processing(monkeypatch,processing):
    from types import SimpleNamespace
    from fastapi import HTTPException
    from app import auth,database
    from app.services import account_lifecycle
    monkeypatch.setattr(auth,"get_verified_user_id",lambda token:"A")
    result={"state":"deletion_pending","version":1,"access_allowed":False,"in_flight_reminders":0,"erasure_available":False,"processing":processing}
    monkeypatch.setattr(database,"get_authenticated_client",lambda token:SimpleNamespace(rpc=lambda *a:SimpleNamespace(execute=lambda:SimpleNamespace(data=result))))
    with pytest.raises(HTTPException) as e:account_lifecycle.lifecycle("Bearer synthetic")
    assert e.value.status_code==503
