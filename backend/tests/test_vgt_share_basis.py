from datetime import date, datetime, timezone
from decimal import Decimal as D
from uuid import uuid4
from app.services.live_portfolio import Holding, FixtureMarketData, Price, value_portfolio

NOW=datetime(2026,10,2,2,0,tzinfo=timezone.utc)
def holding(**changes):
    data=dict(id=uuid4(),product_id='gotrade_vgt',provider='gotrade',units='1',cost_basis_php='40000',
              created_at=NOW,updated_at=NOW,share_basis_checked=True,valuation_units='8',effective_units='8',
              valuation_units_quote_date=NOW.date())
    data.update(changes)
    return Holding.model_validate(data)
def market():
    return FixtureMarketData([Price(price_key='gotrade_vgt',value='100',as_of=NOW),Price(price_key='usd_php',value='50',as_of=NOW)])

def test_live_valuation_uses_shared_sql_result_without_rewriting_recorded_units_or_cost():
    original=holding()
    result=value_portfolio([original],market(),None,NOW)
    assert result.total_value_php==D('40000') and result.total_value_usd==D('800')
    assert result.recorded_cost_php==D('40000') and result.recorded_gain_php==0
    assert result.holdings[0].units==1 and result.holdings[0].effective_units==8
    assert original.units==1 and original.cost_basis_php==D('40000')

def test_unknown_basis_is_unavailable_not_an_invented_zero_portfolio():
    unknown=holding(valuation_units=None,effective_units=None,share_basis_required=True)
    result=value_portfolio([unknown],market(),None,NOW)
    assert result.complete is False and result.total_value_php is None
    assert result.total_value_usd is None and result.holdings[0].value_php is None

def test_refresh_crossing_quote_date_fails_closed_until_consistent_basis_read():
    result=value_portfolio([holding(valuation_units_quote_date=date(2026,4,20))],market(),None,NOW)
    assert result.complete is False and result.total_value_php is None

def test_restated_count_is_not_multiplied_again():
    result=value_portfolio([holding(units='8',valuation_units='8',effective_units='8')],market(),None,NOW)
    assert result.total_value_php==D('40000')

def test_post_split_purchases_keep_raw_and_valuation_units_equal():
    result=value_portfolio([holding(units='2',valuation_units='2',effective_units='2',cost_basis_php='10000')],market(),None,NOW)
    assert result.total_value_php==D('10000') and result.recorded_gain_php==0

def test_store_hydrates_immutable_holding_from_owner_scoped_shared_view(monkeypatch):
    from types import SimpleNamespace
    from app.services import portfolio_store
    original=holding(share_basis_checked=False,valuation_units=None,effective_units=None)
    owner=str(uuid4())
    calls=[]
    rows={
        'arbor_portfolio_holding_values': [original.model_dump(mode='json')],
        'arbor_portfolio_holding_ledger_values': [dict(id=str(original.id),valuation_units='8',effective_units='8',
            quote_date=NOW.date().isoformat(),opening_share_basis=None)],
    }
    class Query:
        def __init__(self,table): self.table=table
        def select(self,*args): return self
        def eq(self,*args): calls.append((self.table,'eq',args)); return self
        def in_(self,*args): calls.append((self.table,'in',args)); return self
        def order(self,*args): return self
        def execute(self): return SimpleNamespace(data=rows[self.table])
    monkeypatch.setattr(portfolio_store,'get_authenticated_client',lambda token: SimpleNamespace(table=Query))
    restored=portfolio_store.PortfolioStore(owner,'Bearer fixture-only').holdings()[0]
    assert restored.units==1 and restored.cost_basis_php==D('40000')
    assert restored.effective_units==8 and restored.valuation_units==8 and restored.share_basis_checked
    assert value_portfolio([restored],market(),None,NOW).total_value_php==D('40000')
    assert ('arbor_portfolio_holding_ledger_values','eq',('user_id',owner)) in calls
    assert ('arbor_portfolio_holding_ledger_values','in',('id',[str(original.id)])) in calls
