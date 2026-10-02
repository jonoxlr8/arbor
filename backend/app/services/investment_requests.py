"""Owner-session request storage; no financial records, notifications or admin key."""
from fastapi import HTTPException

from app.database import get_authenticated_client
from app.schemas.investment_requests import InvestmentRequest, InvestmentRequestReceipt


def submit_investment_request(authorization: str | None, request: InvestmentRequest):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Sign in to send a request.")
    try:
        # Forward the verified JWT. The database derives ownership from auth.uid().
        client = get_authenticated_client(authorization.split(" ", 1)[1])
        data = client.rpc("arbor_request_investment_v1", {
            "p_investment_name": request.investment_name,
            "p_provider": request.provider,
            "p_idempotency_key": str(request.idempotency_key),
        }).execute().data
        receipt = InvestmentRequestReceipt.model_validate(data)
        if (receipt.investment_name.lower() != request.investment_name.lower()
                or receipt.provider.lower() != request.provider.lower()):
            raise ValueError("Unexpected receipt")
        return receipt
    except Exception as error:
        code = getattr(error, "code", "")
        if code == "PT409":
            raise HTTPException(409, "This request changed. Review the names and send it again.") from None
        if code == "PT429":
            raise HTTPException(429, "You’ve sent several requests today. Please try again tomorrow.") from None
        if code in ("PT401", "PT403"):
            raise HTTPException(403, "Sign in to an active account to send a request.") from None
        raise HTTPException(503, "We couldn’t confirm your request. Retry to check; it won’t be counted twice.") from None
