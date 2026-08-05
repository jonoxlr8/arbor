from app.services.arbor.knowledge.service import get_asset_field


def format_asset_summary(ticker: str) -> str:

    summary = get_asset_field(ticker, "summary")
    risk = get_asset_field(ticker, "risk")
    growth = get_asset_field(ticker, "growth")
    role = get_asset_field(ticker, "role")

    return f"""\
### {ticker}

Summary: {summary}

Risk: {risk}

Growth: {growth}

Role: {role}
"""