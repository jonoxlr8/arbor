def calculate_projection(
    current_value,
    monthly_investment,
    years,
    annual_return=0.08
):

    monthly_rate = annual_return / 12
    months = years * 12

    yearly_projection = []

    for year in range(years + 1):

        current_month = year * 12

        value = (
            current_value * (1 + monthly_rate) ** current_month
            +
            monthly_investment *
            (((1 + monthly_rate) ** current_month - 1) / monthly_rate)
            if current_month > 0
            else current_value
        )

        yearly_projection.append({
            "year": year,
            "value": round(value, 2)
        })

    future_value = yearly_projection[-1]["value"]

    return {
        "starting_value": current_value,
        "monthly_contribution": monthly_investment,
        "investment_period_years": years,
        "assumed_return": annual_return,
        "projected_value": future_value,
        "yearly_projection": yearly_projection,
    }