from fastapi import APIRouter, Depends, Header

from app.auth import get_current_user_id
from app.schemas.investment_requests import InvestmentRequest, InvestmentRequestReceipt
from app.services.investment_requests import submit_investment_request

router = APIRouter(prefix="/v2/investment-requests", tags=["Investment requests"])


@router.post("", response_model=InvestmentRequestReceipt,
             summary="Request a missing investment for review without adding a holding")
def submit(request: InvestmentRequest, authorization: str | None = Header(default=None),
           owner: str = Depends(get_current_user_id)):
    # Existing verified identity + active-account admission; available without Plus.
    return submit_investment_request(authorization, request)
