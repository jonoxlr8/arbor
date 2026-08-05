from textwrap import dedent

from app.services.arbor.exposure import (
    get_asset_exposure,
    indirect_exposure_message,
)


def technology_response(
    risk,
    horizon,
    plan=None,
):

    qqqm_exposure = get_asset_exposure(plan, "qqqm")

    if qqqm_exposure["has_direct"]:

        exposure_message = dedent(f"""
Your portfolio already has QQQM exposure with approximately {qqqm_exposure["allocation"]}% allocation.

Because QQQM already provides concentrated exposure to large technology companies, adding more technology exposure should be considered carefully to avoid excessive concentration.
""")

    else:

        exposure_message = indirect_exposure_message(
            "technology companies through Nasdaq-100 investments"
        )

    return dedent(f"""
Based on your {risk.lower()} risk profile and {horizon}-year investment horizon, Arbor recognizes technology as a major long-term growth theme.

{exposure_message}

Technology companies are driving major trends including:

- Artificial intelligence
- Cloud computing
- Software innovation
- Automation
- Digital transformation

Technology investments can provide strong long-term growth potential, but they may experience higher volatility because valuations are often influenced by interest rates, innovation cycles, and market expectations.

Arbor views technology exposure as a long-term growth opportunity while maintaining balance through diversification.

The goal is not to predict the next winning company, but to participate in long-term technological progress with a disciplined strategy.
""")
