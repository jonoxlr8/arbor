from types import SimpleNamespace
from uuid import uuid4
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.auth import get_current_user_id
from app.routes import ask_feedback as route
from app.services.arbor.answer_presentation import present_answer

@pytest.fixture
def client(monkeypatch):
    app=FastAPI();app.include_router(route.router)
    app.dependency_overrides[get_current_user_id]=lambda:'synthetic-owner'
    calls=[]
    def rpc(name,params):
        calls.append((name,params));return SimpleNamespace(execute=lambda:SimpleNamespace(data={'available':True} if name.endswith('access_v1') else {'saved':True,'helpful':params['p_helpful'],'reason':params['p_reason']}))
    monkeypatch.setattr(route,'get_authenticated_client',lambda jwt:SimpleNamespace(rpc=rpc))
    return TestClient(app),calls

BASE={'helpful':False,'reason':None,'intent':'actual_holdings','answer_version':'deterministic-ask-1'}
HEADERS={'Authorization':'Bearer synthetic-fixture'}
def test_vote_only_and_auth_derived_no_store(client):
    api,calls=client;key=str(uuid4())
    assert api.get('/ask/feedback/access',headers=HEADERS).json()=={'available':True}
    result=api.put('/ask/feedback/'+key,headers=HEADERS,json=BASE)
    assert result.status_code==200 and result.headers['Cache-Control']=='private, no-store'
    assert calls[-1]==('arbor_ask_feedback_save_v1',{'p_id':key,'p_helpful':False,'p_reason':None,'p_intent':'actual_holdings','p_answer_version':'deterministic-ask-1'})
    assert api.put('/ask/feedback/'+key,headers=HEADERS,json={**BASE,'reason':'unclear'}).json()['saved']
@pytest.mark.parametrize('patch',[{'question':'PRIVATE'},{'reply':'PRIVATE'},{'user_id':'another'},{'holdings':[]},{'amount':100},{'helpful':1},{'reason':'PRIVATE'},{'intent':'PRIVATE'},{'answer_version':'unknown'}])
def test_private_or_unreviewed_fields_rejected_before_database(client,patch):
    api,calls=client;assert api.put('/ask/feedback/'+str(uuid4()),headers=HEADERS,json={**BASE,**patch}).status_code==422;assert calls==[]
def test_missing_bearer_and_account_selector_no_database(client):
    api,calls=client;assert api.get('/ask/feedback/access').status_code==401
    assert api.get('/ask/feedback/access?user_id=another',headers=HEADERS).status_code==422;assert calls==[]
@pytest.mark.parametrize('code,status',[('PT401',401),('PT403',403),('PT409',409),('PT422',422),('PT429',429),('23505',503)])
def test_database_failures_sanitized(client,monkeypatch,code,status):
    api,_=client
    class Failure(Exception):pass
    error=Failure('PRIVATE customer data');error.code=code
    def fail(*args):raise error
    monkeypatch.setattr(route,'get_authenticated_client',fail)
    result=api.put('/ask/feedback/'+str(uuid4()),headers=HEADERS,json=BASE)
    assert result.status_code==status;assert 'PRIVATE' not in result.text
@pytest.mark.parametrize('code',['PGRST202','42883'])
def test_uninstalled_schema_is_honestly_unavailable(client,monkeypatch,code):
    api,_=client
    class Failure(Exception):pass
    error=Failure();error.code=code
    def fail(*args):raise error
    monkeypatch.setattr(route,'get_authenticated_client',fail)
    assert api.get('/ask/feedback/access',headers=HEADERS).json()=={'available':False}
@pytest.mark.parametrize('warning',['Missing cost context.','Current value is unavailable.','Values include cached prices.','This is an estimate.','This is not a forecast.'])
def test_summary_does_not_hide_uncertainty(warning):
    reply='Your recorded value is ₱10,000. Your current plan is saved. '+('Useful detail. '*35)+warning
    entitlements=SimpleNamespace(features=['live_portfolio'])
    result=present_answer({'reply':reply,'intent':'actual_holdings'},entitlements)
    assert result['reply']==reply and 'summary' not in result
    assert result['action']=='portfolio'
def test_summary_navigation_no_arithmetic_and_feature_gate():
    text='Your saved plan uses your chosen targets. You can review them in your plan. '+('Useful detail. '*35)
    result=present_answer({'reply':text,'intent':'plan'},SimpleNamespace(features=[]))
    assert result['summary']=='Your saved plan uses your chosen targets. You can review them in your plan.'
    assert present_answer({'reply':'What If','intent':'projection'},SimpleNamespace(features=[]))['action']=='access'

@pytest.mark.parametrize('patch',[{'question':'PRIVATE'},{'user_id':'another'},{'helpful':1},{'reason':'private'},{'intent':'private'},{'created_at':'bad'},{'id':'bad'}])
def test_export_feedback_is_finite_and_contains_no_chat(patch):
    from app.schemas.account_export import validate_export
    from test_account_export import body,A
    row={'id':str(uuid4()),'helpful':False,'reason':None,'intent':'actual_holdings','answer_version':'deterministic-ask-1','created_at':'2026-10-03T00:00:00+00:00'}
    assert validate_export({**body(),'ask_feedback':[row]},A)['ask_feedback']==[row]
    with pytest.raises((ValueError,TypeError)):validate_export({**body(),'ask_feedback':[{**row,**patch}]},A)

def test_plan_summary_keeps_whole_intro_without_partial_allocation():
    text='You selected the Growth approach. Your choice stays saved.\n\n- Global Equity: 80% target. '+('Other details. '*35)
    result=present_answer({'reply':text,'intent':'plan'},SimpleNamespace(features=[]))
    assert result['summary']=='You selected the Growth approach. Your choice stays saved.'
    assert 'Global Equity' not in result['summary']
