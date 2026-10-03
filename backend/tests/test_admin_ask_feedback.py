from test_owner_admin import client,wire
from app.services import owner_admin as service
import pytest
ROW=dict(helpful=False,reason='unclear',intent='actual_holdings',created_at='2026-10-03T00:00:00Z')
PAGE=dict(items=[ROW],topics=[dict(intent='actual_holdings',helpful=2,not_helpful=1)],has_more=False,offset=0)
def test_read_only_rpc_and_projection(monkeypatch):
 seen=wire(monkeypatch,result=PAGE)
 with client()as c:
  r=c.get('/v2/admin/ask-feedback',headers={'Authorization':'Bearer synthetic'})
  assert r.status_code==200 and r.json()==PAGE
  assert r.headers['cache-control']=='private, no-store'
  for method in ['post','put','patch','delete']:
   assert getattr(c,method)('/v2/admin/ask-feedback',headers={'Authorization':'Bearer synthetic'}).status_code==405
 assert seen==[('arbor_admin_ask_feedback_v1',{'p_limit':50,'p_offset':0})]
def test_selectors_and_unsigned_denied(monkeypatch):
 wire(monkeypatch,result=PAGE)
 with client()as c:
  for suffix in ['?owner=other','?email=a','?offset=0&offset=1','?id=x']:
   assert c.get('/v2/admin/ask-feedback'+suffix).status_code==400
  assert c.get('/v2/admin/ask-feedback?offset=10001').status_code==422
  assert c.get('/v2/admin/ask-feedback').status_code==401
 with client(False)as c:assert c.get('/v2/admin/ask-feedback',headers={'Authorization':'Bearer synthetic'}).status_code==401
@pytest.mark.parametrize('field',['user_id','id','email','answer_version','question','amount'])
def test_no_extra_fields_in_projection(monkeypatch,field):
 wire(monkeypatch,result={**PAGE,'items':[{**ROW,field:'private'}]})
 with client()as c:
  r=c.get('/v2/admin/ask-feedback',headers={'Authorization':'Bearer synthetic'})
  assert r.status_code==503 and 'private' not in r.text
def test_default_closed_and_sanitized_failure(monkeypatch):
 wire(monkeypatch,code='PGRST202');assert service.feedback_access('Bearer synthetic').allowed is False
 for code,status in [('PT401',401),('PT403',403),('OTHER',503)]:
  wire(monkeypatch,code=code)
  with client()as c:
   r=c.get('/v2/admin/ask-feedback',headers={'Authorization':'Bearer synthetic'})
   assert r.status_code==status and 'private-error' not in r.text
@pytest.mark.parametrize('topics',[[dict(intent='unknown',helpful=0,not_helpful=1)],[dict(intent='plan',helpful=-1,not_helpful=1)],[dict(intent='plan',helpful=0,not_helpful=1)]*2])
def test_summary_validation(monkeypatch,topics):
 wire(monkeypatch,result={**PAGE,'topics':topics})
 with client()as c:assert c.get('/v2/admin/ask-feedback',headers={'Authorization':'Bearer synthetic'}).status_code==503
