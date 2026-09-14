import pytest
from fastapi.testclient import TestClient
from app.config import cors_origins


def test_development_default():
    assert cors_origins() == ["http://localhost:3000"]


def test_production_exact_origins_normalized():
    assert cors_origins(" https://APP.example.com/, https://second.example.com:443 ", "production") == ["https://app.example.com", "https://second.example.com"]


@pytest.mark.parametrize("value", [None, "", "*", "https://*.example.com", "not-url", "https://example.com/path", "https://example.com?query", "https://user:pass@example.com", "http://example.com", "https://localhost", "https://example.com,", "https://bad host", "https://bad_host", "https://example.com?", "https://127.0.0.2"])
def test_unsafe_production_origins_rejected(value):
    with pytest.raises(ValueError):
        cors_origins(value, "production")


def test_unknown_environment_rejected():
    with pytest.raises(ValueError):
        cors_origins(None, "prodution")


def test_actual_cors_middleware(monkeypatch):
    import importlib
    from app import main
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "https://app.example.com")
    try:
        client = TestClient(importlib.reload(main).app)
        headers = {"Origin": "https://app.example.com", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type"}
        response = client.options("/profiles", headers=headers)
        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == "https://app.example.com"
        assert "access-control-allow-credentials" not in response.headers
        assert client.options("/profiles", headers={**headers, "Origin": "https://other.example.com"}).status_code == 400
        assert client.options("/profiles", headers={**headers, "Access-Control-Request-Method": "PATCH"}).status_code == 400
    finally:
        monkeypatch.delenv("APP_ENV")
        monkeypatch.delenv("CORS_ALLOWED_ORIGINS")
        importlib.reload(main)
