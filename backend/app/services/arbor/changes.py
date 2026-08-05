from textwrap import dedent


def portfolio_change_response(risk, horizon):
    return dedent(f"""
Based on your {risk.lower()} risk profile and {horizon}-year investment horizon, Arbor designed your portfolio with a long-term approach.

Before making changes, consider:

- Has your financial goal changed?
- Has your risk tolerance changed?
- Has your investment timeline changed?
- Has your portfolio become significantly different from your original allocation?

Short-term market movements alone are usually not a reason to change a long-term investment strategy.

Arbor focuses on maintaining a disciplined plan rather than constantly changing investments based on market emotions.

If your circumstances change, your portfolio can be reviewed and adjusted accordingly.
""")