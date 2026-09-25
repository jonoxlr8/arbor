"""Owner-scoped monthly planning and explicit investment-choice persistence."""
import json
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from pydantic import BeforeValidator, Field, StringConstraints, field_validator, model_validator

from app.auth import get_current_user_id
from app.config import live_portfolio_enabled
from app.database import get_authenticated_client
from app.routes.profiles import get_my_profile
from app.schemas.validation import reject_blank_or_boolean
from app.services.arbor.v2_context import build_v2_context
from app.services.contributions.models import CurrentPortfolio
from app.services.entitlements import require_feature
from app.services.implementation.choices import PROVIDER_IDS, validate_active_choices, validate_implementation_choices
from app.services.monthly_plan import calculate_monthly_plan, empty_current
from app.services.profile_v2 import restore_profile_v2
from app.services.strategy_v2 import AssetRole, DomainModel

router = APIRouter(prefix="/v2", tags=["Monthly investing"])
Amount = Annotated[Decimal, BeforeValidator(reject_blank_or_boolean),
                   Field(ge=0, lt=Decimal("1000000000000"), max_digits=14, decimal_places=2, allow_inf_nan=False)]


class MonthlyPlanInput(DomainModel):
    contribution_amount: Amount | None = None
    manual_current: CurrentPortfolio | None = None
    confirm_empty: Annotated[bool, Field(strict=True)] = False

    @model_validator(mode="after")
    def one_current_source(self):
        if self.manual_current is not None and self.confirm_empty:
            raise ValueError("Use one current portfolio input")
        if self.manual_current is not None:
            if self.manual_current.currency != "PHP":
                raise ValueError("Enter current values in PHP")
            if self.manual_current.owned_product_ids - PROVIDER_IDS.keys():
                raise ValueError("Only supported recorded products determine ownership")
            for role in AssetRole:
                value = self.manual_current.value(role)
                if value >= Decimal("1000000000000") or value.as_tuple().exponent < -2:
                    raise ValueError("Enter bounded PHP values with at most two decimal places")
        return self


class ImplementationChoicesInput(DomainModel):
    expected_revision: Annotated[str, StringConstraints(pattern=r"^[a-f0-9]{64}$")]
    choices: dict[AssetRole, str]

    @field_validator("choices")
    @classmethod
    def supported_choices(cls, value):
        return validate_implementation_choices(value)


def owner_monthly_plan(user_id, authorization, request=None, saved=None):
    require_feature(user_id, "monthly_contribution_planner")
    request = request or MonthlyPlanInput()
    saved = saved or get_my_profile(user_id=user_id, authorization=authorization)
    try:
        context = build_v2_context(saved)
        # Higher-priority readiness/path rules need no market reads.
        if not context.contributions_allowed or context.path != "long_term" or context.plan_basis != "user_selected":
            return calculate_monthly_plan(saved, empty_current(), request.contribution_amount, "confirmed_empty")
        if live_portfolio_enabled():
            if request.manual_current is not None or request.confirm_empty:
                raise HTTPException(422, "Arbor uses your recorded portfolio while tracking is available. Manual current-value overrides are not accepted.")
            from app.routes.live_portfolio import load_portfolio
            from app.services.live_portfolio import current_values
            portfolio, _ = load_portfolio(user_id, authorization, saved)
            current = current_values(portfolio) if portfolio.holdings else empty_current()
            source = "recorded_portfolio"
        elif request.manual_current is not None:
            current, source = request.manual_current, "manual_values"
        elif request.confirm_empty:
            current, source = empty_current(), "confirmed_empty"
        else:
            raise HTTPException(409, "Open Invest this month on Home and enter current values, or confirm that you have no investments yet.")
        return calculate_monthly_plan(saved, current, request.contribution_amount, source)
    except (ValueError, KeyError, TypeError):
        raise HTTPException(409, "Refresh your complete portfolio and review your saved plan before calculating this month’s contribution.") from None


@router.get("/monthly-plan")
def read_monthly_plan(response: Response, user_id: str = Depends(get_current_user_id),
                      authorization: str | None = Header(default=None)):
    response.headers["Cache-Control"] = "private, no-store"
    return owner_monthly_plan(user_id, authorization).model_dump(mode="json")


@router.post("/monthly-plan")
def preview_monthly_plan(request: MonthlyPlanInput, response: Response,
                         user_id: str = Depends(get_current_user_id), authorization: str | None = Header(default=None)):
    response.headers["Cache-Control"] = "private, no-store"
    return owner_monthly_plan(user_id, authorization, request).model_dump(mode="json")


@router.put("/implementation-choices")
def save_implementation_choices(request: ImplementationChoicesInput, response: Response,
                                user_id: str = Depends(get_current_user_id), authorization: str | None = Header(default=None)):
    require_feature(user_id, "basic_implementation")
    response.headers["Cache-Control"] = "private, no-store"
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Sign in to save your investment choices.")
    try:
        client = get_authenticated_client(authorization.split(" ", 1)[1])
        result = client.table("profiles").select("*").eq("user_id", user_id).limit(1).execute()
        if not result.data:
            raise HTTPException(404, "Create your plan before choosing investments.")
        original = result.data[0]
        if original.get("strategy_engine_version") != "2.0":
            raise HTTPException(409, "Choose investments from a saved V2 plan.")
        saved = restore_profile_v2(original)
        if saved["revision"] != request.expected_revision:
            raise HTTPException(409, "Your plan changed. Reload it before saving investment choices.")
        context = build_v2_context(saved)
        if context.plan_basis != "user_selected":
            raise HTTPException(409, "Choose and confirm your own approach first.")
        choices = validate_implementation_choices(request.choices)
        # A plan edit may leave prior choices dormant. Retaining those exact
        # saved choices is not a new selection for a zero-target sleeve.
        # Newly chosen/changed products still require an active target.
        previous = saved["profile"].get("implementation_choices", {})
        changed = {role: product for role, product in choices.items() if previous.get(role) != product}
        validate_active_choices(changed, context.target)
        inputs = {**original["v2_inputs"], "implementation_choices": {role.value: product for role, product in choices.items()}}
        # Normal authenticated client + RLS + owner and revision compare-and-swap.
        proposed = {**original, "v2_inputs": inputs}
        restore_profile_v2(proposed)
        updated = client.table("profiles").update({"v2_inputs": inputs}).eq("user_id", user_id).eq(
            "v2_inputs", json.dumps(original["v2_inputs"])).execute()
        if not updated.data:
            raise HTTPException(409, "Your plan changed. Reload it before saving investment choices.")
        return restore_profile_v2(updated.data[0])
    except HTTPException:
        raise
    except ValueError:
        raise HTTPException(422, "Choose supported investments for the active targets in your plan.") from None
    except Exception:
        raise HTTPException(503, "We couldn’t confirm your investment choices. Reload your plan before retrying.") from None
