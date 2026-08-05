from textwrap import dedent


def crypto_response(
    risk,
    horizon,
    plan=None,
):
    return dedent(f"""
Based on your {risk.lower()} risk profile and {horizon}-year investment horizon, Arbor included Bitcoin and Ethereum because they provide exposure to digital assets with high long-term growth potential.

Bitcoin is often viewed as digital gold and may act as a long-term store of value.

Ethereum provides exposure to blockchain infrastructure and decentralized applications.

While cryptocurrencies can experience significant short-term volatility, Arbor keeps their allocation measured so they complement your broader ETF portfolio rather than dominate it.

Because your strategy is designed for long-term investing, the focus is on disciplined investing rather than reacting to short-term price movements.
""")
