import hashlib
import json
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError
from app import auth, database
from app.routes.account import router
from app.schemas.terms import TermsAcceptance, TermsSignupIntent
from app.services import terms

TEXT=json.dumps({'title':'Terms','introduction':'Test','sections':[['Rule','Synthetic terms']]})
DOC={'version':'test-1','digest':hashlib.sha256(TEXT.encode()).hexdigest(),'document_text':TEXT}
BODY={'version':DOC['version'],'digest':DOC['digest'],'confirm':True}

@pytest.mark.parametrize('extra',[{'owner':'B'},{'accepted_at':'yesterday'},{'privacy_consent':True},{'confirm':'true'}])
def test_no_selectors_or_inferred_consent(extra):
    with pytest.raises(ValidationError): TermsAcceptance(**{**BODY,**extra})

def test_signup_email_and_confirmation():
    assert TermsSignupIntent(**BODY,email='fake@example.test').confirm
    for email in ('bad','a b@example.test','a@b'):
        with pytest.raises(ValidationError):TermsSignupIntent(**BODY,email=email)

@pytest.mark.parametrize('edit',[{'digest':'0'*64},{'document_text':'not json'},{'version':''}])
def test_document_integrity(edit):
    with pytest.raises((ValueError,TypeError)):terms.document({**DOC,**edit})

def test_owner_verification_precedes_client_and_never_supplies_owner(monkeypatch):
    seen=[]
    monkeypatch.setattr(auth,'get_verified_user_id',lambda a:seen.append(('verify',a)) or 'A')
    monkeypatch.setattr(database,'get_authenticated_client',lambda token:SimpleNamespace(rpc=lambda name,p:seen.append((name,p)) or SimpleNamespace(execute=lambda:SimpleNamespace(data={**DOC,'required':False,'accepted_at':'2026-10-01T12:00:00+00:00'}))))
    terms.account('Bearer fake',TermsAcceptance(**BODY))
    assert seen[0]==('verify','Bearer fake')
    assert seen[-1][1]=={'p_action':'accept','p_version':'test-1','p_digest':DOC['digest'],'p_confirm':True}

def test_missing_auth_is_not_anonymous_rpc(monkeypatch):
    def reject(a):raise HTTPException(401,'Sign in')
    monkeypatch.setattr(auth,'get_verified_user_id',reject)
    monkeypatch.setattr(database,'supabase',None)
    with pytest.raises(HTTPException) as e:terms.account(None)
    assert e.value.status_code==401

@pytest.mark.parametrize('code,status',[('PT400',400),('PT401',401),('PT403',403),('PT409',409),('PT429',429),('42501',503),('PT503',503)])
def test_no_private_exception_spill(monkeypatch,code,status):
    error=Exception('sensitive fixture payload');error.code=code
    def fail(*a):raise error
    monkeypatch.setattr(database,'supabase',SimpleNamespace(rpc=fail))
    with pytest.raises(HTTPException) as caught:terms.current()
    assert caught.value.status_code==status and 'sensitive' not in caught.value.detail

def test_headers_selectors_and_strict_body(monkeypatch):
    app=FastAPI();app.include_router(router);client=TestClient(app)
    monkeypatch.setattr(terms,'current',lambda:DOC)
    monkeypatch.setattr(terms,'account',lambda *a:{**DOC,'required':False,'accepted_at':None})
    for path in ('/terms/current','/account/terms'):
        r=client.get(path);assert r.status_code==200 and r.headers['cache-control']=='private, no-store'
        assert client.get(path+'?user_id=B').status_code==400
    assert client.post('/account/terms/accept',json=BODY).status_code==200
    assert client.post('/account/terms/accept',json={**BODY,'owner':'B'}).status_code==422
    assert client.post('/account/terms/accept',json={**BODY,'confirm':'true'}).status_code==422

def test_documents_identical_and_original_business_clauses_preserved():
    from pathlib import Path
    root=Path(__file__).resolve().parents[2]
    back=json.loads((root/'backend/app/terms_document.json').read_text())
    front=json.loads((root/'frontend/lib/termsDocument.json').read_text())
    assert back==front and terms.document(back)
    assert back['digest']=='16081efb1de73fb08c2afeaa905ac4b6d0659c2f1ac6dab6d44d66642602e599'
    assert back['document_text']==json.dumps(back['body'],ensure_ascii=False,separators=(',',':'))
