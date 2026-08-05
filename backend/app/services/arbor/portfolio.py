from app.services.investment_knowledge import INVESTMENTS
from textwrap import dedent


def portfolio_asset_response(asset, risk, horizon):

    info = INVESTMENTS.get(asset["ticker"])

    if not info:
        return None

    return dedent(f"""
With your {risk.lower()} risk profile and {horizon}-year investment horizon,
Arbor allocated {asset["allocation"]}% to {asset["ticker"]} ({info["name"]})
as part of your personalized investment strategy.

{info["reason"]}

What this investment does:

{info["description"]}

Risk to consider:

{info["risk"]}

Together with your other holdings, this investment helps build a diversified
portfolio aligned with your long-term goals.
""")
