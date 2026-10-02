"""Arbor PHP planning threshold, never a broker/deposit requirement."""
from decimal import Decimal
import pytest
from app.services.contributions.engine import check_allocation_minimum
from app.services.contributions.models import CurrentPortfolio, MinimumInputs
from app.services.implementation.products import PRODUCTS
from test_monthly_plan import calculate

PRODUCTS_IDS = ['gotrade_vt', 'gotrade_vgt', 'gotrade_bnd']

@pytest.mark.parametrize('product_id', PRODUCTS_IDS)
@pytest.mark.parametrize('held', [False, True])
@pytest.mark.parametrize('amount,status', [('0.01','below_minimum'),('99.99','below_minimum'),('100','ready'),('100.01','ready'),('60000','ready')])
def test_each_allocated_php_amount_not_total_budget(product_id, held, amount, status):
    request = MinimumInputs(contribution_currency='PHP', contribution_amount=Decimal('60000'),
        current_portfolio=CurrentPortfolio(currency='PHP', global_equity=0,defensive=0,technology_tilt=0,crypto=0,owned_product_ids=frozenset([product_id] if held else [])))
    result = check_allocation_minimum(PRODUCTS[product_id], request, Decimal(amount))
    assert result.status == status
    assert result.purchase_type == ('additional' if held else 'initial')
    assert result.applicable_minimum == 100 and result.minimum_currency == 'PHP'
    assert result.amount_needed_to_minimum == max(Decimal(0), Decimal(100)-Decimal(amount))
    assert PRODUCTS[product_id].minimum_order == 1
    assert PRODUCTS[product_id].minimum_order_currency == 'USD'
    assert PRODUCTS[product_id].minimum_additional_status == 'verify_in_app'

@pytest.mark.parametrize('held', [False, True])
def test_vt_60000_monthly_regression(held):
    result=calculate(amount='60000',choices={'global_equity':'gotrade_vt'},owned=('gotrade_vt',) if held else (),explicit_customization={'technology_tilt':0,'bitcoin':0})
    assert result.rows[0].amount == 60000 and result.rows[0].status == 'ready'
    assert result.ready_amount == result.recordable_amount == 60000
    assert result.verify_minimum_amount == result.waiting_amount == result.unallocated_amount == 0

@pytest.mark.parametrize('held', [False, True])
@pytest.mark.parametrize('budget,small,status', [('999.90','99.99','below_minimum'),('1000','100','ready')])
def test_multiple_etfs_each_threshold_and_no_reassignment(held,budget,small,status):
    result=calculate(amount=budget,choices={'global_equity':'gotrade_vt','technology_tilt':'gotrade_vgt','defensive':'gotrade_bnd'},owned=tuple(PRODUCTS_IDS) if held else (),selected_approach='Balanced',explicit_customization={'technology_tilt':10,'bitcoin':0})
    # All assigned PHP is conserved, including below-minimum lines retained by user.
    assert sum(row.amount for row in result.rows) == Decimal(budget)
    assert result.unallocated_amount == 0
    tech=next(row for row in result.rows if row.product_id=='gotrade_vgt')
    assert tech.amount == Decimal(small) and tech.status == status
    assert tech.minimum.applicable_minimum == 100
    assert result.ready_amount+result.waiting_amount+result.verify_minimum_amount+result.choose_investment_amount+result.reserve_amount == Decimal(budget)
