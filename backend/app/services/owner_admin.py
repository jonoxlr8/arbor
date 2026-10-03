"""Narrow existing-JWT request review; the DB is the owner-access authority."""
from fastapi import HTTPException
from app.database import get_authenticated_client
from app.schemas.owner_admin import AdminAccess,RequestPage,RequestReview


def call(authorization,name,params,model):
    if not authorization or not authorization.startswith("Bearer ") or not authorization.split(" ",1)[1]:
        raise HTTPException(401,"Sign in again to use Owner Admin.")
    try:
        result=get_authenticated_client(authorization.split(" ",1)[1]).rpc(name,params).execute().data
        return model.model_validate(result)
    except Exception as error:
        code=getattr(error,"code","")
        if name in ("arbor_admin_access_v1", "arbor_admin_deletion_access_v1", "arbor_admin_ask_feedback_access_v1") and code in("42883","PGRST202"):
            return AdminAccess(allowed=False) # Prepared schema not yet activated.
        messages={"PT401":(401,"Sign in again to use Owner Admin."),"PT403":(403,"Owner Admin access is unavailable for this account."),
                  "PT404":(404,"This request is no longer available."),
                  "PT409":(409,"This request changed or is busy. Refresh before editing its status."),
                  "PT422":(422,"Check the request status and try again.")}
        status,message=messages.get(code,(503,"Request review is unavailable. Refresh to check the latest status."))
        raise HTTPException(status,message)from None


def access(authorization):return call(authorization,"arbor_admin_access_v1",{},AdminAccess)
def listing(authorization,offset):return call(authorization,"arbor_admin_requests_v1",{"p_limit":50,"p_offset":offset},RequestPage)
def detail(authorization,id):return call(authorization,"arbor_admin_request_v1",{"p_id":str(id)},RequestReview)
def change(authorization,id,body):return call(authorization,"arbor_admin_request_status_v1",{"p_id":str(id),"p_status":body.status,"p_expected_revision":body.expected_revision},RequestReview)

# Separate capability: the investment-request owner grant does not grant this read.
def deletion_access(authorization):
    return call(authorization,"arbor_admin_deletion_access_v1",{},AdminAccess)

def deletions(authorization,offset):
    from app.schemas.admin_deletion_review import DeletionPage
    return call(authorization,"arbor_admin_deletions_v1",{"p_limit":50,"p_offset":offset},DeletionPage)

def deletion_detail(authorization,id):
    from app.schemas.admin_deletion_review import DeletionReview
    return call(authorization,"arbor_admin_deletion_v1",{"p_request":str(id)},DeletionReview)

# Separate read capability; no identity, financial projection or mutation.
def feedback_access(authorization):
    return call(authorization,"arbor_admin_ask_feedback_access_v1",{},AdminAccess)
def feedback(authorization,offset):
    from app.schemas.admin_ask_feedback import FeedbackPage
    return call(authorization,"arbor_admin_ask_feedback_v1",{"p_limit":50,"p_offset":offset},FeedbackPage)
