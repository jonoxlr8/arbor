"""Real pinned PostgREST builders over mocked HTTP; never call a database."""
import gc
import json
import weakref
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import httpx
import pytest
from postgrest.exceptions import APIError

from app import authenticated_data as data


@pytest.fixture
def wire(monkeypatch):
    clients, requests = [], []
    real_client = httpx.Client
    def respond(request):
        requests.append(request)
        if 'fail' in request.url.path:
            return httpx.Response(403, json={"message":"synthetic denied", "code":"42501", "details":None, "hint":None})
        return httpx.Response(200, json=[{"owner": request.headers["authorization"]}],
                              headers={"Content-Range":"0-0/1"})
    def client(**kwargs):
        c = real_client(transport=httpx.MockTransport(respond), **kwargs)
        clients.append(c)
        return c
    monkeypatch.setattr(data.httpx, "Client", client)
    return clients, requests


def owner(token="owner-A"):
    return data.AuthenticatedDataClient("https://synthetic.supabase.test/", "synthetic-key", token)


def test_building_and_abandoning_queries_opens_no_http(wire):
    clients, requests = wire
    query = owner().table("records").select("*").eq("user_id", "A")
    ref = weakref.ref(query)
    assert not clients and not requests
    del query
    # No garbage collection is needed to release a query; it owns no transport.
    assert ref() is None


def test_select_filter_count_order_paging_headers_and_cleanup(wire):
    clients, requests = wire
    result = owner().table("records").select("*",count="exact").eq("user_id","A").in_("id",["1","2"]).is_("voided_at","null").gte("day","2026-01-01").lt("day","2027-01-01").lte("revision",2).order("day",desc=True).range(0,999).execute()
    assert result.count == 1 and result.data == [{"owner":"Bearer owner-A"}]
    r = requests[0]
    assert r.url.path == "/rest/v1/records"
    assert r.headers["apikey"] == "synthetic-key"
    assert r.headers["authorization"] == "Bearer owner-A"
    assert r.headers["accept-profile"] == "public"
    assert r.url.params["user_id"] == "eq.A"
    assert r.url.params["order"] == "day.desc"
    assert r.url.params["limit"] == "1000"
    assert all(c.is_closed for c in clients)


@pytest.mark.parametrize("method,http_method", [("insert","POST"),("update","PATCH"),("delete","DELETE")])
def test_mutation_wire_and_returning_minimal(method,http_method,wire):
    clients, requests = wire
    query=owner().table("records")
    query=getattr(query,method)(*([] if method=="delete" else [{"amount":"100"}]), returning="minimal")
    if method!="insert": query=query.eq("user_id","A")
    query.execute()
    r=requests[0]
    assert r.method==http_method
    assert "return=minimal" in r.headers["prefer"]
    if method!="delete": assert json.loads(r.content)=={"amount":"100"}
    assert clients[0].is_closed


def test_rpc_payload_snapshot_and_request_scoped_owner(wire):
    clients, requests=wire
    payload={"p_id":"first"}
    client=owner()
    query=client.rpc("safe_rpc",payload)
    payload["p_id"]="changed"
    result=query.execute()
    assert json.loads(requests[0].content)=={"p_id":"first"}
    assert requests[0].url.path=="/rest/v1/rpc/safe_rpc"
    assert requests[0].headers["content-profile"]=="public"
    assert result.data[0]["owner"]=="Bearer owner-A"
    assert clients[0].is_closed
    assert "owner-A" not in repr(client)+repr(query)


def test_data_error_and_invalid_builder_both_close_http(wire):
    clients, requests=wire
    with pytest.raises(APIError): owner().rpc("fail",{}).execute()
    with pytest.raises(TypeError): owner().table("records").select(unexpected=True).execute()
    assert len(requests)==1 and all(c.is_closed for c in clients)


def test_transport_failure_closes_http(monkeypatch):
    clients=[];real=httpx.Client
    def fail(request): raise httpx.ReadTimeout("synthetic timeout",request=request)
    def make(**kwargs):
        c=real(transport=httpx.MockTransport(fail),**kwargs);clients.append(c);return c
    monkeypatch.setattr(data.httpx,"Client",make)
    with pytest.raises(httpx.ReadTimeout): owner().rpc("test",{}).execute()
    assert clients[0].is_closed


def test_concurrent_owners_cannot_share_bearer(monkeypatch):
    barrier=Barrier(2);clients=[];real=httpx.Client
    def respond(request):
        barrier.wait(timeout=5)
        return httpx.Response(200,json=[{"token":request.headers["authorization"]}])
    def make(**kwargs):
        c=real(transport=httpx.MockTransport(respond),**kwargs);clients.append(c);return c
    monkeypatch.setattr(data.httpx,"Client",make)
    def run(token): return owner(token).rpc("test",{}).execute().data[0]["token"]
    with ThreadPoolExecutor(max_workers=2)as pool:
        assert list(pool.map(run,["owner-A","owner-B"]))==["Bearer owner-A","Bearer owner-B"]
    assert len(clients)==2 and all(c.is_closed for c in clients)


def test_repeated_queries_release_clients_without_full_gc(monkeypatch):
    refs=[];real=httpx.Client
    def make(**kwargs):
        c=real(transport=httpx.MockTransport(lambda r:httpx.Response(200,json=[])),**kwargs);refs.append(weakref.ref(c));return c
    monkeypatch.setattr(data.httpx,"Client",make)
    for _ in range(100): owner().rpc("test",{}).execute()
    assert all(ref() is None or ref().is_closed for ref in refs)
    gc.collect()
    assert all(ref() is None for ref in refs)


def test_postgrest_constructor_failure_also_closes_http(wire,monkeypatch):
    clients,_=wire
    def fail(*a,**k): raise ValueError("synthetic invalid configuration")
    monkeypatch.setattr(data,"SyncPostgrestClient",fail)
    with pytest.raises(ValueError): owner().rpc("test",{}).execute()
    assert len(clients)==1 and clients[0].is_closed


def test_factory_does_not_create_auth_sdk_and_rejects_empty_token(wire,monkeypatch):
    from app import database
    monkeypatch.setattr(database,"create_client",lambda *a,**k:pytest.fail("full Auth SDK client created"))
    monkeypatch.setattr(database,"supabase_url","https://synthetic.supabase.test")
    monkeypatch.setattr(database,"supabase_key","synthetic-key")
    with pytest.raises(ValueError): database.get_authenticated_client("")
    assert database.get_authenticated_client("owner-A").rpc("test",{}).execute().data[0]["owner"]=="Bearer owner-A"


@pytest.mark.parametrize("operation", ["select","insert","update","delete","rpc"])
def test_real_supabase_and_adapter_have_same_security_and_query_wire(operation,monkeypatch):
    from supabase import create_client,ClientOptions
    real_http=httpx.Client;requests=[]
    def respond(request):
        requests.append(request)
        return httpx.Response(200,json=[{"ok":True}],headers={"Content-Range":"0-0/1"})
    def query(client):
        if operation=="rpc":return client.rpc("test",{"p_value":"100"})
        q=client.table("records")
        if operation=="select":return q.select("id",count="exact").eq("user_id","A").order("id").limit(1)
        if operation=="insert":return q.insert({"user_id":"A","value":"100"},returning="minimal")
        if operation=="update":return q.update({"value":"100"},returning="minimal").eq("user_id","A")
        return q.delete(returning="minimal").eq("user_id","A")
    with real_http(transport=httpx.MockTransport(respond))as original_http:
        original=create_client("https://synthetic.supabase.test","synthetic-key",options=ClientOptions(httpx_client=original_http,auto_refresh_token=False,persist_session=False))
        original.postgrest.auth("owner-A")
        query(original).execute()
    monkeypatch.setattr(data.httpx,"Client",lambda **kw:real_http(transport=httpx.MockTransport(respond),**kw))
    query(owner()).execute()
    a,b=requests
    assert (a.method,a.url,a.content)==(b.method,b.url,b.content)
    for key in ["authorization","apikey","accept-profile","content-profile","prefer"]:
        assert a.headers.get(key)==b.headers.get(key)
