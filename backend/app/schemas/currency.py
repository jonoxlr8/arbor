"""Supported recorded units. Normalization does not convert monetary values."""
from typing import Annotated
from pydantic import BeforeValidator

SUPPORTED_CURRENCIES = {"PHP", "USD", "NZD", "AUD", "EUR", "GBP", "CAD"}


def normalize_currency(value):
    code = value.strip().upper() if isinstance(value, str) else ""
    return code if code in SUPPORTED_CURRENCIES else None


def validate_currency(value):
    code = normalize_currency(value)
    if code is None:
        raise ValueError("Choose a supported currency: PHP, USD, NZD, AUD, EUR, GBP or CAD")
    return code


Currency = Annotated[str, BeforeValidator(validate_currency)]
