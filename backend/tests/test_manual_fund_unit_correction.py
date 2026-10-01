from datetime import datetime,timedelta,timezone
from decimal import Decimal
from uuid import uuid4
import pytest
from app.services.live_portfolio import Holding,Price,FixtureMarketData,value_portfolio
NOW=datetime(2026,10,1,tzinfo=timezone.utc)
@pytest.mark.parametrize('cost',[Decimal('500'),None])
def test_correcting_owned_units_uses_nav_without_inventing_cost(cost):
 before=Holding(id=uuid4(),product_id='gcash_global_equity',provider='gcash',units=None,
  cost_basis_php=cost,manual_value_php=Decimal('1000'),manual_value_updated_at=NOW-timedelta(days=8),created_at=NOW,updated_at=NOW)
 assert value_portfolio([before],FixtureMarketData([]),None,NOW).total_value_php is None
 corrected=before.model_copy(update={'units':Decimal('10'),'opening_units':Decimal('10'),'opening_cost_php':cost})
 nav=Price(price_key='gcash_global_equity',value=Decimal('120'),as_of=NOW)
 result=value_portfolio([corrected],FixtureMarketData([nav]),None,NOW)
 assert result.total_value_php==Decimal('1200') and result.holdings[0].valuation_source=='nav'
 assert result.recorded_cost_php==cost
 assert result.recorded_gain_php==(Decimal('700') if cost is not None else None)
 assert corrected.manual_value_php==before.manual_value_php
 assert value_portfolio([corrected],FixtureMarketData([]),None,NOW).total_value_php is None

def test_recent_manual_fallback_remains_when_nav_missing_after_unit_correction():
 h=Holding(id=uuid4(),product_id='gcash_global_equity',provider='gcash',units=Decimal('10'),
  cost_basis_php=Decimal('500'),manual_value_php=Decimal('1000'),manual_value_updated_at=NOW,created_at=NOW,updated_at=NOW)
 r=value_portfolio([h],FixtureMarketData([]),None,NOW)
 assert r.total_value_php==Decimal('1000') and r.recorded_gain_php==Decimal('500')
