from types import SimpleNamespace
from uuid import uuid4
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from app.routes.account import router
from app.services import account_lifecycle as service
from app import auth

ACTIVE={'state':'active','version':0,'access_allowed':True,'deletion_request':None,'in_flight_reminders':0,'erasure_available':False}
@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(service,'lifecycle',lambda *args:ACTIVE)
    app=FastAPI(); app.include_router(router); return TestClient(app)

def test_status_and_action_contract(client,monkeypatch):
    calls=[]
    monkeypatch.setattr(service,'lifecycle',lambda *a:calls.append(a) or ACTIVE)
    response=client.get('/account/lifecycle',headers={'Authorization':'Bearer synthetic'})
    assert response.status_code==200 and response.headers['cache-control']=='private, no-store'
    action={'expected_version':0,'action_id':str(uuid4()),'confirm':True}
    for path in ['/account/deactivate','/account/deletion-requests','/account/deletion-requests/current/withdraw']:
        assert client.post(path,json=action).status_code==200
        assert client.post(path,json={**action,'user_id':'B'}).status_code==422
        assert client.post(path,json={**action,'expected_version':True}).status_code==422
    assert client.post('/account/lifecycle/login').status_code==200
    assert client.get('/account/lifecycle?user_id=B').status_code==400
    assert calls[0][0]=='Bearer synthetic'

@pytest.mark.parametrize('status',[401,403,409,429,503])
def test_safe_route_failure(client,monkeypatch,status):
    def fail(*a):raise HTTPException(status,'Safe error')
    monkeypatch.setattr(service,'lifecycle',fail)
    response=client.get('/account/lifecycle')
    assert response.status_code==status and response.headers['cache-control']=='private, no-store'

def test_normal_auth_fail_closed_and_export_identity_separate(monkeypatch):
    monkeypatch.setattr(auth,'get_verified_user_id',lambda token:'A')
    calls=[]
    monkeypatch.setattr(service,'lifecycle',lambda token:calls.append(token) or {**ACTIVE,'access_allowed':False})
    with pytest.raises(HTTPException) as caught:auth.get_current_user_id('Bearer synthetic')
    assert caught.value.status_code==403 and calls==['Bearer synthetic']
    monkeypatch.setattr(service,'lifecycle',lambda token:ACTIVE)
    assert auth.get_current_user_id('Bearer synthetic')=='A'

@pytest.mark.parametrize('code,status',[('PT401',401),('PT403',403),('PT400',400),('PT409',409),('55P03',429),('42501',503)])
def test_rpc_safe_errors_no_secret_spill(monkeypatch,code,status):
    from app import database
    monkeypatch.setattr(auth,'get_verified_user_id',lambda token:'A')
    class Error(Exception):pass
    error=Error('private payload');error.code=code;error.message='private payload'
    def fail(*args):raise error
    monkeypatch.setattr(database,'get_authenticated_client',lambda token:SimpleNamespace(rpc=fail))
    with pytest.raises(HTTPException) as caught:service.lifecycle('Bearer synthetic')
    assert caught.value.status_code==status and 'private payload' not in caught.value.detail

def test_rpc_never_trusts_owner_selector(monkeypatch):
    from app import database
    monkeypatch.setattr(auth,'get_verified_user_id',lambda token:'A')
    calls=[]
    monkeypatch.setattr(database,'get_authenticated_client',lambda token:SimpleNamespace(rpc=lambda name,params:calls.append((name,params)) or SimpleNamespace(execute=lambda:SimpleNamespace(data=ACTIVE))))
    assert service.lifecycle('Bearer synthetic')==ACTIVE
    assert 'user_id' not in calls[0][1]
