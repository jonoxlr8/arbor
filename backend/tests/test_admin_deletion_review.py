from types import SimpleNamespace
from uuid import UUID
import pytest
from fastapi import FastAPI,HTTPException
from fastapi.testclient import TestClient
from app.auth import get_current_user_id
from app.routes.owner_admin import router
from app.services import owner_admin as service
from app.schemas.admin_deletion_review import DeletionReview

ID='00000000-0000-4000-8000-000000000711'
ROW=dict(request_id=ID,requested_at='2026-10-03T00:00:00Z',request_status='pending',withdrawn_at=None,lifecycle_state='deletion_pending',processing_state='not_started',holds=[],verified_at=None,completed_at=None,receipt_expires_at=None,provider_status='unassessed',receipt_id=None)
def client():
 app=FastAPI();app.include_router(router);app.dependency_overrides[get_current_user_id]=lambda:'verified-synthetic';return TestClient(app)
def wire(monkeypatch,value=None,code=None):
 seen=[]
 def rpc(name,params):
  seen.append((name,params))
  def execute():
   if code:
    e=RuntimeError('private-owner-inventory-must-not-leak');e.code=code;raise e
   return SimpleNamespace(data=value)
  return SimpleNamespace(execute=execute)
 monkeypatch.setattr(service,'get_authenticated_client',lambda token:SimpleNamespace(rpc=rpc));return seen

def test_narrow_get_routes_and_selectors(monkeypatch):
 seen=wire(monkeypatch,value={'items':[ROW],'has_more':False,'offset':0})
 with client() as c:
  response=c.get('/v2/admin/deletions?offset=0',headers={'Authorization':'Bearer synthetic'})
  assert response.status_code==200 and response.json()['items']==[ROW]
  assert response.headers['cache-control']=='private, no-store'
  for suffix in ['?user_id=other','?offset=0&offset=1','?table=profiles']:
   assert c.get('/v2/admin/deletions'+suffix).status_code==400
  for method in ['post','put','patch','delete']:
   assert getattr(c,method)('/v2/admin/deletions/'+ID).status_code==405
  assert c.get('/v2/admin/deletions?offset=10001').status_code==422
 assert seen==[('arbor_admin_deletions_v1',{'p_limit':50,'p_offset':0})]

@pytest.mark.parametrize('code',['42883','PGRST202'])
def test_absent_schema_is_denied_not_inherited(monkeypatch,code):
 wire(monkeypatch,code=code);assert service.deletion_access('Bearer synthetic').allowed is False
 with pytest.raises(HTTPException) as e:service.deletions('Bearer synthetic',0)
 assert e.value.status_code==503

@pytest.mark.parametrize('code,status',[('PT403',403),('PT401',401),('PT404',404),('private',503)])
def test_rejection_is_sanitized(monkeypatch,code,status):
 wire(monkeypatch,code=code)
 with pytest.raises(HTTPException) as e:service.deletion_detail('Bearer synthetic',UUID(ID))
 assert e.value.status_code==status and 'inventory' not in str(e.value.detail)

@pytest.mark.parametrize('extra',[{'owner_id':'forged'},{'email':'private@example.test'},{'counts':{'profiles':1}}])
def test_response_rejects_customer_or_inventory_fields(monkeypatch,extra):
 wire(monkeypatch,value={**ROW,**extra})
 with pytest.raises(HTTPException) as e:service.deletion_detail('Bearer synthetic',UUID(ID))
 assert e.value.status_code==503

@pytest.mark.parametrize('change',[{'requested_at':'2026-10-03'},{'receipt_id':ID},{'request_status':'withdrawn'},{'holds':[{'category':'ledger','reason':'free text','review_at':'2026-10-04T00:00:00Z','end_at':'2026-10-05T00:00:00Z'}]},{'holds':[{'category':'ledger','reason':'legal_claim','review_at':'2026-10-05T00:00:00Z','end_at':'2026-10-04T00:00:00Z'}]}])
def test_canonical_dates_holds_and_completion_fail_closed(change):
 with pytest.raises(ValueError):DeletionReview.model_validate({**ROW,**change})

def test_unauthenticated_route_and_error_cache():
 from app.main import app
 with TestClient(app) as c:
  r=c.get('/v2/admin/deletions')
  assert r.status_code==401 and r.headers['cache-control']=='private, no-store'
