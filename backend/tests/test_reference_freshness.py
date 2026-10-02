from datetime import datetime,timedelta,timezone
from types import SimpleNamespace
from uuid import uuid4
import pytest
from app.services.reference_freshness import reference_age_seconds,CALENDAR,EASTERN
from app.market_data.models import ReferencePrice
from app.services.live_portfolio import value_portfolio,FixtureMarketData,Holding,current_values


def dt(s):return datetime.fromisoformat(s.replace('Z','+00:00'))
def quote(day='2026-09-30',**changes):
 return SimpleNamespace(price_key='gotrade_vt',as_of=dt(day+'T00:00:00Z'),source='marketstack',kind='etf_eod',currency='USD',verified=True,fetched_at=dt('2026-10-02T07:19:18Z'),**changes)
def changed(price,**kwargs):return SimpleNamespace(**{**vars(price),**kwargs})


def test_reported_quote_passes_without_rewriting_any_source_fields():
 p=quote();before=dict(vars(p));now=dt('2026-10-02T07:19:18Z')
 assert reference_age_seconds(p,now)==35*3600+19*60+18
 assert vars(p)==before
 prices=[ReferencePrice(value='100',**vars(p)),ReferencePrice(price_key='usd_php',value='50',as_of=dt('2026-10-01T00:02:31Z'),fetched_at=now,source='exchangerate_api',kind='fx',currency='PHP')]
 h=Holding(id=uuid4(),product_id='gotrade_vt',provider='gotrade',units=1,cost_basis_php=0,created_at=now,updated_at=now)
 result=value_portfolio([h],FixtureMarketData(prices),None,now)
 assert result.complete and result.stale_count==0 and result.holdings[0].value_php==5000
 assert current_values(result).global_equity==5000
 # Age is independent of repeated receipt time.
 p.fetched_at=now-timedelta(hours=4)
 assert reference_age_seconds(p,now)==35*3600+19*60+18

@pytest.mark.parametrize('hour,expected',[(48,172800),(48+1/3600,172801),(96,345600),(96+1/3600,345601)])
def test_unchanged_48_96_boundaries_from_completed_session(hour,expected):
 p=quote('2026-09-28');close=dt('2026-09-28T20:00:00Z');now=close+timedelta(hours=hour);p.fetched_at=close+timedelta(hours=1)
 assert reference_age_seconds(p,now)==expected

@pytest.mark.parametrize('day,now,age',[
 ('2026-10-02','2026-10-05T13:30:00Z',17.5), # Friday close, weekend, Monday open
 ('2026-09-04','2026-09-08T13:30:00Z',17.5), # verified Labor Day closure
 ('2026-11-25','2026-11-27T18:00:00Z',21), # Thanksgiving, early-close next session
 ('2026-11-27','2026-11-30T14:30:00Z',20.5),
 ('2026-12-24','2026-12-29T18:00:00Z',48), # max verified holiday + weekend closure block
 ('2026-03-06','2026-03-09T13:30:00Z',17.5), # spring DST weekend is 47 real hours
 ('2026-10-30','2026-11-02T14:30:00Z',17.5), # fall DST weekend is 49 real hours
])
def test_verified_closures_early_close_and_dst(day,now,age):
 p=quote(day);p.fetched_at=dt(day+'T23:00:00Z')
 assert reference_age_seconds(p,dt(now))==age*3600

@pytest.mark.parametrize('day',['2026-09-05','2026-09-07','2026-11-26'])
def test_known_non_session_quote_fails_closed(day):
 assert reference_age_seconds(quote(day),dt('2026-12-01T00:00:00Z')) is None

def test_future_preclose_unverified_unknown_year_and_source():
 now=dt('2026-10-02T07:19:18Z');p=quote()
 assert reference_age_seconds(changed(p,verified=False),now) is None
 assert reference_age_seconds(quote('2026-10-02'),now) is None
 assert reference_age_seconds(quote('2026-10-03'),now) is None
 assert reference_age_seconds(changed(p,fetched_at=dt('2026-09-30T19:59:59Z')),now) is None
 assert reference_age_seconds(changed(p,fetched_at=now+timedelta(seconds=1)),now) is None
 for attributes in [{'source':'unknown'},{'price_key':'unknown'},{'kind':'intraday'}]:
  assert reference_age_seconds(changed(p,**attributes),now)==(now-p.as_of).total_seconds()
 p=quote('2027-01-01');p.fetched_at=dt('2027-01-04T00:00:00Z')
 assert reference_age_seconds(p,p.fetched_at)==72*3600 # reviewed calendar expired, no weekend extension
 p=quote('2026-12-31');p.fetched_at=dt('2027-01-04T00:00:00Z')
 assert reference_age_seconds(p,p.fetched_at)==96*3600


def test_fx_crypto_nav_and_true_timestamps_keep_literal_age():
 now=dt('2026-10-02T07:19:18Z');p=quote()
 for key,kind,source,currency in [('usd_php','fx','exchangerate_api','PHP'),('btc_php','btc_reference','coinranking','PHP'),('gcash_global_equity','nav','toap','PHP')]:
  assert reference_age_seconds(changed(p,price_key=key,kind=kind,source=source,currency=currency),now)==(now-p.as_of).total_seconds()
 p.as_of=dt('2026-09-30T20:00:00Z')
 assert reference_age_seconds(p,now)==(now-p.as_of).total_seconds()


def test_outer_bound_and_expired_old_data():
 p=quote('2026-09-04');p.fetched_at=dt('2026-09-05T00:00:00Z')
 for now in ['2026-09-12T00:00:00Z','2026-12-30T00:00:00Z']:
  assert reference_age_seconds(p,dt(now))>96*3600


def test_same_observation_age_never_decreases_or_renews_across_closures():
 for day in ['2026-09-04','2026-12-24','2026-10-30','2026-12-31']:
  p=quote(day);p.fetched_at=dt(day+'T23:00:00Z');start=p.fetched_at
  ages=[reference_age_seconds(p,start+timedelta(hours=i)) for i in range(240)]
  assert ages==sorted(ages)


@pytest.mark.parametrize('key', ['gotrade_vt','gotrade_vgt','gotrade_bnd'])
def test_each_verified_etf_and_independent_missing_or_bad_fx(key):
 now=dt('2026-10-02T07:19:18Z')
 etf=ReferencePrice(value='100',**vars(changed(quote(),price_key=key)))
 fx=ReferencePrice(price_key='usd_php',value='50',as_of=dt('2026-10-01T00:02:31Z'),fetched_at=now,source='exchangerate_api',kind='fx',currency='PHP')
 holding=Holding(id=uuid4(),product_id=key,provider='gotrade',units=1,cost_basis_php=0,created_at=now,updated_at=now)
 for quotes in [[etf],[etf,fx.model_copy(update={'verified':False})],[etf,fx.model_copy(update={'fetched_at':now+timedelta(seconds=1)})]]:
  result=value_portfolio([holding],FixtureMarketData(quotes),None,now)
  assert not result.complete and result.unavailable_count==1
