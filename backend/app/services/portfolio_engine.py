from app.database import supabase


def get_portfolio_recommendation(risk_level):
    response = (
        supabase
        .table("portfolio_assets")
        .select("*")
        .eq("risk_level", risk_level)
        .execute()
    )

    portfolio = []

    for asset in response.data:
        portfolio.append({
            "ticker": asset["ticker"],
            "asset_name": asset["asset_name"],
            "asset_type": asset["asset_type"],
            "allocation": asset["allocation"],
        })

    return portfolio