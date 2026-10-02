from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from fastapi import HTTPException
from pydantic import ValidationError

from app.auth import get_current_user_id
from app.routes import investment_requests as route
from app.services import investment_requests as service
from app.schemas.investment_requests import InvestmentRequest

OWNER = '00000000-0000-4000-8000-000000000001'
BODY = {'investment_name': 'Example Index Fund', 'provider': 'Example Broker', 'idempotency_key': str(uuid4())}
RECEIPT = {'id': str(uuid4()), 'investment_name': BODY['investment_name'], 'provider': BODY['provider'],
           'received_at': '2026-10-03T00:00:00Z', 'status': 'received'}


def client(authenticated=True):
    app = FastAPI(); app.include_router(route.router)
    if authenticated:
        app.dependency_overrides[get_current_user_id] = lambda: OWNER
    return TestClient(app)


def test_route_is_authenticated_and_only_collects_requested_fields(monkeypatch):
    seen = []
    monkeypatch.setattr(route, 'submit_investment_request', lambda token, body: seen.append((token, body)) or RECEIPT)
    with client(False) as c:
        assert c.post('/v2/investment-requests', json=BODY).status_code == 401
    with client() as c:
        for extra in ['user_id', 'email', 'units', 'amount_paid_php', 'admin']:
            assert c.post('/v2/investment-requests', json={**BODY, extra: 'ignored?'}).status_code == 422
        response = c.post('/v2/investment-requests', json=BODY, headers={'Authorization': 'Bearer synthetic'})
        assert response.status_code == 200 and response.json() == RECEIPT
        assert c.get('/v2/investment-requests').status_code == 405
    assert len(seen) == 1 and seen[0][0] == 'Bearer synthetic'


@pytest.mark.parametrize('field,value', [('investment_name',''),('provider','  '),('investment_name','a'*121),('provider','a'*81),('provider',None),('investment_name',123),('investment_name','invalid\0name')])
def test_text_and_length_validation(field, value):
    with pytest.raises(ValidationError): InvestmentRequest.model_validate({**BODY, field:value})


def test_whitespace_normalization():
    body=InvestmentRequest.model_validate({**BODY,'investment_name':'  Example\n  Index Fund  '})
    assert body.investment_name == BODY['investment_name']


def test_only_jwt_rpc_is_used_and_owner_is_not_caller_controlled(monkeypatch):
    seen=[]
    def rpc(name, body):
        seen.append((name,body)); return SimpleNamespace(execute=lambda:SimpleNamespace(data=RECEIPT))
    monkeypatch.setattr(service,'get_authenticated_client',lambda token:seen.append(token) or SimpleNamespace(rpc=rpc))
    result=service.submit_investment_request('Bearer synthetic',InvestmentRequest.model_validate(BODY))
    assert result.status == 'received'
    assert seen == ['synthetic',('arbor_request_investment_v1',{'p_investment_name':BODY['investment_name'],'p_provider':BODY['provider'],'p_idempotency_key':BODY['idempotency_key']})]


@pytest.mark.parametrize('code,status', [('PT409',409),('PT429',429),('PT401',403),('PT403',403),('PGRST202',503),('unknown',503)])
def test_storage_failure_is_neutral_and_does_not_leak_provider_details(monkeypatch,code,status):
    class Error(Exception):
        def __init__(self): self.code=code
    def fail(*args): raise Error()
    monkeypatch.setattr(service,'get_authenticated_client',fail)
    with pytest.raises(HTTPException) as e:service.submit_investment_request('Bearer synthetic',InvestmentRequest.model_validate(BODY))
    assert e.value.status_code == status and code not in e.value.detail


@pytest.mark.parametrize('change',[{'provider':'other'},{'status':'supported'},{'user_id':OWNER},{'received_at':'2026-10-03T00:00:00'}])
def test_unverified_receipt_never_claims_success(monkeypatch,change):
    monkeypatch.setattr(service,'get_authenticated_client',lambda _:SimpleNamespace(rpc=lambda *args:SimpleNamespace(execute=lambda:SimpleNamespace(data={**RECEIPT,**change}))))
    with pytest.raises(HTTPException) as e:service.submit_investment_request('Bearer synthetic',InvestmentRequest.model_validate(BODY))
    assert e.value.status_code==503
