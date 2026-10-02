from copy import deepcopy
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, HTTPException, Header
from fastapi.testclient import TestClient
from app.services.monthly_review import monthly_review, review_window
from app.services.portfolio_store import PortfolioStore
from app.routes import live_portfolio
from app.auth import get_current_user_id
from app.services.entitlements import resolve_entitlements

NOW = datetime(2026, 10, 1, tzinfo=timezone.utc)
def entry(i=1, month="2026-09", amount="100.01", **changes):
    return dict(id=str(i),holding_id="holding",product_id="gotrade_vt",provider="gotrade",investment_date=month+"-12",amount_paid_php=amount,voided_at=None,revision=1,updated_at="2026-10-01T00:00:00Z",**changes)
class Store:
    def __init__(self, rows): self.rows=rows;self.calls=0
    def review_activity(self,start,end):
        self.calls+=1
        return deepcopy([r for r in self.rows if start<=r["investment_date"]<end])

def test_totals_reconcile_without_checkins_openings_or_voids():
    rows=[entry(1),entry(2,amount="20.22"),entry(3,amount=None),entry(4,month="2026-08",amount="80.00")]
    rows.append({**entry(5,amount="999"),"voided_at":"2026-10-01"})
    result=monthly_review(Store(rows),now=NOW)
    assert result["month"]=="2026-09" and not result["in_progress"]
    assert result["amount_php"]=="120.23" and result["record_count"]==3 and result["missing_amount_count"]==1
    assert result["breakdown"][0]["amount_php"]=="120.23"
    assert len(result["pattern"])==6 and result["pattern"][0]["amount_php"] is None
    assert result["pattern"][4]["amount_php"]=="80.00"

@pytest.mark.parametrize("moment,expected", [("2026-09-30T15:59:59+00:00","2026-08"),("2026-09-30T16:00:00+00:00","2026-09"),("2026-12-31T16:00:00+00:00","2026-12")])
def test_philippine_month_boundary(moment,expected):
    assert review_window(now=datetime.fromisoformat(moment))[0]==expected

def test_current_missing_zero_backdating_and_corrections():
    assert monthly_review(Store([]),now=NOW)["amount_php"] is None
    assert monthly_review(Store([entry(amount=None)]),now=NOW)["missing_amount_count"]==1
    assert monthly_review(Store([entry(amount="0.00")]),now=NOW)["amount_php"]=="0.00"
    rows=[{**entry(),"investment_date":"2026-08-12","amount_paid_php":"500.99","revision":2}]
    assert monthly_review(Store(rows),now=NOW)["record_count"]==0
    assert monthly_review(Store(rows),"2026-08",NOW)["amount_php"]=="500.99"
    assert monthly_review(Store([]),"2026-10",NOW)["in_progress"]
    with pytest.raises(HTTPException):monthly_review(Store([]),"2026-11",NOW)

def test_changed_or_duplicate_records_fail_closed():
    class Changing(Store):
        def review_activity(self,*args):
            rows=super().review_activity(*args)
            if self.calls==2:rows[0]["revision"]+=1
            return rows
    with pytest.raises(HTTPException) as e:monthly_review(Changing([entry()]),now=NOW)
    assert e.value.status_code==409
    with pytest.raises(HTTPException):monthly_review(Store([entry(),entry()]),now=NOW)

class Query:
    def __init__(self,rows,owner,truncated=False):self.rows=rows;self.owner=owner;self.filters={};self.truncated=truncated
    def select(self,*args,**kwargs):assert kwargs=={"count":"exact"};return self
    def eq(self,k,v):self.filters[k]=v;return self
    def is_(self,*args):return self
    def gte(self,k,v):self.start=v;return self
    def lt(self,k,v):self.end=v;return self
    def order(self,*args,**kwargs):return self
    def range(self,a,b):self.a=a;self.b=b;return self
    def execute(self):
        assert self.filters["user_id"]==self.owner
        rows=[r for r in self.rows if r["user_id"]==self.owner and r["voided_at"] is None and self.start<=r["investment_date"]<self.end]
        return SimpleNamespace(count=len(rows),data=rows[self.a:self.b+1][:500] if self.truncated else rows[self.a:self.b+1])

def real_store(rows,owner="A",truncated=False):
    store=PortfolioStore.__new__(PortfolioStore);store.owner=owner
    store.client=SimpleNamespace(table=lambda name:Query(rows,owner,truncated))
    store.budget_versions=lambda: None
    return store

def test_all_pages_owner_isolation_and_bounds():
    rows=[{**entry(i),"user_id":"A"} for i in range(2505)]+[{**entry(9999,amount="99999"),"user_id":"B"}]
    result=monthly_review(real_store(rows),now=NOW)
    assert result["record_count"]==2505 and result["amount_php"]=="250525.05"
    assert monthly_review(real_store(rows,"B"),now=NOW)["amount_php"]=="99999.00"
    with pytest.raises(HTTPException):monthly_review(real_store(rows,truncated=True),now=NOW)
    with pytest.raises(HTTPException):monthly_review(real_store([{**entry(i),"user_id":"A"} for i in range(10001)]),now=NOW)

def test_server_plus_gate_and_jwt_owner_not_query_owner(monkeypatch):
    monkeypatch.setenv("LIVE_PORTFOLIO_ENABLED","true")
    monkeypatch.setattr(live_portfolio.entitlements,"get_entitlements",lambda owner:resolve_entitlements("plus" if owner=="A" else "free","active"))
    owners=[]
    def make_store(owner,authorization):owners.append(owner);return Store([entry()])
    monkeypatch.setattr(live_portfolio,"PortfolioStore",make_store)
    def user(authorization:str|None=Header(default=None)):
        if authorization not in ("Bearer A","Bearer B"):raise HTTPException(401,"Sign in")
        return authorization[-1]
    app=FastAPI();app.include_router(live_portfolio.router);app.dependency_overrides[get_current_user_id]=user
    with TestClient(app) as c:
        assert c.get('/v2/portfolio/monthly-review').status_code==401
        assert c.get('/v2/portfolio/monthly-review',headers={"Authorization":"Bearer invalid"}).status_code==401
        assert c.get('/v2/portfolio/monthly-review?tier=plus',headers={"Authorization":"Bearer B"}).status_code==403
        r=c.get('/v2/portfolio/monthly-review?user_id=B&month=2026-09',headers={"Authorization":"Bearer A"})
        assert r.status_code==200 and owners==["A"] and r.headers['cache-control']=="private, no-store"
        assert c.get('/v2/portfolio/monthly-review?month=2026-13',headers={"Authorization":"Bearer A"}).status_code==422
