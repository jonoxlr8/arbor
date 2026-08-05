from textwrap import dedent


def buy_more_response(
    ticker,
    allocation,
    target_allocation,
    risk,
    horizon,
):
    if allocation < target_allocation:
        recommendation = (
            f"Your current allocation ({allocation}%) is below your target allocation "
            f"of {target_allocation}%. Adding to {ticker} could help bring your portfolio "
            "back toward its intended allocation."
        )

    elif allocation > target_allocation:
        recommendation = (
            f"Your current allocation ({allocation}%) is above your target allocation "
            f"of {target_allocation}%. Arbor would generally prioritize investing in "
            "other holdings before increasing this position."
        )

    else:
        recommendation = (
            f"Your current allocation ({allocation}%) is aligned with your target allocation "
            f"of {target_allocation}%. Arbor generally recommends continuing your regular investment plan."
        )

    return dedent(f"""
{recommendation}

Whether you should invest more depends on your long-term investment strategy rather than recent market performance.

If your allocation has fallen below your target because of market movements, buying more may help bring your portfolio back into balance.

With your {risk.lower()} risk profile and {horizon}-year investment horizon, Arbor generally recommends investing consistently according to your long-term allocation instead of trying to predict short-term price movements.
""")


def sell_response(
    ticker,
    allocation,
    risk,
    horizon,
):
    return dedent(f"""
Arbor currently has {ticker} as {allocation}% of your portfolio.

Before selling an investment, Arbor recommends reviewing your original strategy:

- Has your investment goal changed?
- Has your risk tolerance changed?
- Has your timeline changed?
- Has this investment become too large compared with your target allocation?

Selling because of short-term market movements can hurt long-term results.

With your {risk.lower()} risk profile and {horizon}-year investment horizon, Arbor generally focuses on maintaining a disciplined long-term strategy rather than reacting to short-term price changes.

If your circumstances or goals have changed, your portfolio allocation can be reviewed and adjusted.
""")


def rebalance_response(
    risk,
    horizon,
):
    return dedent(f"""
Arbor generally recommends reviewing your portfolio periodically rather than making frequent changes.

Rebalancing may be appropriate if:

- One investment has grown significantly larger than its target allocation.
- Your financial goals have changed.
- Your risk tolerance has changed.
- Your investment horizon has changed.

With your {risk.lower()} risk profile and {horizon}-year investment horizon, Arbor recommends staying disciplined and avoiding unnecessary portfolio changes based solely on short-term market movements.

For most long-term investors, reviewing and rebalancing once or twice a year is usually sufficient.
""")
