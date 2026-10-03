from types import SimpleNamespace
from uuid import UUID, uuid4
from datetime import datetime, timedelta, timezone
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from app.auth import get_current_user_id
from app.routes.owner_admin import router
from app.services import owner_admin as service
from app.services.account_erasure_manual import TABLES, Binding, render

ID = '00000000-0000-4000-8000-000000000901'
ROW = dict(id=ID, investment_name='Sample Fund', provider='Sample Provider',
           received_at='2026-10-02T00:00:00Z', status='new', revision=0, updated_at=None)

def client(allowed=True):
    app = FastAPI()
    app.include_router(router)
    def identity():
        if not allowed:
            raise HTTPException(401, 'Sign in')
        return 'verified-fixture'
    app.dependency_overrides[get_current_user_id] = identity
    return TestClient(app)

def wire(monkeypatch, result=None, code=None):
    seen = []
    def rpc(name, params):
        seen.append((name, params))
        def execute():
            if code:
                error = RuntimeError('do-not-expose-private-error')
                error.code = code
                raise error
            return SimpleNamespace(data=result)
        return SimpleNamespace(execute=execute)
    monkeypatch.setattr(service, 'get_authenticated_client', lambda token: SimpleNamespace(rpc=rpc))
    return seen

def test_existing_identity_and_no_account_selectors(monkeypatch):
    wire(monkeypatch, result={'allowed': True})
    with client(False) as c:
        assert c.get('/v2/admin/access').status_code == 401
    with client() as c:
        for url in ['/v2/admin/access?owner=forged', '/v2/admin/access?offset=0',
                    '/v2/admin/requests?offset=0&offset=1']:
            assert c.get(url).status_code == 400
        assert c.get('/v2/admin/requests?offset=10001').status_code == 422
        assert c.get('/v2/admin/access', headers={'Authorization': 'Bearer fixture'}).json() == {'allowed': True}

def test_status_only_never_client_selected_owner(monkeypatch):
    seen = wire(monkeypatch, result={**ROW, 'status': 'reviewing', 'revision': 1,
                                     'updated_at': '2026-10-02T01:00:00Z'})
    with client() as c:
        url = f'/v2/admin/requests/{ID}/status'
        body = {'status': 'reviewing', 'expected_revision': 0}
        for extra in ['owner', 'user_id', 'email', 'investment_name', 'provider', 'received_at']:
            assert c.put(url, json={**body, extra: 'forged'}).status_code == 422
        assert c.put(url, json={'status': 'other', 'expected_revision': 0}).status_code == 422
        assert c.put(url, json={**body, 'expected_revision': -1}).status_code == 422
        assert c.put(url, json=body, headers={'Authorization': 'Bearer owner-fixture'}).json()['revision'] == 1
    assert seen == [('arbor_admin_request_status_v1', {'p_id': ID, 'p_status': 'reviewing', 'p_expected_revision': 0})]

@pytest.mark.parametrize('code,status', [('PT401',401),('PT403',403),('PT404',404),
                                        ('PT409',409),('PT422',422),('OTHER',503)])
def test_db_authority_and_sanitized_errors(code, status, monkeypatch):
    wire(monkeypatch, code=code)
    with client() as c:
        result = c.get(f'/v2/admin/requests/{ID}', headers={'Authorization': 'Bearer synthetic'})
        assert result.status_code == status and 'private-error' not in result.text

def test_unactivated_schema_hides_entry_and_fails_closed(monkeypatch):
    wire(monkeypatch, code='PGRST202')
    assert service.access('Bearer fixture').allowed is False
    with pytest.raises(HTTPException) as error:
        service.listing('Bearer fixture', 0)
    assert error.value.status_code == 503

@pytest.mark.parametrize('extra', ['user_id','email','units','cost_basis_php','idempotency_key'])
def test_unexpected_customer_fields_rejected(extra, monkeypatch):
    wire(monkeypatch, result={**ROW, extra: 'private'})
    with pytest.raises(HTTPException) as error:
        service.detail('Bearer fixture', UUID(ID))
    assert error.value.status_code == 503

def test_erasure_surface_and_admission_remain_explicit():
    counts = {key: 0 for key in TABLES}
    now = datetime.now(timezone.utc)
    binding = Binding('gnjjtlswwhkpiabyayvi', uuid4(), uuid4(), uuid4(), 1, now, counts)
    query = render(binding, 'review', now, now + timedelta(seconds=180))
    assert 'arbor_investment_request_reviews' in counts and 'admin_owner' in counts
    assert "attname IN ('request_'||'id','user_id','status','revision','updated_at')" in query
    assert 'manual_admin_security_changed' in query and 'manual_unreviewed_owner_surface' in query
    assert 'has_any_column_privilege' in query and 'execution_approved boolean:=false' in query
    assert query.endswith('ROLLBACK;')

@pytest.mark.parametrize('field,value', [('received_at','2026-10-02T00:00:00'),
                                        ('updated_at','2026-10-02T00:00:00'),
                                        ('revision',True),('revision',2**53)])
def test_response_dates_and_revisions_fail_closed(field,value,monkeypatch):
    wire(monkeypatch,result={**ROW,field:value})
    with pytest.raises(HTTPException) as error:
        service.detail('Bearer synthetic',UUID(ID))
    assert error.value.status_code==503

def test_admin_errors_cannot_be_cached():
    from app.main import app
    with TestClient(app) as c:
        response=c.get('/v2/admin/access')
        assert response.status_code==401
        assert response.headers['cache-control']=='private, no-store'
        assert response.headers['x-content-type-options']=='nosniff'
