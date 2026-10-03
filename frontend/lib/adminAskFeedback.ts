import {getAccessToken} from './auth';
import {apiBaseUrl} from './apiConfig';
import {boundedRequest} from './dashboardConsistency';
import {AdminAccessError} from './ownerAdmin';
import {FEEDBACK_INTENTS,isFeedbackReason,object,type FeedbackContext,type FeedbackReason} from './askPresentation';
type Topic=FeedbackContext['intent'];
export type FeedbackRow={helpful:boolean;reason:FeedbackReason|null;intent:Topic;created_at:string};
export type FeedbackTopic={intent:Topic;helpful:number;not_helpful:number};
export type FeedbackPage={items:FeedbackRow[];topics:FeedbackTopic[];offset:number;has_more:boolean};
export const TOPIC_LABELS:Record<Topic,string>={education:'Investing basics',instrument_education:'Investment types',plan:'Saved plan',actual_holdings:'Recorded holdings',holdings_help:'Recording holdings',recorded_cost:'Recorded cost',goal_progress:'Goal progress',monthly_plan:'Monthly plan',monthly_checkin:'Monthly review',pending_recording:'Pending records',contribution:'Contributions',projection:'Projections',assessment:'Assessment',readiness:'Readiness',preferences:'Preferences',risk:'Risk',implementation:'Plan implementation',overlap:'Investment overlap',next_action:'Next steps',change_plan:'Plan changes',assumptions:'Assumptions',plus:'Arbor access',help:'Arbor help',out_of_scope:'Outside Arbor’s scope',decision_boundary:'Investment decisions',clarification:'Clarification',legacy_plan:'Earlier plan'};
const keys=(v:Record<string,unknown>,expected:string)=>Object.keys(v).sort().join(',')===expected;
const topic=(v:unknown):v is Topic=>typeof v==='string'&&(FEEDBACK_INTENTS as readonly string[]).includes(v);
const count=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
export function validFeedbackPage(v:unknown,offset:number):v is FeedbackPage{
 if(!object(v)||!keys(v,'has_more,items,offset,topics')||v.offset!==offset||typeof v.has_more!=='boolean'||!Array.isArray(v.items)||v.items.length>50||!Array.isArray(v.topics)||v.topics.length>FEEDBACK_INTENTS.length)return false;
 const rows=v.items.every(r=>object(r)&&keys(r,'created_at,helpful,intent,reason')&&typeof r.helpful==='boolean'&&topic(r.intent)&&(r.reason===null||isFeedbackReason(r.reason))&&typeof r.created_at==='string'&&/(Z|[+-]\d{2}:\d{2})$/.test(r.created_at)&&Number.isFinite(Date.parse(r.created_at)));
 const topics=v.topics.every(t=>object(t)&&keys(t,'helpful,intent,not_helpful')&&topic(t.intent)&&count(t.helpful)&&count(t.not_helpful));
 return rows&&topics&&new Set(v.topics.map(t=>t.intent)).size===v.topics.length;
}
export function createAdminFeedbackApi(token=getAccessToken,request:typeof fetch=fetch){
 async function call(userId:string,path:string,signal?:AbortSignal){return boundedRequest(async active=>{
  const credential=await token(userId);active.throwIfAborted();
  const r=await request(`${apiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL,process.env.NODE_ENV)}/v2/admin/ask-feedback${path}`,{method:'GET',headers:{Authorization:`Bearer ${credential}`},cache:'no-store',signal:active});
  if(r.status===401||r.status===403)throw new AdminAccessError('Feedback review is unavailable for this account.');
  if(!r.ok)throw new Error('Feedback review is unavailable. Refresh to check.');return r.json();
 },signal);}
 return {async access(userId:string,signal?:AbortSignal){const v=await call(userId,'/access',signal);if(!object(v)||!keys(v,'allowed')||typeof v.allowed!=='boolean')throw new Error('Feedback access could not be verified.');return v.allowed;},
 async list(userId:string,offset=0,signal?:AbortSignal):Promise<FeedbackPage>{if(!Number.isInteger(offset)||offset<0||offset>10000)throw new Error('Invalid feedback page.');const v=await call(userId,`?offset=${offset}`,signal);if(!validFeedbackPage(v,offset))throw new Error('Feedback review could not be verified.');return v;}};
}
export const adminFeedbackApi=createAdminFeedbackApi();
