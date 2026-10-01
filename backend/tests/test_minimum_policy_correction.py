"""Owner-directed execution policy; no independent verification or price floor."""
from decimal import Decimal
import pytest
from app.services.contributions.engine import _check_minimum
from app.services.contributions.models import MinimumInputs
from app.services.implementation.products import get_product


def inputs(amount, owned=()):
    return MinimumInputs(contribution_amount=amount, contribution_currency='PHP',
        current_portfolio={'currency':'PHP','global_equity':0,'defensive':0,
                          'technology_tilt':0,'crypto':0,'owned_product_ids':owned})


@pytest.mark.parametrize('product_id,minimum', [
    ('gcash_global_equity',500), ('gcash_technology',500), ('gcash_defensive',50),
    ('gotrade_vt',100), ('gotrade_vgt',100), ('gotrade_bnd',100),
    ('dragonfi_global_equity',1000), ('dragonfi_technology',1000), ('dragonfi_defensive',1000),
])
@pytest.mark.parametrize('difference', [-1,0,1])
def test_initial_boundaries_and_exact_ownership(product_id, minimum, difference):
    product = get_product(product_id)
    first = _check_minimum(product, inputs(minimum+difference, ('pdax_btc',)))
    assert first.purchase_type=='initial' and first.applicable_minimum==minimum
    assert first.status==('below_minimum' if difference<0 else 'ready')
    assert first.amount_needed_to_minimum==max(0,-difference)
    additional = _check_minimum(product,inputs(100000,(product_id,)))
    assert additional.purchase_type=='additional'
    assert additional.applicable_minimum is additional.amount_needed_to_minimum is None
    assert additional.status=='verify_minimum' and additional.reason=='additional_unknown'
    assert product.last_verified_at is None


@pytest.mark.parametrize('product_id', ['gcrypto_btc','coins_btc','pdax_btc'])
@pytest.mark.parametrize('owned', [False,True])
@pytest.mark.parametrize('amount', ['0.01','5','50','10000'])
def test_bitcoin_unknown_is_neither_zero_nor_a_readiness_threshold(product_id,owned,amount):
    result = _check_minimum(get_product(product_id),inputs(Decimal(amount),(product_id,) if owned else ()))
    assert result.purchase_type==('additional' if owned else 'initial')
    assert result.applicable_minimum is result.amount_needed_to_minimum is None
    assert result.status=='verify_minimum'
    assert result.reason!='minimum_met'
