from uuid import UUID
from fastapi import APIRouter,Depends,Header,HTTPException,Query,Request,Response
from app.auth import get_current_user_id
from app.schemas.owner_admin import AdminAccess,RequestPage,RequestReview,StatusChange
from app.services import owner_admin as service

router=APIRouter(prefix="/v2/admin",tags=["Owner request review"])

def admission(request:Request,response:Response,authorization:str|None=Header(default=None),owner:str=Depends(get_current_user_id)):
    response.headers["Cache-Control"]="private, no-store"
    response.headers["X-Content-Type-Options"]="nosniff"
    if any(k!="offset" or not request.url.path.endswith("/requests") for k in request.query_params) or(len(request.query_params.getlist('offset'))>1):
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
