"""Local completion-review fixture; production never imports this module.

Normal signed Supabase JWTs are required, and only the dedicated disposable
account is accepted. Profile, holdings, prices, history and monthly activity are
process-local fixtures. No profile/portfolio/monthly writes or reads reach the
hosted database. Restart the process to reset; there is no reset/admin endpoint.
"""
import json
import os
import sys
from copy import deepcopy
from threading import RLock
from types import SimpleNamespace
from uuid import UUID

from fastapi import Header, HTTPException


def require_local_configuration():
    owner = os.getenv("ARBOR_E2E_USER_ID", "")
    try:
        valid_owner = str(UUID(owner)) == owner.lower()
    except (ValueError, TypeError, AttributeError):
        valid_owner = False
    if (os.getenv("APP_ENV") != "test" or os.getenv("ARBOR_COMPLETION_E2E") != "true"
            or os.getenv("ARBOR_PORTFOLIO_E2E") != "true"
            or os.getenv("ARBOR_MONTHLY_E2E") != "true"
            or os.getenv("MONTHLY_CHECKIN_ENABLED") != "true"
            or os.getenv("ARBOR_E2E_ACCOUNT_IS_DISPOSABLE") != "true"
            or not valid_owner or os.getenv("RENDER") or os.getenv("VERCEL")):
        raise RuntimeError("Completion fixture requires explicit local disposable-account configuration")
    if os.getenv("ARBOR_COMPLETION_ONBOARDING", "false") not in ("true", "false"):
        raise RuntimeError("Completion onboarding fixture must be explicitly true or false")
    return owner.lower()


OWNER = require_local_configuration()

from e2e_monthly_app import app  # noqa: E402 - guarded imports are deliberate.
from app import auth, database  # noqa: E402
from app.schemas.profile_v2 import ProfileV2Create  # noqa: E402
from app.services.profile_v2 import profile_v2_row, restore_profile_v2  # noqa: E402

profile_rows = {}
profile_lock = RLock()
if os.getenv("ARBOR_COMPLETION_ONBOARDING") != "true":
    profile_rows[OWNER] = profile_v2_row(ProfileV2Create(
        strategy_engine_version="2.0", full_name="Alex", country="Philippines", currency="PHP",
        emergency_savings="three_to_six_months", high_interest_debt="none", goal_target=None,
        current_portfolio_value=0, monthly_investment=10000, horizon="ten_plus_years",
        risk_response="continue_investing", selected_approach="Aggressive",
    ), OWNER)


def verified_fixture_owner(authorization: str | None = Header(default=None)):
    # Invoke normal signature/issuer/audience/expiry validation; never decode an
    # unsigned token or trust a client-supplied owner header.
    user_id = auth.get_current_user_id(authorization)
    if user_id != OWNER:
        raise HTTPException(403, "Dedicated disposable fixture account required")
    return user_id


class LocalProfileQuery:
    def __init__(self, owner):
        self.owner = owner
        self.owner_filter = None
        self.expected_inputs = None
        self.operation = "read"
        self.payload = None

    def select(self, columns):
        if columns not in ("*", "strategy_engine_version"):
            raise RuntimeError("Unsupported fixture profile selection")
        return self

    def eq(self, field, value):
        if field == "user_id":
            if value != self.owner:
                raise HTTPException(403, "Fixture owner isolation")
            self.owner_filter = value
        elif field == "v2_inputs":
            self.expected_inputs = json.loads(value) if isinstance(value, str) else deepcopy(value)
        else:
            raise RuntimeError("Unsupported fixture profile filter")
        return self

    def limit(self, count):
        if count != 1:
            raise RuntimeError("Fixture profiles are owner-scoped")
        return self

    def insert(self, payload):
        if payload.get("user_id") != self.owner:
            raise HTTPException(403, "Fixture owner isolation")
        self.payload, self.operation = deepcopy(payload), "insert"
        return self

    def update(self, payload):
        if "user_id" in payload:
            raise HTTPException(403, "Fixture owner cannot be reassigned")
        self.payload, self.operation = deepcopy(payload), "update"
        return self

    def execute(self):
        with profile_lock:
            if self.operation != "insert" and self.owner_filter != self.owner:
                raise HTTPException(403, "Fixture profile requires owner filter")
            if self.operation == "insert":
                if self.owner in profile_rows:
                    raise RuntimeError("Fixture profile already exists")
                restore_profile_v2(self.payload)
                profile_rows[self.owner] = deepcopy(self.payload)
            elif self.operation == "update":
                previous = profile_rows.get(self.owner)
                if previous is None or self.expected_inputs is None:
                    raise RuntimeError("Fixture profile update requires compare-and-swap")
                if previous["v2_inputs"] != self.expected_inputs:
                    return SimpleNamespace(data=[])
                proposed = {**previous, **deepcopy(self.payload)}
                restore_profile_v2(proposed)
                profile_rows[self.owner] = proposed
            row = profile_rows.get(self.owner)
            return SimpleNamespace(data=[deepcopy(row)] if row is not None else [])


class LocalProfileClient:
    def __init__(self, token):
        self.owner = verified_fixture_owner(f"Bearer {token}")

    def table(self, table):
        if table != "profiles":
            raise RuntimeError("Hosted tables are disabled in the completion fixture")
        return LocalProfileQuery(self.owner)

    def rpc(self, *_args, **_kwargs):
        raise RuntimeError("Hosted RPCs are disabled in the completion fixture")


class DisabledHostedClient:
    def __getattr__(self, _name):
        raise RuntimeError("Hosted database access is disabled in the completion fixture")


# Redirect existing imported clients and future imports. Unknown tables/RPCs fail
# closed instead of falling through to Supabase. JWT validation still uses JWKS.
original_client = database.get_authenticated_client
original_shared_client = database.supabase
disabled_client = DisabledHostedClient()
for module_name, module in tuple(sys.modules.items()):
    if module_name == "app.database" or module_name.startswith("app."):
        if vars(module).get("get_authenticated_client") is original_client:
            module.get_authenticated_client = LocalProfileClient
        if vars(module).get("supabase") is original_shared_client:
            module.supabase = disabled_client

app.dependency_overrides[auth.get_current_user_id] = verified_fixture_owner


@app.middleware("http")
async def completion_fixture_marker(request, call_next):
    response = await call_next(request)
    response.headers["X-Arbor-Completion-Fixture"] = "isolated"
    return response
