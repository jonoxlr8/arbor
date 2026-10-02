"""Two requested fields plus a retry key; ownership comes from the session."""
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


def request_text(value: str) -> str:
    if not isinstance(value, str):
        raise ValueError("Enter a name")
    value = " ".join(value.split())
    if any(ord(char) < 32 or ord(char) == 127 for char in value):
        raise ValueError("Use ordinary text")
    return value


class InvestmentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    investment_name: str = Field(min_length=1, max_length=120)
    provider: str = Field(min_length=1, max_length=80)
    idempotency_key: UUID

    @field_validator("investment_name", "provider", mode="before")
    @classmethod
    def normalize_text(cls, value):
        return request_text(value)


class InvestmentRequestReceipt(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID
    investment_name: str = Field(min_length=1, max_length=120)
    provider: str = Field(min_length=1, max_length=80)
    received_at: datetime
    status: Literal["received", "already_received"]

    @field_validator("received_at")
    @classmethod
    def aware_date(cls, value):
        if value.tzinfo is None:
            raise ValueError("Missing timezone")
        return value
