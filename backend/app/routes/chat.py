from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field, ConfigDict, field_validator
from app.services.ask_arbor import ask_arbor
from app.services.arbor.v2_explanations import explain_v2
from app.auth import get_current_user_id
from app.routes.profiles import get_my_profile

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

    # Reuse the authenticated canonical plan path. Client-supplied plans are rejected.
    try:
        plan = get_my_profile(user_id=user_id, authorization=authorization)
    except HTTPException as exc:
        if exc.status_code == 404:
            raise HTTPException(404, "Create your Arbor plan first, then return to Ask Arbor.") from None
        raise
    if plan.get("strategy_engine_version") == "2.0":
        try:
            return explain_v2(request.message, plan)
        except (KeyError, ValueError, TypeError):
            raise HTTPException(503, "Your saved plan could not be loaded for this explanation. Please retry.") from None
    if plan.get("strategy_engine_version") not in (None, "1.0"):
        raise HTTPException(409, "This plan version is not supported by Ask Arbor yet.")
    reply = ask_arbor(request.message, plan)

    return {"reply": reply}
