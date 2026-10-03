"""Generate synthetic previews via the real chat route and frozen valuation fixture."""
import sys,json
from decimal import Decimal
import pytest
from test_live_portfolio import endpoint,holding
from app.routes import chat
plan=json.load(sys.stdin)
mp=pytest.MonkeyPatch();generator=endpoint.__wrapped__(mp)
try:
 api,state=next(generator);state['saved']=plan
 mp.setattr(chat,'ask_usage',lambda *_a,**_kw:None)
 row=holding('gotrade_vt','24.96').model_copy(update={'cost_basis_php':Decimal('116000'),'opening_units':Decimal('24.96'),'opening_cost_php':Decimal('116000')})
 state['rows']['A']={str(row.id):row}
 result={'portfolio':api.get('/v2/portfolio').json(),'answers':{}}
 for q in ['Magkano portfolio ko?','Aligned ba portfolio ko sa plan ko?','Paki explain yung plan ko','Kumusta portfolio ko?','Bilhin ko ba VT?','Ano ang difference ng ETF at UITF?','Ano ang tubo sa portfolio ko?']:
  r=api.post('/chat',json={'message':q});assert r.status_code==200,r.text;result['answers'][q]=r.json()
 state['missing']={'usd_php'}
 result['missing']=api.post('/chat',json={'message':'Magkano portfolio ko?'}).json()
 state['missing']=set();state['rows']['A']={}
 result['empty']=api.post('/chat',json={'message':'Magkano portfolio ko?'}).json()
 print(json.dumps(result))
finally:
 generator.close();mp.undo()
