def format_currency(amount, currency="USD"):
    symbols = {
        "USD": "$",
        "PHP": "₱",
        "NZD": "NZ$",
        "AUD": "A$",
        "CAD": "C$",
        "GBP": "£",
        "EUR": "€",
    }

    currency = (currency or "USD").strip().upper()

    symbol = symbols.get(
        currency,
        currency + " ",
    )

    return f"{symbol}{amount:,.0f}"
