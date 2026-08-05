from textwrap import dedent


def greeting_response(name: str):
    return dedent(f"""
Hi {name}! 👋 I'm Arbor.

I'm your AI investment companion, here to help you understand your portfolio and make smarter long-term investing decisions.

Based on your current investment plan, I can help explain:

• Why each investment was recommended
• Your portfolio strategy
• Your projected future wealth
• Financial freedom and retirement planning
• Market crashes and portfolio risks
• Ways to improve your investing over time

What would you like to know about your investments today?
""")


def whoami_response():
    return dedent("""
I'm Arbor 🌳, your AI investment companion.

I help you understand your investment portfolio and make better long-term investing decisions.

Using your personal investment plan, I can explain:

• Why each investment was recommended
• How your portfolio is diversified
• Your projected future wealth
• Financial freedom and retirement planning
• Market crashes and investment risks
• Ways to improve your investment strategy
• Portfolio projections and long-term growth

My goal isn't to tell you what to trade today. It's to help you build long-term wealth through disciplined investing.
""")


def thanks_response(name: str):
    return dedent(f"""
You're very welcome, {name}! 🌳

I'm always here whenever you want to better understand your investments, track your progress, or plan your path toward long-term wealth.

Keep investing consistently, stay focused on your long-term goals, and let compound growth do the heavy lifting.

If you have another question, just ask.
""")
