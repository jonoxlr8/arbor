"""MVP input limits, mirrored in frontend/lib/profileValidation.ts.

Amounts: up to 1 trillion currency units (room for PHP goals, bounded arithmetic).
Horizon: 1–100 whole years. Nominal annual return: -100%–100%, default 8%.
These are input limits, not promises about achievable investment returns.
"""
from typing import Annotated, Literal, get_args
from pydantic import BeforeValidator, Field

MAX_MONEY = 1_000_000_000_000
MAX_YEARS = 100
MIN_RETURN = -1.0
MAX_RETURN = 1.0
RiskCategory = Literal["Conservative", "Balanced", "Aggressive"]
RISK_CATEGORIES = get_args(RiskCategory)


def reject_blank_or_boolean(value):
    if isinstance(value, bool) or (isinstance(value, str) and not value.strip()):
        raise ValueError("Enter a number, not a blank value or boolean")
    return value


Money = Annotated[float, BeforeValidator(reject_blank_or_boolean),
                  Field(ge=0, le=MAX_MONEY, allow_inf_nan=False)]
Goal = Annotated[float, BeforeValidator(reject_blank_or_boolean),
                 Field(gt=0, le=MAX_MONEY, allow_inf_nan=False)]
Years = Annotated[int, BeforeValidator(reject_blank_or_boolean), Field(ge=1, le=MAX_YEARS)]
AnnualReturn = Annotated[float, BeforeValidator(reject_blank_or_boolean),
                        Field(ge=MIN_RETURN, le=MAX_RETURN, allow_inf_nan=False)]
