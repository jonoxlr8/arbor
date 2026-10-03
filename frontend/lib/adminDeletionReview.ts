import {getAccessToken} from './auth';
import {apiBaseUrl} from './apiConfig';
import {boundedRequest} from './dashboardConsistency';
import {AdminAccessError} from './ownerAdmin';
export type DeletionHold={category:'ledger'|'profile'|'history'|'reminders'|'support'|'provider_copies';reason:'legal_claim'|'restore_risk'|'reviewed_obligation';review_at:string;end_at:string};
export type DeletionReview={request_id:string;requested_at:string|null;request_status:'pending'|'withdrawn'|'record_unavailable';withdrawn_at:string|null;lifecycle_state:'active'|'deactivated'|'deletion_pending'|'erasing'|null;processing_state:'not_started'|'reviewed'|'erasing'|'data_erased'|'auth_erased'|'completed';holds:DeletionHold[];verified_at:string|null;completed_at:string|null;receipt_expires_at:string|null;provider_status:'unassessed'|'pending_copies'|'confirmed';receipt_id:string|null};
export type DeletionPage={items:DeletionReview[];has_more:boolean;offset:number};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dated=(v:unknown):v is string=>typeof v==='string'&&/(Z|[+-]\d{2}:\d{2})$/.test(v)&&Number.isFinite(Date.parse(v));
const keys=(v:object,names:string[])=>Object.keys(v).sort().join(',')===[...names].sort().join(',');
export function validDeletionReview(v:unknown):v is DeletionReview{
 if(!v||typeof v!=='object')return false;const r=v as DeletionReview;
 if(!keys(r,['request_id','requested_at','request_status','withdrawn_at','lifecycle_state','processing_state','holds','verified_at','completed_at','receipt_expires_at','provider_status','receipt_id'])||typeof r.request_id!=='string'||!uuid.test(r.request_id)||!['pending','withdrawn','record_unavailable'].includes(r.request_status)||![null,'active','deactivated','deletion_pending','erasing'].includes(r.lifecycle_state)||!['not_started','reviewed','erasing','data_erased','auth_erased','completed'].includes(r.processing_state)||!['unassessed','pending_copies','confirmed'].includes(r.provider_status))return false;
 if(![r.requested_at,r.withdrawn_at,r.verified_at,r.completed_at,r.receipt_expires_at].every(v=>v===null||dated(v))||r.request_status==='withdrawn'&&r.withdrawn_at===null)return false;
 if(!Array.isArray(r.holds)||r.holds.length>12||!r.holds.every(h=>h&&keys(h,['category','reason','review_at','end_at'])&&['ledger','profile','history','reminders','support','provider_copies'].includes(h.category)&&['legal_claim','restore_risk','reviewed_obligation'].includes(h.reason)&&dated(h.review_at)&&dated(h.end_at)&&Date.parse(h.end_at)>=Date.parse(h.review_at)))return false;
 return r.receipt_id===null||typeof r.receipt_id==='string'&&uuid.test(r.receipt_id)&&r.processing_state==='completed'&&r.completed_at!==null&&r.receipt_expires_at!==null&&r.provider_status!=='unassessed';
}
export function deletionReviewResult(r:DeletionReview){
 if(r.request_status==='withdrawn')return 'Withdrawn';
 if(r.processing_state==='completed')return r.receipt_id?'Active-system deletion confirmed':'Completion needs verification';
 if(r.holds.length)return 'On hold';
 return {not_started:'Waiting for manual review',reviewed:'Ready for manual checkpoints',erasing:'Manual deletion in progress',data_erased:'Database checkpoint recorded',auth_erased:'Awaiting completion verification'}[r.processing_state];
}
export function deletionManualGuidance(r:DeletionReview){
 if(r.request_status==='withdrawn')return 'Do not proceed with a withdrawn request. Check the current canonical request before any manual action.';
 if(r.holds.length)return 'Review the scoped holds in the existing manual procedure. Dates do not automatically release a hold. This page cannot change holds or run deletion.';
 if(r.receipt_id)return 'The canonical workflow confirms active-system deletion. Review provider copies and the separately confirmed completion channel. A receipt does not mean a message was sent.';
 return 'Use the existing manual deletion procedure. Verify the current request, identity, version, scoped holds and completion channel, then reconcile each saved checkpoint. Every execution phase needs its own fresh approval. This page cannot start deletion or mark it complete.';
}
export function createDeletionReviewApi(token=getAccessToken,request:typeof fetch=fetch){
 async function get(userId:string,path:string){return boundedRequest(async signal=>{const credential=await token(userId);signal.throwIfAborted();const response=await request(`${apiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL,process.env.NODE_ENV)}/v2/admin/deletions${path}`,{method:'GET',cache:'no-store',signal,headers:{Authorization:`Bearer ${credential}`}});if(response.status===401||response.status===403)throw new AdminAccessError('Account-deletion review is unavailable for this account.');if(!response.ok)throw new Error(response.status===404?'This deletion record is no longer available.':'Deletion review is unavailable. Refresh to check current records.');return response.json();});}
 return {
  async access(userId:string){const v=await get(userId,'/access');if(!v||!keys(v,['allowed'])||typeof v.allowed!=='boolean')throw new Error('Deletion review access could not be verified.');return v.allowed as boolean;},
  async list(userId:string,offset=0):Promise<DeletionPage>{if(!Number.isInteger(offset)||offset<0||offset>10000)throw new Error('Invalid deletion page.');const v=await get(userId,`?offset=${offset}`);if(!v||!keys(v,['items','has_more','offset'])||!Array.isArray(v.items)||v.items.length>50||!v.items.every(validDeletionReview)||typeof v.has_more!=='boolean'||v.offset!==offset)throw new Error('Deletion records could not be verified.');return v;},
  async detail(userId:string,id:string):Promise<DeletionReview>{if(!uuid.test(id))throw new Error('Invalid deletion request.');const v=await get(userId,`/${id}`);if(!validDeletionReview(v)||v.request_id!==id)throw new Error('Deletion record could not be verified.');return v;}
 };
}
export const deletionReviewApi=createDeletionReviewApi();
