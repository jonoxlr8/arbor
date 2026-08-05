from textwrap import dedent

from app.services.arbor.comparison import compare_assets
from app.services.arbor.knowledge.service import get_asset_field
from app.services.arbor.knowledge.formatter import format_asset_summary


def comparison_response(left, right, risk, horizon):

    comparison = compare_assets(left, right)

    if not comparison:
        return "I couldn't compare those investments."

    left_asset = comparison["left"]
    right_asset = comparison["right"]

    return dedent(f"""
Comparing {left_asset["ticker"]} and {right_asset["ticker"]}.

{format_asset_summary(left)}

{format_asset_summary(right)}

Based on your {risk.lower()} risk profile and {horizon}-year investment horizon:

• {left_asset["ticker"]} serves as a **{get_asset_field(left, "role")}** because it {get_asset_field(left, "summary").lower()}

• {right_asset["ticker"]} serves as a **{get_asset_field(right, "role")}** because it {get_asset_field(right, "summary").lower()}
""")
