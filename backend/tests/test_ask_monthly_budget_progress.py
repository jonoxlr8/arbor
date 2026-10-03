from copy import deepcopy
from datetime import datetime,timezone
import pytest
from app.routes import chat,live_portfolio
from app.services.arbor.question_matching import match_question,is_monthly_budget_question
from app.services import monthly_review as review_service
from test_live_portfolio import endpoint,saved
EXACT=['Magkano pa ang kulang ko sa investment budget ngayong buwan?','Magkano pa ang kulang ko sa monthly investment budget ngayong buwan?']
QUESTIONS=EXACT+['How much remains to reach my monthly investment target?','How much is left to reach my monthly investment target?','How much more do I need for my monthly investment budget?','What remains toward my investment budget this month?','Magkano pa yung kulang ko sa budget ko ngayong buwan?','Magkano ang natitira para sa buwanang investment budget ko?']
@pytest.fixture
def budget(endpoint,monkeypatch):
 api,state=endpoint;state['saved']=saved(monthly_investment=15000);state['budget']='15000.00';state['budget_versions']=True;state['purchases']=[('2026-10-01','1000.00',None),('2026-10-02','2000.00',None),('2026-10-02','99000.00','voided')];state['reads']=0;state['changed']=False
 Base=live_portfolio.PortfolioStore
 class Store(Base):
  def review_activity(self,start,end):
   assert self.owner=='A';state['reads']+=1
   rows=[{'id':str(i),'holding_id':'synthetic-vt','product_id':'gotrade_vt','provider':'gotrade','investment_date':d,'amount_paid_php':a,'voided_at':v} for i,(d,a,v) in enumerate(state['purchases']) if start<=d<end]
   if state['changed'] and state['reads']%2==0:rows=[]
   return rows
  def budget_versions(self):return [{'month':'2026-09-01','amount_php':'5000.00'},{'month':'2026-10-01','amount_php':state['budget']}] if state['budget_versions'] else None
 monkeypatch.setattr(live_portfolio,'PortfolioStore',Store);monkeypatch.setattr(chat,'ask_usage',lambda *_a,**_k:None)
 class Clock(datetime):
  @classmethod
  def now(cls,tz=None):return datetime(2026,10,3,tzinfo=timezone.utc).astimezone(tz) if tz else datetime(2026,10,3)
 monkeypatch.setattr(review_service,'datetime',Clock)
 return api,state
@pytest.mark.parametrize('question',QUESTIONS)
def test_exact_queries_use_current_canonical_budget_review(budget,question):
 api,state=budget;before=deepcopy(state['purchases']);body=api.post('/chat',json={'message':question}).json()
 assert body['intent']=='monthly_checkin' and body['action']=='portfolio'
 assert 'PHP 12,000.00 left to reach your October 2026 monthly target' in body['reply']
 assert 'PHP 3,000.00' in body['reply'] and 'PHP 15,000.00' in body['reply'] and '99,000' not in body['reply']
 assert 'opening positions, check-ins and investment gain are separate' in body['reply']
 assert body['feedback_context']=={'intent':'monthly_checkin','answer_version':'deterministic-ask-1'} and state['purchases']==before and state['reads']==3
@pytest.mark.parametrize('target,amount,phrase',[('3000.00','3000.00','Target reached'),('2000.00','3000.00','Target reached'),('0.00',None,'explicitly PHP 0.00'),(None,'3000.00','budget for October 2026 is not set'),('15000.00',None,'No investment recorded')])
def test_zero_unset_exceeded_empty_distinct(budget,target,amount,phrase):
 api,state=budget;state['budget']=target;state['purchases']=[] if amount is None else [('2026-10-02',amount,None)]
 body=api.post('/chat',json={'message':EXACT[0]}).json();assert phrase in body['reply']
 if target is None:assert '12,000' not in body['reply']
@pytest.mark.parametrize('target,phrase',[('15000.00','remaining amount for October 2026 is unavailable'),('2000.00','Known recorded purchases already meet the target')])
def test_missing_php_never_invent_remaining(budget,target,phrase):
 api,state=budget;state['budget']=target;state['purchases']=[('2026-10-01','3000.00',None),('2026-10-02',None,None)]
 body=api.post('/chat',json={'message':EXACT[1]}).json();assert phrase in body['reply'] and '12,000' not in body['reply'] and 'summary' not in body
@pytest.mark.parametrize('mode',['absent_budget','concurrent_change','legacy','free'])
def test_unavailable_gates_no_false_amount(budget,mode):
 api,state=budget
 if mode=='absent_budget':state['budget_versions']=False
 elif mode=='concurrent_change':state['changed']=True
 elif mode=='legacy':state['saved']={'strategy_engine_version':'1.0'}
 else:state['mode']='free'
 body=api.post('/chat',json={'message':EXACT[0]}).json();assert '12,000' not in body['reply'];assert 'unavailable' in body['reply'] or 'part of Arbor Plus' in body['reply']
 if mode in ('legacy','free'):assert state['reads']==0
@pytest.mark.parametrize('instant,month,remaining',[(datetime(2026,9,30,15,59,59,tzinfo=timezone.utc),'September 2026','PHP 4,000.00'),(datetime(2026,9,30,16,tzinfo=timezone.utc),'October 2026','PHP 13,000.00')])
def test_ph_month_boundary_no_utc_month_mix(budget,monkeypatch,instant,month,remaining):
 api,state=budget;state['purchases']=[('2026-09-30','1000.00',None),('2026-10-01','2000.00',None)]
 class Clock(datetime):
  @classmethod
  def now(cls,tz=None):return instant.astimezone(tz) if tz else instant.replace(tzinfo=None)
 monkeypatch.setattr(review_service,'datetime',Clock)
 body=api.post('/chat',json={'message':EXACT[0]}).json();assert month in body['reply'] and remaining in body['reply']
def test_current_edit_replaces_target_retains_recorded_purchases(budget):
 api,state=budget
 for target,phrase in [('15000.00','PHP 12,000.00'),('5000.00','PHP 2,000.00'),('2000.00','Target reached')]:
  state['budget']=target;assert phrase in api.post('/chat',json={'message':EXACT[0]}).json()['reply']
 assert len(state['purchases'])==3
@pytest.mark.parametrize('question,intent',[('Magkano ang kulang ko sa monthly investment?','clarification'),(EXACT[0]+' Bilhin ko ba VT?','decision_boundary'),(EXACT[1]+' Write Python code.','out_of_scope')])
def test_ambiguous_and_mixed_do_not_read_budget(budget,question,intent):
 api,state=budget;body=api.post('/chat',json={'message':question}).json();assert body['intent']==intent and state['reads']==0
@pytest.mark.parametrize('status',['trial','active'])
def test_trial_and_plus_use_same_existing_review_permissions(budget,monkeypatch,status):
 from app.services.entitlements import resolve_entitlements
 api,state=budget;monkeypatch.setattr(chat,'get_entitlements',lambda _:resolve_entitlements('plus',status))
 body=api.post('/chat',json={'message':EXACT[0]}).json();assert 'PHP 12,000.00' in body['reply'] and state['reads']==3

def test_missing_plan_alignment_permission_is_not_bypassed(budget,monkeypatch):
 from app.services.entitlements import resolve_entitlements
 from app.services import entitlements
 api,state=budget;permit=resolve_entitlements('plus','active').model_copy(update={'features':('live_portfolio','monthly_contribution_planner')})
 monkeypatch.setattr(chat,'get_entitlements',lambda _:permit);monkeypatch.setattr(entitlements,'get_entitlements',lambda _:permit)
 response=api.post('/chat',json={'message':EXACT[0]});assert response.status_code==403 and state['reads']==0

def test_explicit_zero_with_unknown_recorded_amounts_is_not_failure(budget):
 api,state=budget;state['budget']='0.00';state['purchases']=[('2026-10-02',None,None)]
 response=api.post('/chat',json={'message':EXACT[0]});assert response.status_code==200
 text=response.json()['reply'];assert 'Target reached' in text and 'explicitly PHP 0.00' in text and 'missing PHP amounts' in text

def test_rollover_between_read_and_selected_month_requires_refresh(budget,monkeypatch):
 api,_=budget;monkeypatch.setattr(live_portfolio,'get_monthly_review',lambda *_a,**_k:{'month':'2026-09','current_month':'2026-10'})
 body=api.post('/chat',json={'message':EXACT[0]}).json();assert 'temporarily unavailable' in body['reply'] and '12,000' not in body['reply']
