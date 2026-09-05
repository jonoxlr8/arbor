from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from app.auth import get_current_user_id
from app.database import get_authenticated_client

router = APIRouter()


class HoldingCreate(BaseModel):
    ticker: str
    asset_name: str
    asset_type: str = "ETF"
    quantity: float
    average_cost: float
    currency: str = "USD"


class HoldingUpdate(BaseModel):
    ticker: str
    asset_name: str
    asset_type: str = "ETF"
    quantity: float
    average_cost: float
    currency: str = "USD"


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
