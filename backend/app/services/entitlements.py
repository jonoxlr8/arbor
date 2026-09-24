"""Server-owned beta access policy. No payment, profile or investment authority."""
import os
from typing import Literal

from fastapi import Depends, HTTPException
from pydantic import Field
from app.auth import get_current_user_id
from app.services.strategy_v2 import DomainModel

Feature = Literal["plan_creation", "basic_projection", "basic_implementation", "ask_arbor_basic",
                  "next_action", "ask_arbor_full", "monthly_contribution_planner", "profile_rebuild", "live_portfolio", "plan_alignment"]
FREE_FEATURES: tuple[Feature, ...] = ("plan_creation", "basic_projection", "basic_implementation", "ask_arbor_basic", "next_action")
PLUS_FEATURES: tuple[Feature, ...] = FREE_FEATURES + ("ask_arbor_full", "monthly_contribution_planner", "profile_rebuild", "live_portfolio", "plan_alignment")


class Entitlements(DomainModel):
    tier: Literal["free", "plus"]
    status: Literal["trial", "active", "expired"]
    effective_tier: Literal["free", "plus"]
    private_beta: bool
    features: tuple[Feature, ...]
    ask_monthly_limit: int | None
    # Fixed exhausted fixture, NOT an alternative production counter. Never public.
    qa_exhausted: bool = Field(default=False, exclude=True)


def resolve_entitlements(tier="plus", status="trial") -> Entitlements:
    effective = "plus" if tier == "plus" and status in ("trial", "active") else "free"
    return Entitlements(tier=tier, status=status, effective_tier=effective,
        private_beta=tier == "plus" and status == "trial",
        features=PLUS_FEATURES if effective == "plus" else FREE_FEATURES,
        ask_monthly_limit=None if effective == "plus" else 10)


def get_entitlements(user_id: str) -> Entitlements:
    # All authenticated accounts currently belong to the private beta. There is
    # deliberately no production Free toggle until durable metering is deployed.
    # QA is explicit, account-scoped, and disabled on deployed Render/Vercel hosts.
    if (os.getenv("APP_ENV") in ("development", "test")
            and not os.getenv("RENDER") and not os.getenv("VERCEL")
            and os.getenv("ARBOR_ENTITLEMENT_QA_ENABLED") == "true"
            and user_id == os.getenv("ARBOR_E2E_USER_ID")):
        mode = os.getenv("ARBOR_ENTITLEMENT_QA_MODE", "plus_trial")
        choices = {"free": ("free", "active"), "plus_trial": ("plus", "trial"),
                   "plus_active": ("plus", "active"), "expired_plus": ("plus", "expired")}
        if mode not in choices:
            raise HTTPException(503, "Account access configuration is unavailable.")
        return resolve_entitlements(*choices[mode]).model_copy(update={
            "qa_exhausted": os.getenv("ARBOR_ENTITLEMENT_QA_ASK_EXHAUSTED") == "true"})
    return resolve_entitlements()


def require_feature(user_id: str, feature: Feature):
    if feature not in get_entitlements(user_id).features:
        raise HTTPException(403, {"code": "plus_required", "feature": feature,
                                 "message": "This capability is part of Arbor Plus. Explore plans in Settings."})


def require_contributions(user_id: str = Depends(get_current_user_id)):
    require_feature(user_id, "monthly_contribution_planner")


def subscription_explanation(entitlements: Entitlements) -> str:
    if entitlements.private_beta:
        return "You’re currently on Arbor Plus — Private Beta. All Plus features are unlocked free while Arbor is in private beta. No credit card or billing date is required."
    if entitlements.effective_tier == "plus":
        return "Your account has Arbor Plus access, including full Ask Arbor, contribution scenarios and profile editing. Investment decisions remain yours."
    return "Your account has Arbor Free access: build and understand your plan, explore implementation options and ask 10 Ask Arbor questions per UTC calendar month. Explore Arbor Plus in Settings."
