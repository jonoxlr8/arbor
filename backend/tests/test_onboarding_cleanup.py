"""Unanswered onboarding values and preserved older profile contracts."""
import pytest
from app.schemas.profile_v2 import ProfileV2Create, ProfileV2Data
from app.services.profile_v2 import profile_v2_row, restore_profile_v2
from app.services.arbor.v2_context import build_v2_context
from app.services.arbor.v2_explanations import explain

BASE = dict(strategy_engine_version="2.0", full_name="Synthetic", country="Philippines", currency="PHP",
            horizon="ten_plus_years", emergency_savings="three_to_six_months", high_interest_debt="none")

@pytest.mark.parametrize("monthly", [None, 0, 500])
@pytest.mark.parametrize("choice", ["Conservative", "Balanced", "Growth", "Aggressive"])
def test_unassessed_explicit_plans_restore(monthly, choice):
    profile = ProfileV2Create(**BASE, selected_approach=choice, monthly_investment=monthly)
    restored = restore_profile_v2(profile_v2_row(profile, "synthetic"))
    assert restored["profile"]["monthly_investment"] == monthly
    assert restored["profile"]["current_portfolio_value"] is None
    assert restored["profile"]["goal_target"] is None
    assert restored["plan"]["selected_strategy"] == choice
    assert restored["plan"]["selection"]["requested_strategy"] is None
    assert restored["plan"]["selection"]["selected_strategy"] is None
    assert restored["plan"]["selection"]["reason"] == "not_assessed"
    context = build_v2_context(restored)
    assert context.assessment is None
    assert "No market-drop reaction" in explain(context, "assessment", "assessment")
    assert "nominal future" not in explain(context, "assumptions", "assumptions") or context.goal is not None
    assert context.monthly_assumption is None if monthly is None else context.monthly_assumption == monthly


def test_no_inferred_plan_and_exploration_allowed():
    ProfileV2Data(**BASE)
    with pytest.raises(ValueError, match="explicitly"):
        ProfileV2Create(**BASE)


def test_short_term_no_fake_assessment():
    profile = ProfileV2Create(**{**BASE, "horizon":"less_than_3_years"}, selected_approach="short_term")
    result = restore_profile_v2(profile_v2_row(profile, "synthetic"))
    assert result["plan"]["path"] == "short_term"
    assert result["plan"]["selection"]["is_short_term"]
    assert result["plan"]["selection"]["requested_strategy"] is None

@pytest.mark.parametrize("monthly", [None, 0, 1234])
def test_budget_save_uses_owner_revision_and_preserves_other_fields(monkeypatch, monthly):
    from types import SimpleNamespace
    from app.routes import profiles
    original = profile_v2_row(ProfileV2Create(**BASE, selected_approach="Growth", risk_response="hold",
        current_portfolio_value=777, goal_target=9000, monthly_investment=100), "synthetic")
    before = restore_profile_v2(original)
    class Query:
        def table(self, table): assert table == "profiles"; return self
        def select(self, columns): return self
        def eq(self, field, val):
            if field == "user_id": assert val == "synthetic"
            return self
        def limit(self, count): return self
        def update(self, values): self.values = values; return self
        def execute(self):
            return SimpleNamespace(data=[{**original, **getattr(self, "values", {})}])
    monkeypatch.setattr(profiles, "get_authenticated_client", lambda _: Query())
    result = profiles.update_monthly_budget(profiles.BudgetUpdate(monthly_investment=monthly,
        expected_revision=before["revision"]), user_id="synthetic", authorization="Bearer synthetic")
    assert result["profile"]["monthly_investment"] == monthly
    for field in ["goal_target", "current_portfolio_value", "risk_response", "selected_approach"]:
        assert result["profile"][field] == before["profile"][field]
    assert result["plan"] == before["plan"]
    assert result["revision"] != before["revision"]
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as stale:
        profiles.update_monthly_budget(profiles.BudgetUpdate(monthly_investment=1, expected_revision="0"*64),
            user_id="synthetic", authorization="Bearer synthetic")
    assert stale.value.status_code == 409
