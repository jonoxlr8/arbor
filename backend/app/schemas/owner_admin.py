from datetime import datetime
from typing import Literal
from uuid import UUID
from pydantic import BaseModel,ConfigDict,Field,field_validator

class AdminAccess(BaseModel):
    model_config=ConfigDict(extra="forbid")
    allowed:bool=Field(strict=True)

class RequestReview(BaseModel):
    model_config=ConfigDict(extra="forbid")
    id:UUID
    investment_name:str=Field(min_length=1,max_length=120)
    provider:str=Field(min_length=1,max_length=80)
    received_at:datetime
    status:Literal["new","reviewing","resolved"]
    revision:int=Field(ge=0,le=2**53-1,strict=True)
    updated_at:datetime|None
    @field_validator("received_at","updated_at")
    @classmethod
    def timezone_required(cls,value):
        if value is not None and value.tzinfo is None:
            raise ValueError("A dated request needs an explicit timezone")
        return value

class RequestPage(BaseModel):
    model_config=ConfigDict(extra="forbid")
    items:list[RequestReview]=Field(max_length=50)
    has_more:bool=Field(strict=True)
    offset:int=Field(ge=0,le=10000)

class StatusChange(BaseModel):
    model_config=ConfigDict(extra="forbid")
    status:Literal["new","reviewing","resolved"]
    expected_revision:int=Field(ge=0,le=2**53-1,strict=True)
