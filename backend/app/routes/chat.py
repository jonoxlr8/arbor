from fastapi import APIRouter
from pydantic import BaseModel
from app.services.ask_arbor import ask_arbor

router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    plan: dict | None = None


@router.post("/chat")
def chat(request: ChatRequest):

    reply = ask_arbor(request.message, request.plan)

    return {"reply": reply}
