from textwrap import dedent


def ownership_response(
    ticker,
    role,
    why_owned,
    risk,
    horizon,
):

    return dedent(f"""
🌳
Arbor
AI Investment Companion


## Why you own {ticker}

{ticker} is included in your portfolio as a **{role}**.

Arbor's strategy:

{why_owned}


This investment fits your:

- Risk profile: {risk}
- Investment horizon: {horizon} years


Arbor focuses on owning investments with a clear purpose rather than simply collecting assets.

Each holding should have a specific role in helping you achieve long-term wealth.
""")