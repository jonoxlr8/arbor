"""Common-language questions must use the same canonical route and safe boundaries."""
import pytest
from test_live_portfolio import endpoint,holding,saved
from app.routes import chat
@pytest.mark.parametrize('mode',['free','plus'])
def test_taglish_worth_equals_canonical_and_has_navigation(endpoint,monkeypatch,mode):
 api,state=endpoint;state['mode']=mode
 monkeypatch.setattr(chat,'ask_usage',lambda *_args,**_kwargs:{'allowed':True})
 row=holding('gotrade_vt','2');state['rows']['A']={str(row.id):row}
 english=api.post('/chat',json={'message':'What is my portfolio worth?'}).json()
 taglish=api.post('/chat',json={'message':'Magkano portfolio ko ngayon?'}).json()
 assert taglish['reply']==english['reply'] and '10,000.00' in taglish['reply']
 assert taglish['action']=='portfolio' and taglish['feedback_context']['intent']=='actual_holdings'
 if mode=='free':assert '100.00%' not in taglish['reply']
@pytest.mark.parametrize('question',['Kumusta portfolio ko?','Magkano investment ko?','Paano ito?','Magkano portfolio ko at paano ko palitan plan ko?'])
def test_ambiguous_questions_do_not_read_or_consume(endpoint,monkeypatch,question):
 api,_=endpoint
 monkeypatch.setattr(chat,'get_my_profile',lambda **_:pytest.fail('Ambiguity must not read private plan'))
 monkeypatch.setattr(chat,'ask_usage',lambda *_a,**_k:pytest.fail('Ambiguity must not consume quota'))
 body=api.post('/chat',json={'message':question}).json();assert body['intent']=='clarification';assert 'action' not in body
@pytest.mark.parametrize('question',['Bilhin ko ba VT?','Pinakamagandang ETF para sakin?','Alin ang pipiliin, VT o VGT?','Sulit ba Gotrade?'])
def test_native_advice_has_no_personal_read_or_provider_choice(endpoint,monkeypatch,question):
 api,_=endpoint
 monkeypatch.setattr(chat,'get_my_profile',lambda **_:pytest.fail('Advice must not read plan'))
 body=api.post('/chat',json={'message':question}).json();assert body['intent']=='decision_boundary';assert 'I don’t choose' in body['reply'];assert 'action' not in body

def test_native_advice_mixed_with_out_of_scope_keeps_scope_boundary(endpoint):
 api,_=endpoint
 body=api.post('/chat',json={'message':'Write Python code at bilhin VT ngayon'}).json();assert body['intent']=='out_of_scope'

def test_taglish_empty_and_missing_price_are_honest(endpoint):
 api,state=endpoint
 assert 'No holdings' in api.post('/chat',json={'message':'Magkano portfolio ko?'}).json()['reply']
 row=holding('gotrade_vt','2');state['rows']['A']={str(row.id):row};state['missing']={'usd_php'}
 body=api.post('/chat',json={'message':'Magkano portfolio ko?'}).json();assert 'unavailable' in body['reply'].lower();assert 'summary' not in body
