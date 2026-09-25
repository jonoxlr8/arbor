from fastapi import APIRouter, Depends, Header, HTTPException
import json

from app.auth import get_current_user_id
from app.config import live_portfolio_enabled
from app.database import get_authenticated_client
from app.schemas.profile import ProfileCreate
from app.schemas.profile_v2 import ProfileV2Create, ProfileV2Edit, ProfileV2Answers
from app.services.profile_edit_v2 import prepare_profile_edit
from app.services.profile_v2 import profile_v2_row, restore_profile_v2
from app.services.next_action import NextAction, get_next_action
from app.services.entitlements import get_entitlements, require_feature
from app.schemas.validation import RISK_CATEGORIES
from app.schemas.projection import ProjectionRequest
from app.services.arbor.insights import PortfolioInsights
from app.services.investment_plan_service import build_investment_plan
from app.services.projection_engine import calculate_projection

router = APIRouter()


@router.get("/profiles/me")
def get_my_profile(
    user_id: str = Depends(get_current_user_id),
    authorization: str | None = Header(default=None),
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Missing authorization token",
        )

    access_token = authorization.split(" ", 1)[1]

    authenticated_supabase = get_authenticated_client(access_token)

    response = (
        authenticated_supabase.table("profiles")
        .select("*")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )

    if not response.data:
        raise HTTPException(
            status_code=404,
            detail="Profile not found",
        )

    saved_profile = response.data[0]

    if saved_profile.get("strategy_engine_version") == "2.0":
        try:
            return restore_profile_v2(saved_profile)
        except Exception:
            raise HTTPException(503, "Your saved Arbor plan is temporarily unavailable. Please retry.") from None
    if saved_profile.get("strategy_engine_version") not in (None, "1.0"):
        raise HTTPException(503, "This saved plan version is not supported yet.")

    # Read-only compatibility: preserve the old preference and explicitly show
    # its saved classification. No database write or silent risk migration.
    legacy_growth = saved_profile["risk_tolerance"] == "Growth"
    calculation_risk = saved_profile["risk_tolerance"]
    if legacy_growth:
        calculation_risk = saved_profile.get("risk_level", "Conservative")
        if calculation_risk not in RISK_CATEGORIES:
            calculation_risk = "Conservative"  # Historical Growth fallback.

    profile = ProfileCreate(
        full_name=saved_profile["full_name"],
        country=saved_profile["country"],
        goal_target=saved_profile["goal_target"],
        investment_horizon=saved_profile["investment_horizon"],
        monthly_investment=saved_profile["monthly_investment"],
        current_portfolio_value=saved_profile["current_portfolio_value"],
        risk_tolerance=calculation_risk,
        risk_score=saved_profile.get("risk_score"),
        currency=saved_profile.get("currency", "USD"),
    )

    plan = build_investment_plan(profile)

    return {
        "message": "Profile loaded successfully",
        "profile_warning": (
            f"Your saved Growth preference is no longer supported. This plan shows its "
            f"previous {calculation_risk} classification. Choose a supported risk "
            f"category in Edit Profile to confirm your preference."
            if legacy_growth else None
        ),
        "profile": {
            **plan.profile_data,
            "risk_tolerance": saved_profile["risk_tolerance"],
            "goal_target": plan.profile_data.get("goal_target"),
        },
        "portfolio": plan.portfolio,
        "explanation": plan.explanation,
        "projection": plan.projection,
        "health": plan.health,
    }


@router.put("/profiles/me")
def update_my_profile(
    profile: ProfileCreate,
    user_id: str = Depends(get_current_user_id),
    authorization: str | None = Header(default=None),
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Missing authorization token",
        )

    access_token = authorization.split(" ", 1)[1]

    # Legacy edits must never turn a v2 row into a v1 calculation/persistence path.
    require_feature(user_id, "profile_rebuild")
    client = get_authenticated_client(access_token)
    saved = client.table("profiles").select("strategy_engine_version").eq("user_id", user_id).limit(1).execute()
    if saved.data and saved.data[0].get("strategy_engine_version") not in (None, "1.0"):
        raise HTTPException(409, "This plan cannot be edited through the legacy profile form.")

    plan = build_investment_plan(profile)

    data = {
        **plan.profile_data,
        "user_id": user_id,
    }

    authenticated_supabase = get_authenticated_client(access_token)

    response = (
        authenticated_supabase.table("profiles")
        .update(data)
        .eq("user_id", user_id)
        .execute()
    )

    if not response.data:
        raise HTTPException(
            status_code=404,
            detail="Profile not found",
        )

    return {
        "message": "Profile updated successfully",
        "profile": {
            **response.data[0],
            "goal_target": plan.profile_data.get("goal_target"),
        },
        "portfolio": plan.portfolio,
        "explanation": plan.explanation,
        "projection": plan.projection,
        "health": plan.health,
    }


@router.post("/profiles")
def create_profile(
    profile: ProfileCreate,
    user_id: str = Depends(get_current_user_id),
    authorization: str | None = Header(default=None),
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing authorization token")

    def canonical():
        try:
            return get_my_profile(user_id=user_id, authorization=authorization)
        except HTTPException as error:
            if error.status_code == 404 and error.detail == "Profile not found":
                return None
            raise HTTPException(503, "We couldn’t restore your saved profile. Please retry.") from None
        except Exception:
            raise HTTPException(503, "We couldn’t restore your saved profile. Please retry.") from None

    def recovered(saved):
        # POST never replaces an existing profile, even if retry input differs.
        # The dashboard displays this notice alongside any legacy-profile warning.
        notice = "Your existing saved profile was restored. New onboarding inputs were not applied; use Edit Profile to change them."
        return {**saved, "profile_warning": " ".join(filter(None, [saved.get("profile_warning"), notice]))}

    saved = canonical()
    if saved is not None:
        return recovered(saved)

    plan = build_investment_plan(profile)
    data = {**plan.profile_data, "user_id": user_id}
    uncertain = False
    try:
        client = get_authenticated_client(authorization.split(" ", 1)[1])
        client.table("profiles").insert(data).execute()
    except Exception:
        # A unique conflict or lost database response is NOT proof of success.
        # Only a subsequent owner-scoped canonical read can establish recovery.
        uncertain = True

    saved = canonical()
    if saved is None:
        raise HTTPException(503, "We couldn’t confirm your saved profile. Please retry.")
    return recovered(saved) if uncertain else saved


@router.post("/projection")
def create_projection(request: ProjectionRequest):
    projection = calculate_projection(
        request.current_value,
        request.monthly_investment,
        request.years,
        request.annual_return,
    )
    return projection


@router.post("/v2/profiles")
def create_profile_v2(
    profile: ProfileV2Create,
    user_id: str = Depends(get_current_user_id),
    authorization: str | None = Header(default=None),
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing authorization token")

    def canonical():
        try:
            return get_my_profile(user_id=user_id, authorization=authorization)
        except HTTPException as error:
            if error.status_code == 404 and error.detail == "Profile not found":
                return None
            raise HTTPException(503, "We couldn’t restore your saved profile. Please retry.") from None
        except Exception:
            raise HTTPException(503, "We couldn’t restore your saved profile. Please retry.") from None

    existing = canonical()
    if existing is not None:
        # Includes legacy profiles: never overwrite or silently migrate on retry.
        return {**existing, "profile_warning": "Your existing saved profile was restored. New onboarding answers were not applied."}
    if profile.selected_approach is None:
        raise HTTPException(422, "Review and explicitly select an investment approach before saving.")
    row = profile_v2_row(profile, user_id)
    try:
        restore_profile_v2(row)  # Establish a valid canonical plan before persistence.
    except Exception:
        raise HTTPException(503, "Your Arbor plan is temporarily unavailable. Please retry.") from None
    try:
        client = get_authenticated_client(authorization.split(" ", 1)[1])
        client.table("profiles").insert(row).execute()
    except Exception:
        # Unique conflict or lost response: success requires a canonical read.
        pass
    saved = canonical()
    if saved is None:
        raise HTTPException(503, "We couldn’t confirm your saved profile. Please retry.")
    return saved


@router.post("/v2/approaches")
def explore_approaches(profile: ProfileV2Create, user_id: str = Depends(get_current_user_id)):
    """Assessment and equal, canonical model information; no selection or persistence."""
    from app.services.strategy_v2 import StrategyType, get_base_strategy
    from app.services.strategy_selection_v2 import select_strategy
    assessment = select_strategy(profile.risk_response, profile.horizon)
    return {"assessment": assessment.model_dump(mode="json"),
            "approaches": [{"strategy": strategy.value,
                "allocation": get_base_strategy(strategy).allocation.model_dump(mode="json")["weights"],
                "planning_return_pct": float(get_base_strategy(strategy).planning_annual_rate * 100)}
                for strategy in StrategyType]}


@router.post("/v2/plan-preview")
def preview_new_plan(profile: ProfileV2Create, user_id: str = Depends(get_current_user_id)):
    """Backend-calculated final review before first save; no table access or writes."""
    if profile.selected_approach is None:
        raise HTTPException(422, "Choose an approach before previewing your plan.")
    try:
        return restore_profile_v2(profile_v2_row(profile, user_id))
    except ValueError:
        raise HTTPException(422, "Check your approach and optional Technology and Bitcoin choices.") from None


@router.get("/v2/next-action", response_model=NextAction)
def next_action(user_id: str = Depends(get_current_user_id), authorization: str | None = Header(default=None)):
    """One product action from the authenticated owner's saved plan."""
    try:
        saved = get_my_profile(user_id=user_id, authorization=authorization)
    except HTTPException as error:
        if error.status_code == 404 and error.detail == "Profile not found":
            saved = None
        else:
            raise
    if saved and saved.get("strategy_engine_version") != "2.0":
        raise HTTPException(409, "Next actions are available for V2 plans.")
    try:
        access = get_entitlements(user_id)
        portfolio = None
        if live_portfolio_enabled() and saved and "live_portfolio" in access.features and get_next_action(saved, access).key == "review_monthly_contribution":
            from app.routes.live_portfolio import optional_portfolio
            portfolio = optional_portfolio(user_id, authorization, saved)
        from app.services.monthly_checkin import read_monthly
        monthly = read_monthly(user_id, authorization, saved, access)
        return get_next_action(saved, access, portfolio, monthly)
    except (KeyError, ValueError, TypeError):
        raise HTTPException(503, "Your saved profile could not be checked. Please retry.") from None


@router.put("/v2/profiles/approach")
def choose_approach(profile: ProfileV2Create, user_id: str = Depends(get_current_user_id),
                    authorization: str | None = Header(default=None)):
    """Explicit owner-scoped selection only; never edit answers or migrate a v1 row."""
    saved = get_my_profile(user_id=user_id, authorization=authorization)
    if saved.get("strategy_engine_version") != "2.0":
        raise HTTPException(409, "This action is only available for an existing V2 plan.")
    if profile.selected_approach is None:
        raise HTTPException(422, "Choose an approach before saving.")
    # Compatibility endpoint ignores client financial answers and shares the
    # owner-scoped, stale-write-safe path without dropping historical state.
    customization = ({"explicit_customization": profile.explicit_customization}
                     if profile.explicit_customization is not None else {})
    return _edit_profile_v2(ProfileV2Edit(
        inputs={key:saved["profile"][key] for key in ProfileV2Answers.model_fields},
        proposed_approach=profile.selected_approach, expected_revision=saved["revision"], **customization),
        user_id, authorization, save=True)


def _edit_profile_v2(edit: ProfileV2Edit, user_id: str, authorization: str | None, *, save: bool):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing authorization token")
    require_feature(user_id, "profile_rebuild")
    client = get_authenticated_client(authorization.split(" ", 1)[1])
    try:
        found = client.table("profiles").select("*").eq("user_id", user_id).limit(1).execute()
        if not found.data:
            raise HTTPException(404, "Profile not found")
        original = found.data[0]
        if original.get("strategy_engine_version") != "2.0":
            raise HTTPException(409, "This action requires a V2 investment profile.")
        row, preview = prepare_profile_edit(original, edit, user_id)
        if not save:
            return preview
        # Atomic compare-and-swap on existing JSONB, with owner scoping and normal RLS.
        # Every edit changes the server nonce even if only a shared scalar changed.
        result = client.table("profiles").update({k:v for k,v in row.items() if k != "user_id"}).eq(
            "user_id", user_id).eq("v2_inputs", json.dumps(original["v2_inputs"])).execute()
        if not result.data:
            raise HTTPException(409, "Your profile changed. Reload it and review your edits again.")
        return restore_profile_v2(result.data[0])
    except HTTPException:
        raise
    except RuntimeError as error:
        if str(error) == "stale_profile":
            raise HTTPException(409, "Your profile changed. Reload it and review your edits again.") from None
        raise HTTPException(503, "We couldn’t confirm your changes. Reload your saved plan before retrying.") from None
    except ValueError:
        raise HTTPException(422, "Check your profile answers and selected approach.") from None
    except Exception:
        raise HTTPException(503, "We couldn’t confirm your changes. Reload your saved plan before retrying.") from None


@router.post("/v2/profiles/preview", summary="Preview investment profile changes without saving")
def preview_profile_v2(edit: ProfileV2Edit, user_id: str = Depends(get_current_user_id),
                       authorization: str | None = Header(default=None)):
    return _edit_profile_v2(edit, user_id, authorization, save=False)


@router.put("/v2/profiles/me", summary="Confirm owner-scoped investment profile changes")
def save_profile_v2(edit: ProfileV2Edit, user_id: str = Depends(get_current_user_id),
                    authorization: str | None = Header(default=None)):
    return _edit_profile_v2(edit, user_id, authorization, save=True)
