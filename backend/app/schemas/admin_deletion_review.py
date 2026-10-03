"""Count-free canonical deletion review projection; never an execution request."""
from datetime import datetime
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

class DeletionHold(BaseModel):
    model_config = ConfigDict(extra="forbid")
    category: Literal['ledger','profile','history','reminders','support','provider_copies']
    reason: Literal['legal_claim','restore_risk','reviewed_obligation']
    review_at: datetime
    end_at: datetime
    @field_validator('review_at','end_at')
    @classmethod
    def timezone_required(cls, value):
        if value.tzinfo is None: raise ValueError('Timezone required')
        return value
    @model_validator(mode='after')
    def ordered(self):
        if self.end_at < self.review_at: raise ValueError('Hold dates out of order')
        return self

class DeletionReview(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: UUID
    requested_at: datetime | None
    request_status: Literal['pending','withdrawn','record_unavailable']
    withdrawn_at: datetime | None
    lifecycle_state: Literal['active','deactivated','deletion_pending','erasing'] | None
    processing_state: Literal['not_started','reviewed','erasing','data_erased','auth_erased','completed']
    holds: list[DeletionHold] = Field(max_length=12)
    verified_at: datetime | None
    completed_at: datetime | None
    receipt_expires_at: datetime | None
    provider_status: Literal['unassessed','pending_copies','confirmed']
    receipt_id: UUID | None
    @field_validator('requested_at','withdrawn_at','verified_at','completed_at','receipt_expires_at')
    @classmethod
    def timezone_required(cls, value):
        if value is not None and value.tzinfo is None: raise ValueError('Timezone required')
        return value
    @model_validator(mode='after')
    def consistent(self):
        if self.request_status == 'withdrawn' and self.withdrawn_at is None: raise ValueError('Withdrawal date required')
        if self.receipt_id is not None and (self.processing_state != 'completed' or self.completed_at is None or self.receipt_expires_at is None or self.provider_status == 'unassessed'):
            raise ValueError('Verified completion required')
        return self

class DeletionPage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: list[DeletionReview] = Field(max_length=50)
    has_more: bool = Field(strict=True)
    offset: int = Field(ge=0, le=10000, strict=True)
