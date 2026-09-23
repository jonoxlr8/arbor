from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import ValidationError

from app.auth import get_current_user_id
from app.database import get_authenticated_client
from app.schemas.profile import ProfileCreate
from app.schemas.profile_v2 import ProfileV2Create
from app.services.profile_v2 import profile_v2_row, restore_profile_v2
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


@router.put("/v2/profiles/approach")
def choose_approach(profile: ProfileV2Create, user_id: str = Depends(get_current_user_id),
                    authorization: str | None = Header(default=None)):
    """Explicit owner-scoped selection only; never edit answers or migrate a v1 row."""
    saved = get_my_profile(user_id=user_id, authorization=authorization)
    if saved.get("strategy_engine_version") != "2.0":
        raise HTTPException(409, "This action is only available for an existing V2 plan.")
    if profile.selected_approach is None:
        raise HTTPException(422, "Choose an approach before saving.")
    original = ProfileV2Create.model_validate(saved["profile"])
    # Ignore submitted financial answers on this endpoint; use the canonical saved profile.
    try:
        selected = ProfileV2Create.model_validate({**original.model_dump(),
                                                  "selected_approach": profile.selected_approach})
    except ValidationError:
        raise HTTPException(422, "Choose an approach for your saved planning horizon.") from None
    try:
        row = profile_v2_row(selected, user_id)
        client = get_authenticated_client(authorization.split(" ", 1)[1])
        result = client.table("profiles").update({"v2_inputs": row["v2_inputs"]}).eq("user_id", user_id).execute()
        if not result.data:
            raise ValueError()
    except Exception:
        raise HTTPException(503, "We couldn’t confirm your selection. Reload your plan before retrying.") from None
    return get_my_profile(user_id=user_id, authorization=authorization)
