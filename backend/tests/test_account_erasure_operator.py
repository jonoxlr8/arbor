from copy import deepcopy
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4
import pytest

from app.services.account_erasure import Approval
from app.services.account_erasure_operator import (
    OperatorTarget, OperatorWorkflow, SqlOperatorRepository,
)
from app.services.account_erasure_workflow import ReviewEvidence
from tests.test_account_erasure_workflow import Repo, Provider


def setup(enabled=True):
    r, p = Repo(), Provider()
    now = datetime.now(timezone.utc)
    target = OperatorTarget('gnjjtlswwhkpiabyayvi', r.owner, uuid4(), now)
    r.target = target
    r.capabilities = lambda: {'schema': True, 'session_inventory': True, 'app_roles_denied': True}
    original = r.review
    def review(e, counts):
        original(e, counts)
        r.op['id'] = target.operation_id
        return deepcopy(r.op)
    r.review = review
    p.project, p.execution_enabled = target, enabled
    p.preflight = lambda owner: {'identity_matches': True, 'execution_enabled': enabled}
    w = OperatorWorkflow(r, p, target, execution_enabled=enabled)
    e = ReviewEvidence(r.owner, r.q['request_id'], 1, now,
                       'verified_existing_channel', 'Jonathan Isidoro', True)
    return r, p, w, e, now


def approve(r, phase, now):
    return Approval(r.target.operation_id, r.owner, phase, now + timedelta(seconds=90))


def test_production_target_supported_but_default_execution_disabled():
    r, p, w, e, now = setup(False)
    assert w.preflight()['execution_enabled'] is False
    with pytest.raises(ValueError, match='disabled'):
        w.review(e, now)
    with pytest.raises(ValueError):
        w.step(approve(r, 'begin', now))
    assert not p.calls


def test_whole_flow_restarts_from_each_checkpoint_without_new_operation():
    r, p, w, e, now = setup()
    w.review(e, now)
    for phase, state in [('begin','erasing'),('data','data_erased'),('auth','auth_erased'),('complete','completed')]:
        # New coordinator, same durable repository/provider state and binding.
        w = OperatorWorkflow(r, p, r.target, execution_enabled=True)
        assert w.step(approve(r, phase, now), now)['state'] == state
    assert r.op['provider_status'] == 'pending_copies'
    assert w.receipt()['communication_status']=='not_sent'
    assert w.receipt()['whole_account_erasure_claim'] is False
    assert r.other == {'ledger':4}
    before = p.calls[:]
    assert w.step(approve(r, 'complete', now), now)['state'] == 'completed'
    assert p.calls == before


@pytest.mark.parametrize('kind',['owner','operation','expiry','long','hold','cancel','version'])
def test_bound_admission_and_approval_guards(kind):
    r, p, w, e, now = setup()
    w.review(e, now)
    a = approve(r, 'begin', now)
    if kind == 'owner': a = replace(a, owner_id=uuid4())
    if kind == 'operation': a = replace(a, operation_id=uuid4())
    if kind == 'expiry': a = replace(a, expires_at=now-timedelta(seconds=1))
    if kind == 'long': a = replace(a, expires_at=now+timedelta(minutes=4))
    if kind == 'hold': r.op['holds']=[{'category':'ledger'}]
    if kind in ('cancel','version'):
        # SQL repository independently rejects changed request atomically;
        # model that dispatch guard rather than pretending memory is SQL.
        r.begin = lambda o: (_ for _ in ()).throw(ValueError('request_changed'))
    with pytest.raises((ValueError, RuntimeError)):
        w.step(a, now)
    assert not p.calls


def test_missing_capability_blocks_review_without_mutation():
    r, p, w, e, now = setup()
    r.capabilities = lambda: {'session_inventory':False}
    with pytest.raises(ValueError, match='unqualified'): w.review(e, now)
    assert not hasattr(r,'op') and not p.calls


def test_provider_failure_keeps_checkpoint_and_redacts_exception():
    r, p, w, e, now = setup()
    w.review(e, now); w.step(approve(r,'begin',now),now)
    p.fail=True
    with pytest.raises(RuntimeError, match='Phase not confirmed') as caught:
        w.step(approve(r,'data',now),now)
    assert 'private' not in str(caught.value)
    assert r.op['state']=='erasing'
    p.fail=False
    w.step(approve(r,'data',now),now)
    assert r.op['state']=='data_erased'


@pytest.mark.parametrize('url',[
    'http://gnjjtlswwhkpiabyayvi.supabase.co/auth/v1',
    'https://different.supabase.co/auth/v1',
    'https://gnjjtlswwhkpiabyayvi.supabase.co/auth/v1?key=private',
    'https://user@gnjjtlswwhkpiabyayvi.supabase.co/auth/v1',
])
def test_sdk_origin_is_exact(url):
    r, p, w, e, now = setup()
    with pytest.raises(ValueError): r.target.check_client(url,'/auth/v1')


def test_sql_repository_rejects_pooler_or_wrong_connection_before_queries():
    r, p, w, e, now = setup()
    for host in ['127.0.0.1','pooler.supabase.com','db.other.supabase.co']:
        with pytest.raises(ValueError): SqlOperatorRepository(SimpleNamespace(info=SimpleNamespace(host=host)),r.target)


def test_sql_failure_rolls_back_without_private_error_payload():
    r, p, w, e, now = setup()
    class Cursor:
        def __enter__(self): return self
        def __exit__(self,*a): pass
        def execute(self,*a): raise RuntimeError('secret connection payload')
    class Connection:
        info=SimpleNamespace(host=f'db.{r.target.ref}.supabase.co')
        rolled=False
        def cursor(self): return Cursor()
        def rollback(self): self.rolled=True
    connection=Connection(); repo=SqlOperatorRepository(connection,r.target)
    with pytest.raises(RuntimeError) as caught: repo.capabilities()
    assert connection.rolled and 'secret' not in str(caught.value)


def test_wrong_repository_phase_cannot_skip_session_checkpoint():
    r, p, w, e, now = setup()
    repo=object.__new__(SqlOperatorRepository)
    repo.target=r.target; repo._locked=True; repo.approval=approve(r,'begin',now)
    calls=[]; repo._query=lambda *a,**k:calls.append(a)
    with pytest.raises(ValueError,match='phase'):
        repo.erase_data({'id':r.target.operation_id,'owner_id':r.owner})
    assert not calls


def test_storage_inventory_rejects_large_accounts_without_truncation():
    r, p, w, e, now = setup()
    repo=object.__new__(SqlOperatorRepository);repo.target=r.target
    repo._query=lambda *a,**k:[{}]*10001
    with pytest.raises(ValueError,match='bound'):repo.object_inventory(r.owner)


def test_sql_cursor_handles_do_block_before_result_and_commits_once():
    r, p, w, e, now = setup()
    class Cursor:
        description=None
        def __enter__(self):return self
        def __exit__(self,*a):pass
        def execute(self,sql,*args):self.description=None
        def nextset(self):self.description=('json',);return True
        def fetchone(self):return ({'state':'completed'},)
    class Connection:
        info=SimpleNamespace(host=f'db.{r.target.ref}.supabase.co')
        commits=0
        def cursor(self):return Cursor()
        def commit(self):self.commits+=1
        def rollback(self):raise AssertionError('unexpected rollback')
    c=Connection();repo=SqlOperatorRepository(c,r.target)
    assert repo._query('DO fixture; SELECT result')=={'state':'completed'}
    assert c.commits==1


def test_operator_lock_is_released_on_provider_failure():
    r,p,w,e,now=setup()
    class Cursor:
        description=('bool',)
        def __enter__(self):return self
        def __exit__(self,*a):pass
        def execute(self,*a):pass
        def fetchone(self):return (True,)
    class Connection:
        info=SimpleNamespace(host=f'db.{r.target.ref}.supabase.co')
        def cursor(self):return Cursor()
        def commit(self):pass
        def rollback(self):pass
    repo=SqlOperatorRepository(Connection(),r.target)
    with pytest.raises(RuntimeError):
        with repo.locked(r.owner):
            raise RuntimeError('fixed test failure')
    assert repo._locked is False


def test_database_resume_does_not_call_storage_again():
    r,p,w,e,now=setup();w.review(e,now);w.step(approve(r,'begin',now),now)
    before=p.calls[:]
    result=w.resume_database(approve(r,'database',now),now)
    assert result['state']=='data_erased' and p.calls==before
    assert w.resume_database(approve(r,'database',now),now)['state']=='data_erased'
    assert p.calls==before


def test_database_resume_rejects_wrong_phase_and_hold():
    r,p,w,e,now=setup();w.review(e,now);w.step(approve(r,'begin',now),now)
    with pytest.raises(ValueError):w.resume_database(approve(r,'data',now),now)
    r.op['holds']=[{'category':'ledger'}]
    with pytest.raises(ValueError):w.resume_database(approve(r,'database',now),now)
