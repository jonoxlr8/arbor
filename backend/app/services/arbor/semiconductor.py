from textwrap import dedent

from app.services.arbor.exposure import (
    get_asset_exposure,
    indirect_exposure_message,
)


def semiconductor_response(
    risk,
    horizon,
    plan=None,
):

    exposure = get_asset_exposure(plan, "nvda")

    if exposure["has_direct"]:

        exposure_message = exposure["message"]

    else:

        exposure_message = indirect_exposure_message(
            "Nvidia through semiconductor ETFs such as SMH"
        )

    return dedent(f"""
Based on your {risk.lower()} risk profile and {horizon}-year investment horizon, Arbor recognizes semiconductors as a key growth sector.

{exposure_message}

Semiconductors power many of the technologies shaping the future, including:

- Artificial intelligence
- Cloud computing
- Data centers
- Autonomous vehicles
- Advanced computing

Investing in semiconductor companies can provide strong growth potential, but the sector can also experience higher volatility because it depends on technology cycles, demand, and global supply chains.

Arbor views semiconductor exposure as a long-term growth opportunity, but it should be balanced with broader investments to manage concentration risk.

The goal is not to predict short-term winners, but to participate in long-term technological progress while staying disciplined.
""")
