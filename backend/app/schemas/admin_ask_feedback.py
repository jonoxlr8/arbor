from datetime import datetime
from pydantic import BaseModel,ConfigDict,Field,field_validator
from app.routes.ask_feedback import Reason
from app.services.arbor.answer_presentation import FEEDBACK_INTENTS
class TopicModel(BaseModel):
    model_config=ConfigDict(extra='forbid')
    intent:str
    @field_validator('intent')
    @classmethod
    def topic(cls,v):
        if v not in FEEDBACK_INTENTS:raise ValueError('Unsupported topic')
        return v
class FeedbackRow(TopicModel):
    helpful:bool=Field(strict=True)
    reason:Reason|None
    created_at:datetime
    @field_validator('created_at')
    @classmethod
    def zoned(cls,v):
        if v.tzinfo is None:raise ValueError('Timestamp requires timezone')
        return v
class FeedbackTopic(TopicModel):
    helpful:int=Field(strict=True,ge=0,le=9007199254740991)
    not_helpful:int=Field(strict=True,ge=0,le=9007199254740991)
class FeedbackPage(BaseModel):
    model_config=ConfigDict(extra='forbid')
    items:list[FeedbackRow]=Field(max_length=50)
    topics:list[FeedbackTopic]=Field(max_length=len(FEEDBACK_INTENTS))
    offset:int=Field(strict=True,ge=0,le=10000)
    has_more:bool=Field(strict=True)
    @field_validator('topics')
    @classmethod
    def unique(cls,v):
        if len({t.intent for t in v})!=len(v):raise ValueError('Duplicate topic')
        return v
