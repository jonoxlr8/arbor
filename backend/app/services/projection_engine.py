def calculate_projection(
    current_value,
    monthly_investment,
    years,
    annual_return=0.08
):

    monthly_rate = annual_return / 12
    months = years * 12

    future_value = (
        current_value * (1 + monthly_rate) ** months
        +
        monthly_investment *
        (((1 + monthly_rate) ** months - 1) / monthly_rate)
    )

    return {
        "starting_value": current_value,
        "monthly_contribution": monthly_investment,
        "investment_period_years": years,
        "assumed_return": annual_return,
        "projected_value": round(future_value, 2)
    }