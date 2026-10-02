import json
from contextlib import nullcontext
from types import SimpleNamespace
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from fastapi import HTTPException
from app.services import account_export as service
from app.schemas.account_export import validate_export
from app.routes.account import router

A='00000000-0000-4000-8000-000000000001'
S='00000000-0000-4000-8000-000000000002'
def body(owner=A):
    return {'schema_version':'1','complete':True,'source_availability':{'ask_usage':'table_present'},'account':{'id':owner}, **{k:[] for k in service.SECTIONS},'export_operational_metadata':[{'cooldown_until':'2026-09-30T15:00:00+00:00'}]}
@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(service,'verified_identity',lambda token:(A,S))
    monkeypatch.setattr(service,'limits',SimpleNamespace(acquire=lambda owner:nullcontext()))
    monkeypatch.setattr(service,'read_export',lambda authorization:body())
    app=FastAPI();app.include_router(router)
    return TestClient(app)
def test_download_uses_verified_owner_only(client,monkeypatch):
    calls=[]
    monkeypatch.setattr(service,'read_export',lambda authorization:calls.append(authorization) or body())
    r=client.get('/account/export',headers={'Authorization':'Bearer synthetic'})
    assert r.status_code==200 and calls==['Bearer synthetic']
    assert r.headers['cache-control']=='private, no-store'
    assert r.headers['x-content-type-options']=='nosniff'
    assert 'arbor-account-export-' in r.headers['content-disposition']
    assert client.get('/account/export?user_id=B').status_code==400
    assert calls==['Bearer synthetic']
@pytest.mark.parametrize('status',[401,403,413,429,503])
def test_safe_failures(client,monkeypatch,status):
    def fail(*_):raise HTTPException(status,'Safe error')
    monkeypatch.setattr(service,'read_export',fail)
    r=client.get('/account/export')
    assert r.status_code==status and r.headers['cache-control']=='private, no-store'
@pytest.mark.parametrize('value',[{},body('B'),{**body(),'monthly_checkins':None},{**body(),'complete':False}])
def test_incomplete_rejected(client,monkeypatch,value):
    monkeypatch.setattr(service,'read_export',lambda *_:value)
    assert client.get('/account/export').status_code==503
@pytest.mark.parametrize('authorization',[None,'Basic x','Bearer invalid'])
def test_missing_invalid_auth(authorization):
    with pytest.raises(HTTPException) as e:service.verified_identity(authorization)
    assert e.value.status_code==401

def test_process_limits_cleanup_cooldown_and_cap():
    clock=[0];limit=service.ExportLimits(lambda:clock[0])
    with limit.acquire('A'):
        with pytest.raises(HTTPException):
            with limit.acquire('A'):pass
        with limit.acquire('B'):
            with pytest.raises(HTTPException):
                with limit.acquire('C'):pass
    assert not limit.active
    with pytest.raises(HTTPException):
        with limit.acquire('A'):pass
    clock[0]=61
    with limit.acquire('A'):pass
    assert len(limit.recent)==1

def test_nested_unknown_and_nonce_rejected():
    for inputs in ({'password':'x'},{'saved_preferences':{'token':'x'}},{'plan_state':{'revision_nonce':'x'}}):
        with pytest.raises(ValueError):validate_export({**body(),'profile':[{'v2_inputs':inputs}]},A)

def test_verified_signed_identity(monkeypatch):
    import time,jwt
    from cryptography.hazmat.primitives.asymmetric import ec
    key=ec.generate_private_key(ec.SECP256R1())
    monkeypatch.setattr(service.auth.jwks_client,'get_signing_key_from_jwt',lambda _:SimpleNamespace(key=key.public_key()))
    claims={'sub':A,'session_id':S,'iss':service.auth.JWT_ISSUER,'aud':'authenticated','exp':int(time.time())+60,'iat':int(time.time())}
    token=jwt.encode(claims,key,algorithm='ES256')
    assert service.verified_identity('Bearer '+token)==(A,S)
    for changes in ({'session_id':'bad'},{'exp':0},{'aud':'wrong'},{'iss':'wrong'}):
        bad=jwt.encode({**claims,**changes},key,algorithm='ES256')
        with pytest.raises(HTTPException):service.verified_identity('Bearer '+bad)

@pytest.mark.parametrize('availability,rows', [(None, []), ({'ask_usage':'unknown'}, []), ({'ask_usage':'table_absent'}, [{'period':'2026-09'}])])
def test_invalid_source_availability_rejected(availability, rows):
    with pytest.raises(ValueError):
        validate_export({**body(), 'source_availability': availability, 'ask_usage': rows}, A)

def test_absent_usage_source_is_explicit():
    assert validate_export({**body(), 'source_availability': {'ask_usage':'table_absent'}}, A)['ask_usage'] == []


def test_rpc_forwards_user_token_without_owner_arguments(monkeypatch):
    import supabase
    calls=[]
    rpc=SimpleNamespace(execute=lambda:SimpleNamespace(data=body()))
    fake=SimpleNamespace(postgrest=SimpleNamespace(auth=lambda token:calls.append(('auth',token))),
        rpc=lambda name,params:calls.append(('rpc',name,params)) or rpc)
    monkeypatch.setattr(supabase,'create_client',lambda *_args,**_kwargs:fake)
    assert service.read_export('Bearer synthetic-user-token')==body()
    assert calls==[('auth','synthetic-user-token'),('rpc','arbor_account_export_current_v1',{})]

@pytest.mark.parametrize('message,status',[('export_busy',429),('export_reauthentication_required',403),('export_too_large',413),('permission denied',503)])
def test_rpc_errors_fail_safely(monkeypatch,message,status):
    import supabase
    class Failure(Exception): pass
    def fail(*_):
        error=Failure();error.message=message;raise error
    fake=SimpleNamespace(postgrest=SimpleNamespace(auth=lambda _:None),rpc=fail)
    monkeypatch.setattr(supabase,'create_client',lambda *_args,**_kwargs:fake)
    with pytest.raises(HTTPException) as error:service.read_export('Bearer synthetic-user-token')
    assert error.value.status_code==status

@pytest.mark.parametrize('metadata',[[],[{'cooldown_until':'x','token':'secret'}],[{'cooldown_until':None}],[{'cooldown_until':'not-a-date'}]])
def test_operational_metadata_is_allowlisted(metadata):
    with pytest.raises(ValueError):validate_export({**body(),'export_operational_metadata':metadata},A)

def test_investment_request_export_is_optional_and_contains_requested_fields_only():
    validate_export(body(), A)
    receipt={'investment_name':'Sample Index Fund','provider':'Sample Broker','received_at':'2026-10-02T01:00:00+00:00'}
    validate_export({**body(),'investment_requests':[receipt]}, A)
    for invalid in (None,[{**receipt,'user_id':'B'}],[{**receipt,'received_at':'2026-10-02T01:00:00'}],[{**receipt,'investment_name':''}],[{**receipt,'provider':'x'*81}]):
        with pytest.raises(ValueError):validate_export({**body(),'investment_requests':invalid}, A)
