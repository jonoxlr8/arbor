from concurrent.futures import ThreadPoolExecutor
from threading import Lock
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from app.routes import chat, account, contributions
from app.services import ask_usage as meter
from app.services.entitlements import get_entitlements, resolve_entitlements, require_feature
from app.services.next_action import get_next_action
from test_profile_v2 import harness, BASE, HEADERS
from test_profile_edit_v2 import setup, edit, SAVE


@pytest.mark.parametrize('tier,status,effective', [('free','active','free'), ('plus','trial','plus'), ('plus','active','plus'), ('plus','expired','free')])
def test_feature_matrix(tier, status, effective):
    value = resolve_entitlements(tier, status)
    assert value.effective_tier == effective
    assert {'plan_creation','basic_projection','basic_implementation','ask_arbor_basic','next_action'} <= set(value.features)
    assert ('profile_rebuild' in value.features) == (effective == 'plus')
    assert ('monthly_contribution_planner' in value.features) == (effective == 'plus')
    assert value.ask_monthly_limit == (10 if effective == 'free' else None)


def qa(monkeypatch, mode='free'):
    for key in ('RENDER', 'VERCEL'):
        monkeypatch.delenv(key, raising=False)
    for key, value in {'APP_ENV':'test','ARBOR_ENTITLEMENT_QA_ENABLED':'true','ARBOR_E2E_USER_ID':'A','ARBOR_ENTITLEMENT_QA_MODE':mode}.items():
        monkeypatch.setenv(key, value)


@pytest.mark.parametrize('mode,effective,status', [('free','free','active'),('plus_trial','plus','trial'),('plus_active','plus','active'),('expired_plus','free','expired')])
def test_qa_owner_scoped(monkeypatch, mode, effective, status):
    qa(monkeypatch, mode)
    assert get_entitlements('A').effective_tier == effective
    assert get_entitlements('A').status == status
    assert get_entitlements('B') == resolve_entitlements()


@pytest.mark.parametrize('key,value', [('APP_ENV','production'),('APP_ENV',''),('RENDER','true'),('VERCEL','1'),('ARBOR_ENTITLEMENT_QA_ENABLED','false'),('ARBOR_E2E_USER_ID','B')])
def test_override_disabled_outside_safe_qa(monkeypatch, key, value):
    qa(monkeypatch); monkeypatch.setenv(key,value)
    assert get_entitlements('A') == resolve_entitlements()


@pytest.mark.parametrize('status', ['trial','active'])
def test_plus_never_constructs_quota_client(monkeypatch, status):
    monkeypatch.setattr(meter, 'get_authenticated_client', lambda *_: pytest.fail('Plus touched quota storage'))
    for consume in (False,True):
        assert meter.ask_usage(resolve_entitlements('plus',status), None, consume=consume) is None


@pytest.fixture
def store(monkeypatch):
    counts = {}; lock = Lock()
    def client(token):
        def rpc(name, params):
            assert name == 'arbor_ask_usage'
            assert set(params) == {'p_consume'} # no owner/count/period supplied by API
            def execute():
                with lock:
                    used = counts.get(token, 0); allowed = used < 10
                    if params['p_consume'] and allowed:
                        used += 1; counts[token] = used
                    return SimpleNamespace(data={'used':used,'remaining':10-used,'allowed':allowed,'period':'2026-09-01'})
            return SimpleNamespace(execute=execute)
        return SimpleNamespace(rpc=rpc)
    monkeypatch.setattr(meter, 'get_authenticated_client', client)
    return counts


def test_parallel_admission_and_owners(store):
    free = resolve_entitlements('free','active')
    with ThreadPoolExecutor(max_workers=16) as pool:
        results = list(pool.map(lambda _: meter.ask_usage(free,'Bearer A',consume=True), range(40)))
    assert sum(r['allowed'] for r in results) == 10
    assert store == {'A':10}
    assert meter.ask_usage(free,'Bearer B')['used'] == 0


def test_ten_successful_chat_answers_then_block(harness, monkeypatch, store):
    client,state = harness; setup(client,state); qa(monkeypatch)
    for n in range(1,11):
        result = client.post('/chat',json={'message':'Explain my investment plan'},headers=HEADERS)
        assert result.status_code == 200
        assert result.json()['ask_usage']['used'] == n
        assert result.json()['reply']
    result = client.post('/chat',json={'message':'Explain my investment plan'},headers=HEADERS)
    assert result.status_code == 429
    assert result.json()['detail']['code'] == 'ask_arbor_limit'
    assert store == {'test':10}


def test_failed_generation_and_invalid_requests_not_charged(harness, monkeypatch, store):
    client,state = harness; setup(client,state); qa(monkeypatch)
    monkeypatch.setattr(chat,'explain_v2',lambda *_: (_ for _ in ()).throw(ValueError()))
    assert client.post('/chat',json={'message':'Explain my plan'},headers=HEADERS).status_code == 503
    assert client.post('/chat',json={'message':''},headers=HEADERS).status_code == 422
    assert client.post('/chat',json={'message':'Explain my plan','tier':'plus'},headers=HEADERS).status_code == 422
    assert store == {}


def test_free_missing_migration_fails_closed_but_account_metadata_works(harness, monkeypatch):
    client,state = harness; setup(client,state); qa(monkeypatch)
    client.app.include_router(account.router)
    monkeypatch.setattr(meter,'get_authenticated_client',lambda *_: (_ for _ in ()).throw(RuntimeError('missing relation secret')))
    result = client.post('/chat',json={'message':'Explain my plan'},headers=HEADERS)
    assert result.status_code == 503 and 'secret' not in result.text
    result = client.get('/account/entitlements',headers=HEADERS)
    assert result.status_code == 200 and result.json()['ask_usage_available'] is False
    assert result.headers['cache-control'] == 'private, no-store'


def test_free_basic_plan_preserved_plus_routes_gated(harness, monkeypatch, store):
    client,state = harness; saved=setup(client,state); qa(monkeypatch)
    client.app.include_router(contributions.router)
    assert client.get('/profiles/me',headers=HEADERS).json() == saved
    assert client.post('/v2/approaches',json=BASE,headers=HEADERS).status_code == 200
    assert client.post('/v2/profiles/preview',json=edit(saved),headers=HEADERS).status_code == 403
    assert client.put(SAVE,json=edit(saved),headers=HEADERS).status_code == 403
    # Feature dependency executes before body conversion/domain calculation.
    for endpoint in ('recommendation','plan'):
        assert client.post('/contributions/'+endpoint,json={},headers=HEADERS).status_code == 403
    action=client.get('/v2/next-action',headers=HEADERS).json()
    assert action['destination']=='settings' and action['button_label']=='Explore Arbor Plus'
    assert get_next_action(saved).destination == 'portfolio'
    assert client.get('/profiles/me',headers=HEADERS).json() == saved


@pytest.mark.parametrize('mode', ['plus_trial','plus_active'])
def test_beta_chat_and_account_no_missing_table_dependency(harness, monkeypatch, mode):
    client,state=harness; setup(client,state); qa(monkeypatch,mode)
    client.app.include_router(account.router)
    monkeypatch.setattr(meter,'get_authenticated_client',lambda *_: pytest.fail('Plus queried quota'))
    for _ in range(11):
        assert client.post('/chat',json={'message':'Explain my plan'},headers=HEADERS).status_code==200
    response=client.get('/account/entitlements?user_id=B&tier=free',headers=HEADERS)
    assert response.json()['effective_tier']=='plus'
    assert response.json()['ask_usage'] is None


def test_product_support_uses_server_tier_without_changing_investment_explanation(harness, monkeypatch, store):
    client,state=harness; setup(client,state)
    before=client.post('/chat',json={'message':'Explain my plan'},headers=HEADERS).json()['reply']
    qa(monkeypatch)
    after=client.post('/chat',json={'message':'Explain my plan'},headers=HEADERS).json()['reply']
    assert before == after
    assert 'Arbor Free' in client.post('/chat',json={'message':'What subscription plan am I on?'},headers=HEADERS).json()['reply']


def test_exhausted_fixture_is_private_qa_only(monkeypatch):
    qa(monkeypatch)
    monkeypatch.setenv('ARBOR_ENTITLEMENT_QA_ASK_EXHAUSTED','true')
    monkeypatch.setattr(meter,'get_authenticated_client',lambda *_: pytest.fail('Fixed QA fixture queried storage'))
    value=get_entitlements('A')
    assert 'qa_exhausted' not in value.model_dump()
    assert meter.ask_usage(value,'Bearer test')['remaining']==0
    assert not meter.ask_usage(value,'Bearer test',consume=True)['allowed']
    assert not get_entitlements('B').qa_exhausted
    monkeypatch.setenv('APP_ENV','production')
    assert not get_entitlements('A').qa_exhausted


def test_free_new_user_can_create_plan_and_no_cross_account_tier(harness, monkeypatch, store):
    client,state=harness; qa(monkeypatch)
    client.app.include_router(account.router)
    assert client.post('/v2/profiles',json=BASE,headers=HEADERS).status_code==200
    result=client.get('/account/entitlements?user_id=B&tier=plus',headers=HEADERS).json()
    assert result['effective_tier']=='free'
    assert client.get('/account/entitlements').status_code==401
    state['user']='B'
    assert client.get('/account/entitlements',headers=HEADERS).json()['private_beta'] is True
    assert client.get('/profiles/me',headers=HEADERS).status_code==404


@pytest.mark.parametrize('data',[None,{}, {'used':-1}, {'used':0,'remaining':9,'allowed':True,'period':'2026-09-01'}])
def test_malformed_storage_response_fails_closed(monkeypatch,data):
    monkeypatch.setattr(meter,'get_authenticated_client',lambda *_: SimpleNamespace(rpc=lambda *_: SimpleNamespace(execute=lambda:SimpleNamespace(data=data))))
    with pytest.raises(HTTPException) as error:
        meter.ask_usage(resolve_entitlements('free','active'),'Bearer test',consume=True)
    assert error.value.status_code==503


@pytest.mark.parametrize('question,intent', [('Write Python about Arbor Plus','out_of_scope'),('Is VT best for me on Arbor Plus?','decision_boundary'),('What should I do next?','next_action')])
def test_subscription_does_not_bypass_existing_scope_guards(harness, monkeypatch, store, question, intent):
    client,state=harness; setup(client,state); qa(monkeypatch)
    result=client.post('/chat',json={'message':question},headers=HEADERS)
    assert result.status_code==200 and result.json()['intent']==intent
    if intent=='next_action':
        assert 'Settings → Arbor Plus' in result.json()['reply']
