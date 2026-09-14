from datetime import datetime, timezone
from types import SimpleNamespace
from cryptography.hazmat.primitives.asymmetric import ec
import jwt
import pytest
from fastapi import HTTPException
from app import auth


@pytest.fixture
def token_factory(monkeypatch):
    fixed = datetime(2026, 1, 1, tzinfo=timezone.utc)
    class FrozenDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            return fixed
    monkeypatch.setattr(jwt.api_jwt, "datetime", FrozenDateTime)
    key = ec.generate_private_key(ec.SECP256R1())
    monkeypatch.setattr(auth.jwks_client, "get_signing_key_from_jwt", lambda _: SimpleNamespace(key=key.public_key()))
    now = int(fixed.timestamp())
    claims = {"sub": "11111111-1111-4111-8111-111111111111", "iss": auth.JWT_ISSUER, "aud": "authenticated", "exp": now + 3600, "iat": now}
    return claims, lambda c: jwt.encode(c, key, algorithm="ES256"), now


def test_valid_token(token_factory):
    claims, sign, _ = token_factory
    assert auth.get_current_user_id("Bearer " + sign(claims)) == claims["sub"]


@pytest.mark.parametrize("field", ["exp", "iat", "iss", "aud", "sub"])
def test_missing_claim_rejected(token_factory, field):
    claims, sign, _ = token_factory
    del claims[field]
    with pytest.raises(HTTPException) as caught:
        auth.get_current_user_id("Bearer " + sign(claims))
    assert caught.value.status_code == 401
    assert caught.value.detail == "Invalid or expired token"


@pytest.mark.parametrize("edit", [{"iss": "https://other.invalid/auth/v1"}, {"aud": "anon"}, {"sub": "not-a-uuid"}, {"sub": ""}, {"sub": 3}])
def test_wrong_claim_rejected(token_factory, edit):
    claims, sign, _ = token_factory
    with pytest.raises(HTTPException) as caught:
        auth.get_current_user_id("Bearer " + sign({**claims, **edit}))
    assert caught.value.status_code == 401


@pytest.mark.parametrize("field,offset,allowed", [("exp", -3, True), ("exp", -10, False), ("iat", 3, True), ("iat", 10, False), ("nbf", 3, True), ("nbf", 10, False)])
def test_timestamp_leeway(token_factory, field, offset, allowed):
    claims, sign, now = token_factory
    token = sign({**claims, field: now + offset})
    if allowed:
        assert auth.get_current_user_id("Bearer " + token) == claims["sub"]
    else:
        with pytest.raises(HTTPException):
            auth.get_current_user_id("Bearer " + token)


def test_unsupported_algorithm(token_factory):
    claims, _, _ = token_factory
    token = jwt.encode(claims, "test-only-signing-key-long-enough-for-hs256", algorithm="HS256")
    with pytest.raises(HTTPException) as caught:
        auth.get_current_user_id("Bearer " + token)
    assert caught.value.status_code == 401
