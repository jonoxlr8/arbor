from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel, Field, ConfigDict, field_validator
from app.services.ask_arbor import ask_arbor
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
    plan = get_my_profile(user_id=user_id, authorization=authorization)
    reply = ask_arbor(request.message, plan)

    return {"reply": reply}
