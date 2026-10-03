"""Explicit, minimal votes only; no chat text, values, cookies or service-role path."""
from typing import Literal
from uuid import UUID
from fastapi import APIRouter,Depends,Header,HTTPException,Response,Request
from pydantic import BaseModel,ConfigDict,Field,field_validator
from app.auth import get_current_user_id
from app.database import get_authenticated_client
from app.services.arbor.answer_presentation import FEEDBACK_INTENTS

router=APIRouter(prefix='/ask/feedback',tags=['Ask feedback'])
Reason=Literal['unclear','not_my_question','numbers_look_wrong','missing_detail']
class Vote(BaseModel):
    model_config=ConfigDict(extra='forbid')
    helpful:bool=Field(strict=True)
    reason:Reason|None=None
    intent:str
    answer_version:Literal['deterministic-ask-1']
    @field_validator('intent')
    @classmethod
    def reviewed_intent(cls,v):
        if v not in FEEDBACK_INTENTS:raise ValueError('Unsupported answer type')
        return v
class Availability(BaseModel):
    model_config=ConfigDict(extra='forbid')
    available:bool=Field(strict=True)
class SavedVote(BaseModel):
    model_config=ConfigDict(extra='forbid')
    saved:Literal[True]
    helpful:bool=Field(strict=True)
    reason:Reason|None

def rpc(authorization,name,params,model):
    if not authorization or not authorization.startswith('Bearer '):raise HTTPException(401,'Sign in again to send feedback.')
    try:
        data=get_authenticated_client(authorization.split(' ',1)[1]).rpc(name,params).execute().data
        return model.model_validate(data)
    except Exception as error:
        code=getattr(error,'code','')
        if name=='arbor_ask_feedback_access_v1' and code in ('PGRST202','42883'):return Availability(available=False)
        status={'PT401':401,'PT403':403,'PT409':409,'PT422':422,'PT429':429}.get(code,503)
        raise HTTPException(status,'Feedback could not be saved. Your Ask answer stays available.')from None

@router.get('/access',response_model=Availability)
def access(request:Request,response:Response,owner=Depends(get_current_user_id),authorization:str|None=Header(default=None)):
    if request.query_params:raise HTTPException(422,'Feedback does not accept account selectors.')
    response.headers['Cache-Control']='private, no-store'
    return rpc(authorization,'arbor_ask_feedback_access_v1',{},Availability)
@router.put('/{id}',response_model=SavedVote)
def save(id:UUID,vote:Vote,request:Request,response:Response,owner=Depends(get_current_user_id),authorization:str|None=Header(default=None)):
    if request.query_params:raise HTTPException(422,'Feedback does not accept account selectors.')
    response.headers['Cache-Control']='private, no-store'
    return rpc(authorization,'arbor_ask_feedback_save_v1',{'p_id':str(id),'p_helpful':vote.helpful,'p_reason':vote.reason,'p_intent':vote.intent,'p_answer_version':vote.answer_version},SavedVote)
