"""Fixture-only guards and storage checks; synthetic signed JWTs, no hosted calls."""
import os
from pathlib import Path
import subprocess
import textwrap

import pytest

OWNER = "11111111-1111-4111-8111-111111111111"


def fixture_environment(**updates):
    environment = {**os.environ, "APP_ENV":"test", "ARBOR_COMPLETION_E2E":"true",
        "ARBOR_PORTFOLIO_E2E":"true", "ARBOR_MONTHLY_E2E":"true",
        "ARBOR_E2E_ACCOUNT_IS_DISPOSABLE":"true", "ARBOR_E2E_USER_ID":OWNER,
        "LIVE_PORTFOLIO_ENABLED":"true", "MONTHLY_CHECKIN_ENABLED":"true",
        "ARBOR_MANUAL_VALUE_E2E":"true", "ARBOR_COMPLETION_ONBOARDING":"false",
        "SUPABASE_URL":"https://fixture.supabase.co", "SUPABASE_KEY":"fixture-anon-key"}
    environment.pop("RENDER", None)
    environment.pop("VERCEL", None)
    environment.update(updates)
    return environment


@pytest.mark.parametrize("overrides", [
    {"APP_ENV":"production"}, {"RENDER":"true"}, {"VERCEL":"1"},
    {"ARBOR_COMPLETION_E2E":"false"}, {"ARBOR_PORTFOLIO_E2E":"false"},
    {"ARBOR_MONTHLY_E2E":"false"}, {"MONTHLY_CHECKIN_ENABLED":"false"},
    {"ARBOR_E2E_ACCOUNT_IS_DISPOSABLE":"false"}, {"ARBOR_E2E_USER_ID":""},
    {"ARBOR_E2E_USER_ID":"not-a-uuid"}, {"ARBOR_COMPLETION_ONBOARDING":"maybe"},
])
def test_fixture_rejects_unsafe_configuration(overrides):
    result = subprocess.run([".venv/bin/python", "-c",
        "import sys; sys.path.insert(0,'tests'); import e2e_completion_app"],
        env=fixture_environment(**overrides), capture_output=True, text=True, timeout=15)
    assert result.returncode != 0
    assert "Completion fixture" in result.stderr or "Completion onboarding fixture" in result.stderr


@pytest.mark.parametrize("onboarding", ["true", "false"])
def test_isolated_profile_crud_real_signed_auth_and_no_hosted_client(onboarding):
    script = textwrap.dedent('''
        import json, os, sys, time
        from types import SimpleNamespace
        import jwt
        from cryptography.hazmat.primitives.asymmetric import ec
        from fastapi.testclient import TestClient
        from app import auth
        signing_key = ec.generate_private_key(ec.SECP256R1())
        class TestJwks:
            def get_signing_key_from_jwt(self, token):
                return SimpleNamespace(key=signing_key.public_key())
        auth.jwks_client = TestJwks()
        sys.path.insert(0, "tests")
        import e2e_completion_app as fixture
        from app.database import get_authenticated_client, supabase
        from app.schemas.profile_v2 import ProfileV2Answers
        now = int(time.time())
        def headers(owner=fixture.OWNER):
            token = jwt.encode({"sub":owner,"iss":auth.JWT_ISSUER,"aud":"authenticated",
                "exp":now+300,"iat":now}, signing_key, algorithm="ES256")
            return {"Authorization":"Bearer "+token}
        client = TestClient(fixture.app)
        assert client.get("/profiles/me").status_code == 401
        assert client.get("/profiles/me",headers=headers("22222222-2222-4222-8222-222222222222")).status_code == 403
        initial = client.get("/profiles/me",headers=headers())
        assert initial.headers["x-arbor-completion-fixture"] == "isolated"
        assert initial.status_code == (404 if os.getenv("ARBOR_COMPLETION_ONBOARDING") == "true" else 200)
        body = {"strategy_engine_version":"2.0","full_name":"Alex","country":"Philippines","currency":"PHP",
            "emergency_savings":"three_to_six_months","high_interest_debt":"none","goal_target":None,
            "current_portfolio_value":0,"monthly_investment":10000,"horizon":"ten_plus_years",
            "risk_response":"continue_investing","selected_approach":"Aggressive",
            "explicit_customization":{"technology_tilt":10,"bitcoin":10}}
        preview = client.post("/v2/plan-preview",json=body,headers=headers())
        assert preview.status_code == 200
        if initial.status_code == 404:
            assert client.get("/profiles/me",headers=headers()).status_code == 404
            saved = client.post("/v2/profiles",json=body,headers=headers()).json()
        else:
            current = initial.json()
            request = {"inputs":{k:current["profile"][k] for k in ProfileV2Answers.model_fields},
                "expected_revision":current["revision"],"proposed_approach":"Aggressive",
                "explicit_customization":body["explicit_customization"]}
            saved_response = client.put("/v2/profiles/me",json=request,headers=headers())
            assert saved_response.status_code == 200, saved_response.text
            saved = saved_response.json()
            assert client.put("/v2/profiles/me",json=request,headers=headers()).status_code == 409
        assert saved["plan"]["final_allocation"][0]["percentage_points"] == 80
        choices = {"expected_revision":saved["revision"],"choices":{"global_equity":"gotrade_vt"}}
        chosen = client.put("/v2/implementation-choices",json=choices,headers=headers())
        assert chosen.status_code == 200, chosen.text
        assert client.put("/v2/implementation-choices",json=choices,headers=headers()).status_code == 409
        assert client.get("/profiles/me",headers=headers()).json() == chosen.json()
        assert client.get("/v2/portfolio",headers=headers()).json()["holdings"] == []
        recorded = client.post("/v2/portfolio/holdings",json={"provider":"gcash","product_id":"gcash_global_equity","manual_value_php":"8000"},headers=headers())
        assert recorded.status_code in (200,201), recorded.text
        monthly = client.get("/v2/monthly-plan",headers=headers())
        assert monthly.status_code == 200, monthly.text
        token = headers()["Authorization"].split(" ",1)[1]
        local = get_authenticated_client(token)
        for operation in (lambda:local.table("unexpected"), lambda:local.rpc("anything"),lambda:supabase.table("profiles")):
            try: operation()
            except RuntimeError: pass
            else: raise AssertionError("Hosted fallback must be impossible")
        assert set(fixture.profile_rows) == {fixture.OWNER}
    ''')
    result = subprocess.run([".venv/bin/python", "-c", script],
        env=fixture_environment(ARBOR_COMPLETION_ONBOARDING=onboarding), capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stderr


def test_production_does_not_import_completion_fixture():
    assert "e2e_completion_app" not in Path("app/main.py").read_text()
    assert "ARBOR_COMPLETION_E2E" not in Path("app/database.py").read_text()
