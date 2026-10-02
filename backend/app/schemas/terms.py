"""Affirmative Terms requests; timestamps/owners are never client supplied."""
from pydantic import BaseModel,ConfigDict,Field,StrictBool
class TermsAcceptance(BaseModel):
    model_config=ConfigDict(extra='forbid')
    version:str=Field(pattern=r'^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$')
    digest:str=Field(pattern=r'^[0-9a-f]{64}$')
    confirm:StrictBool
class TermsSignupIntent(TermsAcceptance):
    email:str=Field(min_length=3,max_length=254,pattern=r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
