"""Exact reported questions use synthetic canonical records, never owner amounts."""
from copy import deepcopy
from decimal import Decimal
import pytest
from app.routes import chat,live_portfolio
from app.services.arbor.question_matching import match_question
from app.services.arbor.allocation_questions import allocation_gap_request
from app.services.arbor.portfolio_explanation import explain_portfolio
from app.services.arbor.v2_explanations import classify_v2_question
from test_live_portfolio import endpoint,holding,price,saved,valued
EXACT='Aling investment sa portfolio ko ang pinaka-overweight at pinaka-underweight kumpara sa chosen plan ko?'
COMPARISONS=[EXACT,'Aling bahagi ng portfolio ko ang pinakasobra at pinakakulang kumpara sa napili kong plano?','Aling holdings sa portfolio ko ang pinaka overweight at pinaka underweight kumpara sa plan ko?','Anong asset classes ang overweight at underweight kumpara sa targets ko?','Which investments in my portfolio are most overweight and most underweight compared with my chosen plan?','Which sleeves are underweight and overweight relative to my selected plan?','Which asset classes are most above and below my chosen plan targets?','Arbor, '+EXACT[:-1]+' po!']
PROVIDERS=['Where can I invest?','Where do I invest?','Where can I buy investments?','Saan ako mag-invest?','Saan ako puwedeng maginvest?','Saan ko pwede mag invest?','Saan ako mamuhunan?','Saan ako puwedeng mamuhunan?','Ano ang pinili kong investments?','Anong providers sa chosen plan ko?','Arbor, saan ako mag-iinvest po?','Where are my saved providers?','Ano yung saved investment choices ko?']
@pytest.mark.parametrize('question',COMPARISONS)
def test_multilingual_comparisons_rank_both_sides(endpoint,monkeypatch,question):
 api,state=endpoint;state['saved']=saved(selected_approach='Aggressive',explicit_customization={'technology_tilt':10,'bitcoin':10});row=holding('gotrade_vt','2');state['rows']['A']={str(row.id):row};monkeypatch.setattr(chat,'ask_usage',lambda *_a,**_k:None);before=deepcopy(state)
 body=api.post('/chat',json={'message':question}).json()
 assert body['intent']=='actual_holdings' and body['action']=='portfolio'
 assert 'Most above target: Global Equity, 20.00 percentage points above.' in body['reply']
 assert 'Most below target: Technology and Bitcoin (tied), 10.00 percentage points below.' in body['reply']
 assert 'not individual-investment targets' in body['reply'] and '100.00% current allocation versus 80% plan target' in body['reply']
 assert 'Most above target' in body.get('summary',body['reply']) and 'Most below target' in body.get('summary',body['reply'])
 assert body['feedback_context']=={'intent':'actual_holdings','answer_version':'deterministic-ask-1'} and state==before
@pytest.mark.parametrize('question,direction',[
 ('Which holdings are most overweight against my targets?','above'),('Which parts in my portfolio are furthest underweight compared to the plan I chose?','below'),('Aling investment sa portfolio ko ang pinaka-underweight kumpara sa chosen plan ko?','below'),('Anong sleeves ang pinaka-overweight kumpara sa plan ko?','above'),('Which asset classes are furthest below my targets?','below')])
def test_one_sided_request(question,direction):
 normalized=match_question(question).question;assert allocation_gap_request(normalized)==direction;assert classify_v2_question(question)==('investment','actual_holdings')
 result=valued([holding('gotrade_vt','2')],[price('gotrade_vt','100'),price('usd_php','50')]);text=explain_portfolio(normalized,result)
 assert f'Most {direction} target:' in text
 assert f'Most {"below" if direction=="above" else "above"} target:' not in text
@pytest.mark.parametrize('question',PROVIDERS)
@pytest.mark.parametrize('chosen',[True,False])
def test_provider_basics(endpoint,monkeypatch,question,chosen):
 api,state=endpoint;state['saved']=saved(selected_approach='Growth',implementation_choices={'global_equity':'gotrade_vt','defensive':'gotrade_bnd'} if chosen else {});monkeypatch.setattr(chat,'ask_usage',lambda *_a,**_k:None);monkeypatch.setattr(chat,'ask_arbor',lambda *_a,**_k:pytest.fail('No legacy fallback for V2 provider question'));before=deepcopy(state)
 body=api.post('/chat',json={'message':question}).json();assert body['intent']=='implementation' and body['action']=='portfolio'
 if chosen:assert 'You chose these investments:' in body['reply'] and 'through Gotrade' in body['reply'] and 'GFunds' not in body['reply'] and 'PDAX' not in body['reply']
 else:assert 'No implementation product choice is saved' in body['reply'] and 'none is selected automatically' in body['reply']
 assert 'Ways to invest' in body['reply'] and 'does not place trades' in body['reply'] and state==before
@pytest.mark.parametrize('mode',['free','plus'])
def test_gates_quota_unchanged(endpoint,monkeypatch,mode):
 api,state=endpoint;state['mode']=mode;calls=[]
 def usage(*args,**kwargs):calls.append(kwargs.get('consume',False));return {'allowed':True}
 monkeypatch.setattr(chat,'ask_usage',usage);row=holding('gotrade_vt','2');state['rows']['A']={str(row.id):row};body=api.post('/chat',json={'message':EXACT}).json()
 if mode=='free':assert 'part of Arbor Plus' in body['reply'] and 'Most above' not in body['reply']
 else:assert 'Most above target' in body['reply']
 assert calls==[True]
@pytest.mark.parametrize('kind',['empty','missing','zero','no_target','unavailable','cached'])
def test_honest_comparison_states(endpoint,monkeypatch,kind):
 api,_=endpoint;monkeypatch.setattr(chat,'ask_usage',lambda *_a,**_k:None);result=valued([holding('gotrade_vt','2')],[price('gotrade_vt','100'),price('usd_php','50')])
 if kind=='empty':result=valued([],[])
 elif kind=='missing':result=valued([holding()],[])
 elif kind=='zero':result=valued([holding('pdax_btc','.000000000001')],[price('btc_php','1')])
 elif kind=='no_target':result=result.model_copy(update={'sleeves':[]})
 elif kind=='unavailable':result=None
 else:result=result.model_copy(update={'stale_count':1})
 monkeypatch.setattr(live_portfolio,'optional_portfolio',lambda *_:result);body=api.post('/chat',json={'message':EXACT}).json()
 if kind=='cached':assert 'cached reference prices' in body['reply'] and 'summary' not in body
 else:assert 'Most above target' not in body['reply'] and 'Most below target' not in body['reply'] and '100.00%' not in body['reply']
def test_supplied_decimals_no_gap_and_ties():
 result=valued([holding('gotrade_vt','2')],[price('gotrade_vt','100'),price('usd_php','50')]);ss=[s.model_copy(update={'current_percentage':s.target_percentage,'difference_pp':Decimal('0')}) for s in result.sleeves];q=match_question(EXACT).question
 text=explain_portfolio(q,result.model_copy(update={'sleeves':ss}));assert 'No asset class is above its target.' in text and 'No asset class is below its target.' in text
 ss[0]=ss[0].model_copy(update={'difference_pp':Decimal('7.123456'),'current_percentage':Decimal('88.9')});text=explain_portfolio(q,result.model_copy(update={'sleeves':ss}));assert '7.12 percentage points above' in text and '88.90% current allocation' in text
@pytest.mark.parametrize('question',['Which investments are overweight?','Aling investment ang underweight?','What holdings are most above target and below target?','Kumusta portfolio ko?','Magkano portfolio ko at ano next step ko?'])
def test_ambiguity_no_read(endpoint,monkeypatch,question):
 api,_=endpoint;monkeypatch.setattr(chat,'get_my_profile',lambda **_:pytest.fail('No plan read'));monkeypatch.setattr(chat,'ask_usage',lambda *_a,**_k:pytest.fail('No quota for clarification'));body=api.post('/chat',json={'message':question}).json();assert body['intent']=='clarification' and 'action' not in body
@pytest.mark.parametrize('question,intent',[(EXACT+' Ibenta ko ba VT?','decision_boundary'),(EXACT+' Should I sell Bitcoin?','decision_boundary'),('Where should I invest?','decision_boundary'),('Saan pinakamagandang provider para sakin?','decision_boundary'),('Where can I invest? Write Python code.','out_of_scope'),(EXACT+' Write a recipe.','out_of_scope')])
def test_mixed_boundaries(question,intent):
 assert classify_v2_question(question)[1]==intent;assert not allocation_gap_request(match_question(question).question)
@pytest.mark.parametrize('version',[None,'1.0','3.0'])
def test_provider_unsupported_versions(endpoint,monkeypatch,version):
 api,state=endpoint;state['saved']={'strategy_engine_version':version};monkeypatch.setattr(chat,'ask_usage',lambda *_a,**_k:None);monkeypatch.setattr(chat,'ask_arbor',lambda *_:pytest.fail('Do not use legacy provider fallback'));r=api.post('/chat',json={'message':'Where can I invest?'})
 if version=='3.0':assert r.status_code==409
 else:assert 'older Arbor plan does not store a verified provider choice' in r.json()['reply'] and r.json()['intent']=='implementation'

@pytest.mark.parametrize('question',COMPARISONS)
def test_legacy_target_questions_never_treat_historical_targets_as_holdings(endpoint,monkeypatch,question):
 api,state=endpoint;state['saved']={'strategy_engine_version':'1.0'};monkeypatch.setattr(chat,'ask_usage',lambda *_a,**_k:None);monkeypatch.setattr(chat,'ask_arbor',lambda *_:pytest.fail('No inferred legacy ranking'))
 body=api.post('/chat',json={'message':question}).json();assert 'unavailable for this older plan' in body['reply'] and 'Most above target' not in body['reply'] and body['intent']=='actual_holdings'
