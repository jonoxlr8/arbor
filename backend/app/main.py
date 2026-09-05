from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes.profiles import router as profiles_router
from app.routes import chat
from app.routes.holdings import router as holdings_router

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(profiles_router)
app.include_router(chat.router)
app.include_router(holdings_router)


@app.get("/")
def root():
    return {"app": "Arbor", "version": "0.1.0", "status": "online"}
