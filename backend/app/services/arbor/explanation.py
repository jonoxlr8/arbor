from textwrap import dedent


def explanation_response(risk, horizon, goal):
    return dedent(f"""
Arbor created your portfolio based on your {risk.lower()} risk profile, {horizon}-year investment horizon, and goal of {goal.lower()}.

Your portfolio is designed around five key ideas:

- Broad market growth through ETFs like VOO
- Innovation and technology exposure through QQQM
- Semiconductor growth through SMH
- Alternative asset exposure through Bitcoin and Ethereum
- Simplicity so you can stay invested long term

The goal is not to predict which investment will perform best every year.

Instead, Arbor builds a diversified strategy designed to participate in long-term economic growth while matching your ability to handle market volatility.

Your biggest advantage is time, consistency, and allowing compound growth to work.
""")