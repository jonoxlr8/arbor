from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import configured_cors_origins
from app.routes.profiles import router as profiles_router
from app.routes import chat
from app.routes.holdings import router as holdings_router
from app.routes.contributions import router as contributions_router
from app.routes.account import router as account_router
from app.routes.live_portfolio import router as live_portfolio_router
from app.routes.monthly_checkin import router as monthly_checkin_router
from app.routes.monthly_plan import router as monthly_plan_router

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=configured_cors_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(profiles_router)
app.include_router(chat.router)
app.include_router(holdings_router)
app.include_router(contributions_router)
app.include_router(account_router)
app.include_router(live_portfolio_router)
app.include_router(monthly_checkin_router)
app.include_router(monthly_plan_router)


@app.get("/")
def root():
    return {"app": "Arbor", "version": "0.1.0", "status": "online"}
