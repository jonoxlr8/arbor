"""Monthly planning only: bounded indicative TOAP NAVs, never snapshot eligibility."""
from datetime import datetime, timezone

from app.market_data.models import ReferencePrice
from app.services.contributions.models import CurrentPortfolio
from app.services.live_portfolio import current_values, price_key
from app.services.reference_freshness import reference_age_seconds

# Product risk bound, not a publisher or TOAP publication SLA.
INDICATIVE_NAV_MAX_SECONDS = 7 * 24 * 60 * 60


def monthly_current_values(portfolio, store, now=None, *, allow_indicative=True):
    if not portfolio.stale_count:
        return current_values(portfolio), ()
    if not allow_indicative:
        raise ValueError("Client must support indicative NAV context")
    if not portfolio.complete or portfolio.unavailable_count:
        raise ValueError("A complete portfolio is required")
    stale = [h for h in portfolio.holdings if h.freshness == "stale"]
    if len(stale) != portfolio.stale_count or not stale:
        raise ValueError("Inconsistent portfolio freshness")
    if any(h.valuation_source != "nav" or h.price_kind != "nav" for h in stale):
        raise ValueError("Only verified TOAP NAVs qualify for indicative monthly planning")
    # Verify cached identity without another valuation. Concurrent cache changes
    # must match the exact price/date already used or this request fails closed.
    quotes = store.prices({price_key(h.product_id) for h in stale})
    now = now or datetime.now(timezone.utc)
    estimates = []
    for holding in stale:
        quote = quotes.get(price_key(holding.product_id))
        if quote is None:
            raise ValueError("Missing NAV identity")
        quote = ReferencePrice.model_validate(quote.model_dump())
        age = reference_age_seconds(quote, now)
        if (quote.kind != "nav" or quote.source != "toap" or age is None
                or not 0 <= age <= INDICATIVE_NAV_MAX_SECONDS
                or quote.value != holding.unit_price or quote.as_of != holding.as_of
                or holding.unit_price_currency != "PHP"):
            raise ValueError("NAV unavailable for indicative monthly planning")
        estimates.append({"product_id": holding.product_id, "as_of": quote.as_of,
                          "source": "toap", "unit_class": quote.unit_class})
    return CurrentPortfolio(currency="PHP", **{s.sleeve.value: s.known_value_php for s in portfolio.sleeves},
        owned_product_ids=frozenset(h.product_id for h in portfolio.holdings)), tuple(estimates)
