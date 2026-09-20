from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, field_validator, Field
from app.schemas.currency import Currency

from app.auth import get_current_user_id
from app.database import get_authenticated_client
from app.services.actual_portfolio_service import build_actual_portfolio
from app.services.health_engine import calculate_health_score

router = APIRouter()


class HoldingCreate(BaseModel):
    ticker: str
    asset_name: str
    asset_type: str = "ETF"
    quantity: float = Field(ge=0, allow_inf_nan=False)
    average_cost: float = Field(ge=0, allow_inf_nan=False)
    currency: Currency

    @field_validator("ticker")
    @classmethod
    def normalize_ticker(cls, value):
        if not value.strip():
            raise ValueError("Ticker is required")
        return value.strip().upper()


class HoldingUpdate(HoldingCreate):
    pass


def ensure_unique_ticker(client, user_id, ticker, holding_id=None):
    rows = client.table("holdings").select("id,ticker").eq("user_id", user_id).execute().data
    # Legacy duplicates remain editable when this row's identity is unchanged.
    if holding_id is not None and any(row.get("id") == holding_id and str(row.get("ticker", "")).strip().upper() == ticker for row in rows):
        return
    for row in rows:
        if row.get("id") != holding_id and str(row.get("ticker", "")).strip().upper() == ticker:
            raise HTTPException(status_code=409, detail=f"{ticker} already exists. Please edit the existing holding instead.")


def get_access_token(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Missing authorization token",
        )

    return authorization.split(" ", 1)[1]


@router.get("/holdings")
def get_my_holdings(
    user_id: str = Depends(get_current_user_id),
    authorization: str | None = Header(default=None),
):
    access_token = get_access_token(authorization)

    authenticated_supabase = get_authenticated_client(access_token)

    response = (
        authenticated_supabase.table("holdings")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=False)
        .execute()
    )

    return {
        "holdings": response.data,
    }


@router.get("/holdings/health")
def get_actual_portfolio_health(
    user_id: str = Depends(get_current_user_id),
    authorization: str | None = Header(default=None),
):
    access_token = get_access_token(authorization)

    authenticated_supabase = get_authenticated_client(access_token)

    profile_response = (
        authenticated_supabase.table("profiles")
        .select("*")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )

    if not profile_response.data:
        raise HTTPException(
            status_code=404,
            detail="Profile not found",
        )

    if profile_response.data[0].get("strategy_engine_version") not in (None, "1.0"):
        return {"basis": "cost_basis", "currency": None, "available": False,
                "reason": "Portfolio Health is not available for this plan version yet.", "health": None}

    holdings_response = (
        authenticated_supabase.table("holdings")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=False)
        .execute()
    )

    actual_portfolio = build_actual_portfolio(holdings_response.data)

    response = {
        "basis": "cost_basis",
        "currency": actual_portfolio["currency"],
    }

    if actual_portfolio["unavailable_reason"]:
        return {
            **response,
            "available": False,
            "reason": actual_portfolio["unavailable_reason"],
            "health": None,
        }

    saved_profile = profile_response.data[0]
    profile = {
        **saved_profile,
        "risk_level": saved_profile.get("risk_level")
        or saved_profile.get("risk_tolerance", ""),
    }

    health = calculate_health_score(
        {
            "portfolio": actual_portfolio["portfolio"],
            "profile": profile,
        }
    )

    return {
        **response,
        "available": True,
        "health": health,
    }


@router.post("/holdings")
def create_holding(
    holding: HoldingCreate,
    user_id: str = Depends(get_current_user_id),
    authorization: str | None = Header(default=None),
):
    access_token = get_access_token(authorization)

    if holding.quantity < 0:
        raise HTTPException(
            status_code=400,
            detail="Quantity cannot be negative",
        )

    if holding.average_cost < 0:
        raise HTTPException(
            status_code=400,
            detail="Average cost cannot be negative",
        )

    authenticated_supabase = get_authenticated_client(access_token)

    data = {
        **holding.model_dump(),
        "user_id": user_id,
    }
    ensure_unique_ticker(authenticated_supabase, user_id, holding.ticker)

    response = authenticated_supabase.table("holdings").insert(data).execute()

    if not response.data:
        raise HTTPException(
            status_code=400,
            detail="Failed to create holding",
        )

    return {
        "message": "Holding created successfully",
        "holding": response.data[0],
    }


@router.put("/holdings/{holding_id}")
def update_holding(
    holding_id: int,
    holding: HoldingUpdate,
    user_id: str = Depends(get_current_user_id),
    authorization: str | None = Header(default=None),
):
    access_token = get_access_token(authorization)

    if holding.quantity < 0:
        raise HTTPException(
            status_code=400,
            detail="Quantity cannot be negative",
        )

    if holding.average_cost < 0:
        raise HTTPException(
            status_code=400,
            detail="Average cost cannot be negative",
        )

    authenticated_supabase = get_authenticated_client(access_token)

    ensure_unique_ticker(authenticated_supabase, user_id, holding.ticker, holding_id)
    response = (
        authenticated_supabase.table("holdings")
        .update(holding.model_dump())
        .eq("id", holding_id)
        .eq("user_id", user_id)
        .execute()
    )

    if not response.data:
        raise HTTPException(
            status_code=404,
            detail="Holding not found",
        )

    return {
        "message": "Holding updated successfully",
        "holding": response.data[0],
    }


@router.delete("/holdings/{holding_id}")
def delete_holding(
    holding_id: int,
    user_id: str = Depends(get_current_user_id),
    authorization: str | None = Header(default=None),
):
    access_token = get_access_token(authorization)

    authenticated_supabase = get_authenticated_client(access_token)

    response = (
        authenticated_supabase.table("holdings")
        .delete()
        .eq("id", holding_id)
        .eq("user_id", user_id)
        .execute()
    )

    if not response.data:
        raise HTTPException(
            status_code=404,
            detail="Holding not found",
        )

    return {
        "message": "Holding deleted successfully",
    }
