from uuid import UUID
from fastapi import APIRouter,Depends,Header,HTTPException,Query,Request,Response
from app.auth import get_current_user_id
from app.schemas.owner_admin import AdminAccess,RequestPage,RequestReview,StatusChange
from app.services import owner_admin as service
from app.schemas.admin_deletion_review import DeletionPage,DeletionReview

router=APIRouter(prefix="/v2/admin",tags=["Owner request review"])

def admission(request:Request,response:Response,authorization:str|None=Header(default=None),owner:str=Depends(get_current_user_id)):
    response.headers["Cache-Control"]="private, no-store"
    response.headers["X-Content-Type-Options"]="nosniff"
    if any(k!="offset" or not request.url.path in ("/v2/admin/requests", "/v2/admin/deletions", "/v2/admin/ask-feedback") for k in request.query_params) or(len(request.query_params.getlist('offset'))>1):
        raise HTTPException(400,"Admin does not accept account selectors.")
    return authorization

@router.get('/access',response_model=AdminAccess)
def access(authorization=Depends(admission)):return service.access(authorization)
@router.get('/requests',response_model=RequestPage)
def listing(offset:int=Query(default=0,ge=0,le=10000),authorization=Depends(admission)):return service.listing(authorization,offset)
@router.get('/requests/{id}',response_model=RequestReview)
def detail(id:UUID,authorization=Depends(admission)):return service.detail(authorization,id)
@router.put('/requests/{id}/status',response_model=RequestReview)
def change(id:UUID,body:StatusChange,authorization=Depends(admission)):return service.change(authorization,id,body)

# GET only. No hold/status mutation or erasure dispatch exposed here.
@router.get('/deletions/access',response_model=AdminAccess)
def deletion_access(authorization=Depends(admission)):return service.deletion_access(authorization)
@router.get('/deletions',response_model=DeletionPage)
def deletions(offset:int=Query(default=0,ge=0,le=10000),authorization=Depends(admission)):return service.deletions(authorization,offset)
@router.get('/deletions/{id}',response_model=DeletionReview)
def deletion_detail(id:UUID,authorization=Depends(admission)):return service.deletion_detail(authorization,id)

@router.get('/ask-feedback/access',response_model=AdminAccess)
def feedback_access(authorization=Depends(admission)):return service.feedback_access(authorization)
@router.get('/ask-feedback')
def feedback(offset:int=Query(default=0,ge=0,le=10000),authorization=Depends(admission)):return service.feedback(authorization,offset)
