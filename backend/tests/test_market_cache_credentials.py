"""Operator credentials are synthetic; all HTTP requests stay in MockTransport."""
import base64
import json

import httpx
import pytest

from app.market_data import __main__ as cli
from app.market_data.cache import SharedCache
from app.market_data.models import MarketDataError, manual_nav
from test_market_data import NOW


MODERN = "sb_secret_synthetic_test_only"


def jwt_part(value):
    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")


LEGACY = ".".join((jwt_part({"alg": "HS256"}), jwt_part({"role": "service_role"}), "synthetic_signature"))
URL = "https://synthetic.supabase.co"


@pytest.mark.parametrize("key", [MODERN, LEGACY])
def test_read_write_and_claim_headers(key):
    calls = []
    record = manual_nav("dragonfi_defensive", "100.123456789012", "2026-09-24",
                        "https://www.bpi.com.ph/fund", "PHP", NOW)

    def respond(request):
        calls.append(request)
        assert request.url.host == "synthetic.supabase.co"
        assert request.headers["apikey"] == key
        if key == MODERN:
            assert "authorization" not in request.headers
        else:
            assert request.headers["authorization"] == "Bearer " + key
        if request.method == "GET":
            return httpx.Response(200, json=[record.model_dump(mode="json")])
        if "/rpc/" in request.url.path:
            return httpx.Response(200, json=True)
        assert json.loads(request.content)[0]["value"] == "100.123456789012"
        return httpx.Response(201)

    with httpx.Client(transport=httpx.MockTransport(respond),
                      headers={"Authorization": "Bearer inherited_test_value"},
                      auth=("synthetic", "unused")) as client:
        cache = SharedCache(client, URL, key)
        cache.write([record])
        assert cache.read([record.price_key]) == {record.price_key: record}
        assert cache.claim("coinranking", 600)
    assert len(calls) == 3


@pytest.mark.parametrize("key", [None, "", "sb_secret_", "sb_publishable_synthetic",
                                 "bad-key", "sb_secret_bad\nvalue", " sb_secret_space",
                                 "eyJbad.eyJbad", "a.b.c"])
def test_invalid_credentials_fail_before_network_without_echo(key):
    with pytest.raises(MarketDataError) as error:
        SharedCache(None, URL, key)
    assert str(error.value) == ("cache_configuration_required" if not key else "cache_credential_invalid")


@pytest.mark.parametrize("url", ["https://evil.com", "https://synthetic.supabase.co.evil.com",
                                 "https://nested.synthetic.supabase.co", "https://synthetic.supabase.co:bad",
                                 "https://synthetic.supabase.co/rest/v1", "https://synthetic.supabase.co?x=y",
                                 "https://user:password@synthetic.supabase.co"])
def test_host_configuration_fails_closed(url):
    with pytest.raises(MarketDataError, match="^cache_configuration_required$"):
        SharedCache(None, url, MODERN)


@pytest.mark.parametrize("path", ["https://other.supabase.co/rest/v1/arbor_market_prices",
                                  "//other.supabase.co", "/profiles", "/../profiles"])
def test_client_cannot_supply_destination(path):
    cache = SharedCache(None, URL, MODERN)
    with pytest.raises(MarketDataError, match="^cache_operation_not_allowed$"):
        cache.call("POST", path)


@pytest.mark.parametrize("key", [MODERN, LEGACY])
@pytest.mark.parametrize("failure", ["timeout", "json", 403, 302])
def test_errors_and_redirects_do_not_leak_or_forward_credentials(key, failure, caplog):
    calls = []

    def fail(request):
        calls.append(request)
        if failure == "timeout":
            raise httpx.ReadTimeout(key, request=request)
        if failure == "json":
            return httpx.Response(200, text=key)
        return httpx.Response(failure, text=key, headers={"Location": "https://other.supabase.co"})

    with httpx.Client(transport=httpx.MockTransport(fail), follow_redirects=True) as client:
        with pytest.raises(MarketDataError) as error:
            SharedCache(client, URL, key).read(["btc_php"])
    assert key not in str(error.value)
    assert key not in caplog.text
    assert len(calls) == 1


@pytest.mark.parametrize("command", ["set-nav", "refresh"])
def test_operator_cli_uses_modern_key_without_live_calls(command, monkeypatch, capsys):
    calls = []

    def respond(request):
        calls.append(request)
        assert request.url.host == "synthetic.supabase.co"
        assert request.headers["apikey"] == MODERN
        assert "authorization" not in request.headers
        if request.method == "GET":
            return httpx.Response(200, json=[])
        return httpx.Response(201)

    client = httpx.Client(transport=httpx.MockTransport(respond))
    monkeypatch.setattr(cli.httpx, "Client", lambda: client)
    monkeypatch.setattr(cli, "load_dotenv", lambda: None)
    monkeypatch.setenv("SUPABASE_URL", URL)
    monkeypatch.setenv("SUPABASE_MARKET_DATA_KEY", MODERN)
    args = ["market_data", command]
    if command == "set-nav":
        args += ["dragonfi_defensive", "100", "2020-01-01", "https://www.bpi.com.ph/fund", "--unit-class", "PHP"]
    else:
        # Exercise the real writer through refresh without spending vendor requests.
        def refresh(cache, adapters):
            cache.write([manual_nav("dragonfi_defensive", "100", "2020-01-01",
                                    "https://www.bpi.com.ph/fund", "PHP")])
            return {"synthetic": "updated"}
        monkeypatch.setattr(cli, "refresh", refresh)
    monkeypatch.setattr(cli.sys, "argv", args)
    assert cli.main() == 0
    assert any(r.method == "POST" for r in calls)
    output = capsys.readouterr()
    assert MODERN not in output.out + output.err


def test_cli_malformed_key_is_sanitized(monkeypatch, capsys):
    monkeypatch.setattr(cli, "load_dotenv", lambda: None)
    monkeypatch.setenv("SUPABASE_URL", URL)
    monkeypatch.setenv("SUPABASE_MARKET_DATA_KEY", "malformed-sensitive-value")
    monkeypatch.setattr(cli.sys, "argv", ["market_data", "refresh"])
    assert cli.main() == 1
    output = capsys.readouterr()
    assert "malformed-sensitive-value" not in output.out + output.err
    assert "Reference-data operation failed" in output.err
