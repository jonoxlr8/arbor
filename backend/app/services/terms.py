"""Narrow public-intent and verified owner RPCs. No credentials or metadata auth."""
import hashlib,json,re
from datetime import datetime
from fastapi import HTTPException

def document(value):
    if not isinstance(value,dict) or not isinstance(value.get('version'),str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,63}',value['version']) or not re.fullmatch(r'[0-9a-f]{64}',value.get('digest','')):
        raise ValueError('Invalid Terms document')
    text=value.get('document_text')
    if not isinstance(text,str) or len(text.encode())>65536 or hashlib.sha256(text.encode()).hexdigest()!=value['digest']:
        raise ValueError('Document integrity failed')
    body=json.loads(text)
    if not isinstance(body,dict) or set(body)!={'title','introduction','sections'} or any(not isinstance(body[k],str) or len(body[k])>1000 for k in ('title','introduction')) or not isinstance(body['sections'],list) or not 1<=len(body['sections'])<=50:
        raise ValueError('Invalid document shape')
    if any(not isinstance(row,list) or len(row)!=2 or any(not isinstance(s,str) or len(s)>10000 for s in row)for row in body['sections']):
        raise ValueError('Invalid document section')
    return value

def call(name,params,authorization=None):
    from app import database
    if authorization is not None:
        from app.auth import get_verified_user_id
        get_verified_user_id(authorization)
        client=database.get_authenticated_client(authorization.split(' ',1)[1])
    else:client=database.supabase
    try:return client.rpc(name,params).execute().data
    except Exception as error:
        status={'PT400':400,'PT401':401,'PT403':403,'PT409':409,'PT429':429,'55P03':429,'57014':429}.get(getattr(error,'code',''),503)
        messages={400:'Confirm the current Terms before continuing.',401:'Sign in again.',403:'Sign in again before accepting Terms. Account erasure cannot be cancelled here.',409:'The Terms version changed. Review the current version.',429:'Please wait before trying again.',503:'Terms are unavailable. Please retry or contact support@arbor.ph.'}
        raise HTTPException(status,messages[status])from None

def current():
    try:return document(call('arbor_terms_current_v1',{}))
    except (ValueError,TypeError,KeyError):raise HTTPException(503,'The Terms document could not be verified.')from None

def signup_intent(body):
    result=call('arbor_terms_signup_intent_v1',{'p_email':body.email,'p_version':body.version,'p_digest':body.digest,'p_confirm':body.confirm})
    try:
        if not isinstance(result,dict) or set(result)!={'intent_token','version','digest','expires_at'} or not re.fullmatch(r'[0-9a-f]{64}',result['intent_token']) or result['version']!=body.version or result['digest']!=body.digest or datetime.fromisoformat(result['expires_at']).tzinfo is None:raise ValueError()
        return result
    except (ValueError,TypeError,KeyError):raise HTTPException(503,'A signup acceptance could not be verified.')from None

def account(authorization,body=None):
    from app.auth import get_verified_user_id
    get_verified_user_id(authorization)
    result=call('arbor_terms_account_v1',{'p_action':'accept'if body else 'status','p_version':body.version if body else None,'p_digest':body.digest if body else None,'p_confirm':body.confirm if body else False},authorization)
    try:
        document(result)
        if body and (result['version']!=body.version or result['digest']!=body.digest or result.get('required') is not False or result.get('accepted_at') is None):raise ValueError()
        if type(result.get('required'))is not bool or(result.get('accepted_at')is not None and datetime.fromisoformat(result['accepted_at']).tzinfo is None):raise ValueError()
        return result
    except (ValueError,TypeError,KeyError):raise HTTPException(503,'Your Terms status could not be verified.')from None
