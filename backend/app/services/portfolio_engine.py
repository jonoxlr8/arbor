from app.database import supabase
from fastapi import HTTPException
from app.services.plan_contract import validate_targets, PLAN_UNAVAILABLE


def get_portfolio_recommendation(risk_level):
    try:
        response = supabase.table("portfolio_assets").select("*").eq("risk_level", risk_level).execute()
    except Exception:
        raise HTTPException(503, PLAN_UNAVAILABLE) from None

    portfolio = []

    for asset in validate_targets(response.data):
        portfolio.append({
            "ticker": asset["ticker"],
            "asset_name": asset["asset_name"],
            "asset_type": asset.get("asset_type", "ETF"),
            "allocation": asset["allocation"],
        })

    return portfolio
