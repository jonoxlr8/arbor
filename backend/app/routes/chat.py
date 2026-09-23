from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field, ConfigDict, field_validator
from app.services.ask_arbor import ask_arbor
from app.services.arbor.v2_explanations import explain_v2, classify_v2_question
from app.auth import get_current_user_id
from app.routes.profiles import get_my_profile
from app.services.entitlements import get_entitlements, subscription_explanation
from app.services.ask_usage import ask_usage, check_quota

router = APIRouter()


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str = Field(min_length=1, max_length=1000)

    @field_validator("message")
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError("Please enter a question")
        return value.strip()


@router.post("/chat")
def chat(request: ChatRequest, user_id: str = Depends(get_current_user_id), authorization: str | None = Header(default=None)):
    entitlements = get_entitlements(user_id)

    # Reuse the authenticated canonical plan path. Client-supplied plans are rejected.
    try:
        plan = get_my_profile(user_id=user_id, authorization=authorization)
    except HTTPException as exc:
        if exc.status_code == 404:
            raise HTTPException(404, "Create your Arbor plan first, then return to Ask Arbor.") from None
        raise
    check_quota(ask_usage(entitlements, authorization))
    if plan.get("strategy_engine_version") == "2.0":
        try:
            result = explain_v2(request.message, plan, entitlements).model_dump()
        except (KeyError, ValueError, TypeError):
            raise HTTPException(503, "Your saved plan could not be loaded for this explanation. Please retry.") from None
    elif plan.get("strategy_engine_version") not in (None, "1.0"):
        raise HTTPException(409, "This plan version is not supported by Ask Arbor yet.")
    elif classify_v2_question(request.message)[1] == "plus":
        result = {"reply": subscription_explanation(entitlements), "category": "product_support", "intent": "plus"}
    else:
        result = {"reply": ask_arbor(request.message, plan)}
    if not isinstance(result.get("reply"), str) or not result["reply"].strip():
        raise HTTPException(503, "We couldn’t explain your plan. Please retry.")
    # Compute first; atomically admit only successful responses. Racing requests
    # can calculate concurrently, but at most ten are admitted per UTC month.
    usage = ask_usage(entitlements, authorization, consume=True)
    check_quota(usage)
    return {**result, **({"ask_usage": usage} if usage is not None else {})}
