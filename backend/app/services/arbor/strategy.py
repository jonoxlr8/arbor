from textwrap import dedent


def investment_strategy_response(risk, horizon):

    return dedent(f"""
Your investment strategy is focused on long-term wealth creation through disciplined investing.

Based on your {risk.lower()} risk profile and {horizon}-year investment horizon, Arbor follows a growth-oriented approach built around:

- Global diversification through broad market ETFs
- Exposure to innovation and technology trends
- Select allocation to alternative assets like crypto
- Long-term compounding rather than short-term trading

The strategy is designed around three principles:

1. Stay invested
Long-term market participation is more important than predicting short-term movements.

2. Keep investing consistently
Regular contributions allow you to benefit from compound growth.

3. Maintain discipline
A strong investment plan only works if you can follow it through different market cycles.

Arbor's goal is to help you build wealth with a strategy you can understand and stick with.
""")