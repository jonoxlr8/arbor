from copy import deepcopy
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from types import SimpleNamespace
import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from postgrest.exceptions import APIError

from test_profile_v2 import harness, BASE, HEADERS
from app.routes import monthly_checkin as routes
from app.services import monthly_checkin as monthly
from app.services.entitlements import resolve_entitlements
from app.services.next_action import get_next_action


@pytest.mark.parametrize("amount", ["10000", "10000.0", "10000.00", "10000.000", "10000.5", "10000.500"])
def test_checkin_accepts_two_meaningful_decimal_places_without_rounding(amount):
    result = monthly.Completion(month="2026-09", amount_php=amount)
    assert result.amount_php == Decimal(amount)


def test_checkin_rejects_meaningful_subcent_precision():
    with pytest.raises(ValidationError):
        monthly.Completion(month="2026-09", amount_php="999.999")


@pytest.fixture
def scenario(harness, monkeypatch):
    client, state = harness
    client.app.include_router(routes.router)
    saved = client.post('/v2/profiles', json=BASE, headers=HEADERS).json()
    monkeypatch.setenv('MONTHLY_CHECKIN_ENABLED', 'true')
    records = {}
    clock = ['2026-09']
    class Store:
        def __init__(self, owner, authorization):
            assert authorization == HEADERS['Authorization']
            self.owner = owner
        def run(self, action='read', month=None, amount=None):
            key = (self.owner, clock[0])
            if action != 'read' and month != clock[0]:
                raise HTTPException(409, 'Month changed')
            if action == 'complete' and (key not in records or records[key]['undone_at']):
                records[key] = dict(month=clock[0], amount_php=str(amount), completed_at=clock[0]+'-24T12:00:00Z', undone_at=None)
            if action == 'undo' and key in records:
                records[key]['undone_at'] = clock[0]+'-24T13:00:00Z'
            current = records.get(key)
            return dict(month=clock[0], current=deepcopy(current) if current and not current['undone_at'] else None,
                        history=[deepcopy(v) for (u,m),v in records.items() if u == self.owner])
    monkeypatch.setattr(monthly, 'MonthlyStore', Store)
    return client, state, saved, records, clock


def test_monthly_complete_retry_undo_and_history(scenario):
    client, state, saved, records, clock = scenario
    before = deepcopy(state['rows'])
    assert client.get('/v2/monthly-checkin', headers=HEADERS).json()['current'] is None
    assert client.get('/v2/next-action', headers=HEADERS).json()['title'] == 'September check-in'
    for amount in ['5000.25','999']:
        result = client.post('/v2/monthly-checkin', json=dict(month='2026-09',amount_php=amount), headers=HEADERS)
        assert result.status_code == 200
        assert result.json()['current']['amount_php'] == '5000.25'
    assert len(records) == 1
    assert client.get('/v2/next-action', headers=HEADERS).json()['key'] == 'monthly_complete'
    for message in ['How much did I record this month?', 'Did I complete my September check-in?']:
        reply = client.post('/chat',json={'message':message},headers=HEADERS).json()['reply']
        assert '5,000.25' in reply and 'not a verified trade' in reply
    assert 'set for September' in client.post('/chat',json={'message':'What should I do next?'},headers=HEADERS).json()['reply']
    assert '5,000.25' not in client.post('/chat',json={'message':'What should I buy?'},headers=HEADERS).json()['reply']
    undone = client.post('/v2/monthly-checkin/undo',json={'month':'2026-09'},headers=HEADERS).json()
    assert undone['current'] is None and undone['history'][0]['undone_at']
    assert client.get('/v2/next-action',headers=HEADERS).json()['key'] == 'review_monthly_contribution'
    assert state['rows'] == before  # Completion never modifies profile/holdings.


def test_new_month_does_not_reuse_completion(scenario):
    client, _, _, _, clock = scenario
    client.post('/v2/monthly-checkin',json={'month':'2026-09','amount_php':'5000'},headers=HEADERS)
    clock[0] = '2026-10'
    assert client.get('/v2/monthly-checkin',headers=HEADERS).json()['current'] is None
    assert client.get('/v2/next-action',headers=HEADERS).json()['title'] == 'October check-in'
    assert client.post('/v2/monthly-checkin',json={'month':'2026-09','amount_php':'5000'},headers=HEADERS).status_code == 409


@pytest.mark.parametrize('updates', [dict(high_interest_debt='difficult_to_manage'),dict(horizon='less_than_3_years',selected_approach='short_term'),dict(selected_approach=None)])
def test_ineligible_exclusions(scenario,updates):
    from app.schemas.profile_v2 import ProfileV2Create
    from app.services.profile_v2 import profile_v2_row
    client,state,_,_,_=scenario
    state['rows']['A']=profile_v2_row(ProfileV2Create(**{**BASE,**updates}),'A')
    assert client.post('/v2/monthly-checkin',json={'month':'2026-09','amount_php':'5000'},headers=HEADERS).status_code==403
    assert client.get('/v2/next-action',headers=HEADERS).json()['key'] != 'monthly_complete'


def test_owner_identity_and_unknown_fields(scenario):
    client,state,_,_,_=scenario
    for extra in [{'user_id':'B'},{'completed_at':'2020-01-01'},{'tier':'plus'},{'readiness':'ready'}]:
        assert client.post('/v2/monthly-checkin',json={'month':'2026-09','amount_php':'1',**extra},headers=HEADERS).status_code==422
    client.post('/v2/monthly-checkin?user_id=B',json={'month':'2026-09','amount_php':'1'},headers=HEADERS)
    state['user']='B'
    assert client.get('/v2/monthly-checkin',headers=HEADERS).status_code==404
    client.post('/v2/profiles',json=BASE,headers=HEADERS)
    assert client.get('/v2/monthly-checkin?user_id=A',headers=HEADERS).json()['history']==[]
    assert client.get('/v2/monthly-checkin').status_code==401


def test_default_off_never_reads_table(harness,monkeypatch):
    client,_=harness
    client.app.include_router(routes.router)
    monkeypatch.delenv('MONTHLY_CHECKIN_ENABLED',raising=False)
    monkeypatch.setattr(monthly,'MonthlyStore',lambda *a:pytest.fail('storage accessed'))
    client.post('/v2/profiles',json=BASE,headers=HEADERS)
    assert client.get('/v2/monthly-checkin?enabled=true',headers=HEADERS).status_code==404
    assert client.get('/v2/next-action',headers=HEADERS).status_code==200
    assert client.post('/chat',json={'message':'What should I do next?'},headers=HEADERS).status_code==200


def test_free_excluded_and_missing_profile(scenario,monkeypatch):
    client,state,_,_,_=scenario
    monkeypatch.setattr(routes,'get_entitlements',lambda u:resolve_entitlements('free','active'))
    assert client.post('/v2/monthly-checkin',json={'month':'2026-09','amount_php':'1'},headers=HEADERS).status_code==403
    state['rows'].clear()
    assert client.get('/v2/monthly-checkin',headers=HEADERS).status_code==404


@pytest.mark.parametrize('amount',['0','-1','NaN','Infinity','1.001','1000000000000','not-money'])
def test_amount_validation(amount):
    with pytest.raises(ValidationError):monthly.Completion(month='2026-09',amount_php=amount)


def test_utc_month_boundary():
    assert monthly.month_key(datetime(2026,10,1,0,5,tzinfo=timezone(timedelta(hours=8))))=='2026-09'
    assert monthly.month_key(datetime(2026,10,1,tzinfo=timezone.utc))=='2026-10'


def test_rpc_payload_has_no_identity_and_errors_are_sanitized(monkeypatch):
    calls=[]
    class Client:
        def rpc(self,name,payload):calls.append((name,payload));return self
        def execute(self):return SimpleNamespace(data={'month':'2026-09','current':None,'history':[]})
    monkeypatch.setattr(monthly,'get_authenticated_client',lambda jwt:Client())
    store=monthly.MonthlyStore('A','Bearer secret-test')
    store.run('complete','2026-09',Decimal('2.50'))
    assert calls==[('arbor_monthly_checkin',{'p_action':'complete','p_month':'2026-09','p_amount':'2.50'})]
    def fail(self):raise APIError({'code':'42P01','message':'secret-test database details'})
    monkeypatch.setattr(Client,'execute',fail)
    with pytest.raises(HTTPException) as exc:store.run()
    assert exc.value.status_code==503 and 'secret-test' not in str(exc.value.detail)


def test_completion_does_not_override_higher_priority(scenario):
    _,_,saved,_,_=scenario
    state={'month':'2026-09','current':{'amount_php':'1'}}
    assert get_next_action(None,monthly=state).key=='complete_profile'
    blocked=deepcopy(saved);blocked['plan']['readiness']['actionable_contribution_guidance_allowed']=False
    assert get_next_action(blocked,monthly=state).key=='financial_foundation'


@pytest.mark.parametrize('environment',[{'APP_ENV':'production'},{'RENDER':'true'},{'VERCEL':'1'}])
def test_monthly_fixture_refuses_deployed_environment(monkeypatch,environment):
    import runpy
    monkeypatch.setenv('APP_ENV','test')
    monkeypatch.setenv('ARBOR_MONTHLY_E2E','true')
    monkeypatch.setenv('MONTHLY_CHECKIN_ENABLED','true')
    for key,value in environment.items():monkeypatch.setenv(key,value)
    with pytest.raises(RuntimeError,match='explicit local test'):
        runpy.run_path('tests/e2e_monthly_app.py')
