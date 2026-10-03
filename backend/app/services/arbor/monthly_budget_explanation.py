"""Present the existing monthly-review contract; no arithmetic or target inference."""
from datetime import datetime
from decimal import Decimal


def explain_monthly_budget(review: dict) -> str:
    month = datetime.strptime(review['month'], '%Y-%m').strftime('%B %Y')
    budget = review['budget']
    money = lambda value: f"PHP {Decimal(value):,.2f}"
    if budget['status'] == 'unavailable':
        return f"Your saved monthly target for {month} is unavailable. I won’t infer it from a planning assumption or show an invented remaining amount."
    if budget['status'] == 'unset':
        return f"Your monthly investment budget for {month} is not set. No remaining amount can be shown until you set a target. This is different from a budget explicitly set to zero."
    if budget['status'] == 'incomplete':
        return f"Your remaining amount for {month} is unavailable because some recorded purchases have missing PHP amounts. Your monthly target is {money(budget['target_php'])}; missing amounts are not zero."
    if budget['status'] == 'reached':
        lead = f"Target reached for {month}."
        if budget['target_php'] == '0.00':
            lead += " Your monthly target is explicitly PHP 0.00."
        if review['missing_amount_count']:
            lead += (" Some recorded purchases have missing PHP amounts." if budget['target_php'] == '0.00' else " Known recorded purchases already meet the target; some other PHP amounts are missing.")
    else:
        lead = f"{money(budget['remaining_php'])} left to reach your {month} monthly target."
    records = ("No investment recorded." if review['record_count'] == 0 else
               "Recorded purchases have missing PHP amounts." if review['amount_php'] is None else
               f"{money(review['amount_php'])} in {'known ' if review['missing_amount_count'] else ''}recorded purchases toward your {money(budget['target_php'])} target.")
    return lead + " " + records + " Uses active dated purchases in the Philippine calendar; opening positions, check-ins and investment gain are separate. This does not mean you did or did not invest outside Arbor, and is not an instruction to invest."
