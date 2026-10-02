from copy import deepcopy
from datetime import datetime, timezone
import pytest
from app.services.insights_history import budget_comparison, alignment_over_time
from app.services.profile_v2 import profile_v2_row
from app.schemas.profile_v2 import ProfileV2Create

NOW=datetime(2026,10,2,tzinfo=timezone.utc)
def total(amount=None,missing=0):return {'amount_php':amount,'missing_amount_count':missing}
def budgets():return [{'month':'2026-09-01','amount_php':'5000.00'},{'month':'2026-10-01','amount_php':'3000.00'}]

def test_budget_current_replace_carry_closed_and_unknown():
 assert budget_comparison(total('3500.00'),'2026-10',budgets())['status']=='reached'
 assert budget_comparison(total('3500.00'),'2026-09',budgets())['remaining_php']=='1500.00'
 assert budget_comparison(total('3500.00'),'2027-01',budgets())['target_php']=='3000.00'
 assert budget_comparison(total(),'2026-08',budgets())['status']=='unavailable'
 assert budget_comparison(total(),'2026-10',None)['status']=='unavailable'
 assert budget_comparison(total(),'2026-10',[{'month':'2026-10-01','amount_php':None}])['status']=='unset'
 assert budget_comparison(total(),'2026-10',[{'month':'2026-10-01','amount_php':'0'}])['status']=='reached'
 assert budget_comparison(total(),'2026-10',budgets())['remaining_php']=='3000.00'
 assert budget_comparison(total('100',1),'2026-10',budgets())['status']=='incomplete'
 assert budget_comparison(total('3500',1),'2026-10',budgets())['status']=='reached'

@pytest.mark.parametrize('bad',['NaN','-1','1.001','Infinity'])
def test_invalid_budget_fails_closed(bad):
 with pytest.raises(ValueError):budget_comparison(total(),'2026-10',[{'month':'2026-10-01','amount_php':bad}])

def profile(approach='Growth'):
 return profile_v2_row(ProfileV2Create(strategy_engine_version='2.0',full_name='Recorded plan',country='Philippines',currency='PHP',emergency_savings='three_to_six_months',high_interest_debt='none',goal_target=None,current_portfolio_value=0,monthly_investment=5000,horizon='ten_plus_years',risk_response='hold',selected_approach=approach),'A')
def fixture():
 versions=[{'id':1,'valid_from':'2026-09-01T00:00:00Z','profile_data':profile()}]
 rows=[{'captured_at':'2026-09-30T15:00:00Z','value_php':'100','allocation_values':[{'product_id':'gotrade_vt','value_php':'100'}]},
       {'captured_at':'2026-10-01T16:00:00Z','value_php':'100','allocation_values':[{'product_id':'gotrade_vt','value_php':'80'},{'product_id':'gotrade_bnd','value_php':'20'}]}]
 return rows,versions

def test_each_observation_uses_its_valid_plan_not_today():
 rows,versions=fixture();r=alignment_over_time(rows,versions,NOW)
 assert r['status']=='closer' and r['previous']['date']=='2026-09-30'
 versions.append({'id':2,'valid_from':'2026-10-01T00:00:00Z','profile_data':profile('Conservative')})
 changed=alignment_over_time(rows,versions,NOW)
 assert changed['previous']==r['previous'] and changed['current']!=r['current']
 assert 'targets changed' in changed['detail']
 versions[0]['valid_from']='2026-10-01T00:00:00Z'
 assert alignment_over_time(rows,versions,NOW)['status']=='unavailable'

def test_missing_corrupt_observations_future_and_manila_boundary():
 rows,versions=fixture()
 assert alignment_over_time(rows,None,NOW)['status']=='unavailable'
 assert alignment_over_time(rows[:1],versions,NOW)['status']=='unavailable'
 rows[0]['captured_at']='2026-09-30T16:00:00Z' # Already October in Manila
 assert alignment_over_time(rows,versions,NOW)['status']=='unavailable'
 rows,versions=fixture();rows[1]['allocation_values'][0]['value_php']='999'
 assert alignment_over_time(rows,versions,NOW)['status']=='unavailable'
 rows,versions=fixture();rows[1]['captured_at']='2026-10-31T00:00:00Z'
 assert alignment_over_time(rows,versions,NOW)['status']=='unavailable'

def test_unset_replaces_current_and_carries_without_rewriting_prior():
 versions=budgets();versions[-1]['amount_php']=None
 assert budget_comparison(total('5000'),'2026-09',versions)['status']=='reached'
 assert budget_comparison(total('5000'),'2026-10',versions)['status']=='unset'
 assert budget_comparison(total('5000'),'2027-01',versions)['status']=='unset'

@pytest.mark.parametrize('now,month',[('2026-09-30T15:59:59+00:00','2026-09'),('2026-09-30T16:00:00+00:00','2026-10')])
def test_budget_uses_philippine_month(now,month):
 from app.services.monthly_review import review_window
 current=review_window(now=datetime.fromisoformat(now))[1]
 assert current==month
 assert budget_comparison(total('1000'),current,budgets())['target_php']==('5000.00' if month=='2026-09' else '3000.00')


def test_export_history_allowlist_rejects_internal_nonce_and_extra_fields():
 from app.schemas.account_export import validate_export
 from app.services.account_export import SECTIONS
 owner='00000000-0000-4000-8000-000000000001'
 body={'schema_version':'1','complete':True,'source_availability':{'ask_usage':'table_absent'},'account':{'id':owner},**{k:[] for k in SECTIONS},'export_operational_metadata':[{'cooldown_until':'2026-10-02T00:00:00+00:00'}]}
 data={k:profile()[k] for k in ('strategy_engine_version','country','currency','goal_target','current_portfolio_value','monthly_investment','v2_inputs')}
 body['plan_versions']=[{'valid_from':'2026-10-02T00:00:00Z','profile_data':data}]
 body['budget_versions']=[{'month':'2026-10-01','amount_php':'5000.00','recorded_at':'2026-10-02T00:00:00Z'}]
 assert validate_export(body,owner)
 data['v2_inputs']['plan_state']={'revision_nonce':'internal'}
 with pytest.raises(ValueError):validate_export(body,owner)
 del data['v2_inputs']['plan_state'];data['email']='not allowed'
 with pytest.raises(ValueError):validate_export(body,owner)


def test_changed_history_and_corrected_observations_fail_closed():
 from app.services.portfolio_store import PortfolioStore
 from fastapi import HTTPException
 store=PortfolioStore.__new__(PortfolioStore)
 calls=[]
 def changing(*args):
  calls.append(args)
  return [{'month':'2026-10-01','amount_php':'5000' if len(calls)==1 else '3000'}]
 store.insight_rows=changing
 with pytest.raises(HTTPException) as error:store.budget_versions()
 assert error.value.status_code==409
 rows,versions=fixture()
 for row in rows:row['day']=row['captured_at'][:10]
 changes=[{'affected_from':'2026-09-01','changed_at':'2026-10-02T00:00:00Z'}]
 mapping={'arbor_portfolio_snapshots':rows,'arbor_plan_versions':versions,'arbor_portfolio_history_changes':changes}
 store.insight_rows=lambda table,*_:mapping[table]
 observations,plans=store.alignment_history()
 assert observations==[] and plans==versions
 assert alignment_over_time(observations,plans,NOW)['status']=='unavailable'


def test_minimal_historical_allocation_does_not_need_goals_or_profile_money():
 rows,versions=fixture()
 original=alignment_over_time(rows,versions,NOW)
 for version in versions:
  data=version['profile_data']
  for key in ('goal_target','current_portfolio_value','monthly_investment'):data[key]=None
  for key in ('goal_name','goal_date','implementation_choices'):data['v2_inputs'].pop(key,None)
 assert alignment_over_time(rows,versions,NOW)==original
