"""Frozen synthetic valued holdings for view-only sort browser checks."""
import json,sys
from datetime import datetime,timezone
from decimal import Decimal
from test_live_portfolio import holding,price
from app.services.strategy_v2 import Allocation
from app.services.live_portfolio import value_portfolio,FixtureMarketData,catalog
saved=json.load(sys.stdin);now=datetime.now(timezone.utc)
rows=[holding('gotrade_vt','2').model_copy(update={'cost_basis_php':Decimal('10000')}),
 holding('gcash_global_equity','200').model_copy(update={'cost_basis_php':Decimal('22000')}),
 holding('pdax_btc','.02').model_copy(update={'cost_basis_php':Decimal('5000')}),
 holding('dragonfi_technology','99').model_copy(update={'cost_basis_php':None}),
 holding('gcash_defensive','30').model_copy(update={'cost_basis_php':Decimal('3000')})]
quotes=[price('gotrade_vt','100'),price('usd_php','50'),price('gcash_global_equity','100'),price('btc_php','3000000'),price('gcash_defensive','100')]
quotes=[p.model_copy(update={'as_of':now})for p in quotes]
target=Allocation(weights=saved['plan']['final_allocation'])
result=value_portfolio(rows,FixtureMarketData(quotes),target,now)
print(json.dumps({**result.model_dump(mode='json'),'catalog':catalog(),'history':[]}))
