import { getAccessToken } from './auth';
import { apiBaseUrl } from './apiConfig';
import { InvalidSessionError } from './accountRecovery';
import { boundedRequest } from './dashboardConsistency';
export type TermsDocument={version:string;digest:string;document_text:string;body:{title:string;introduction:string;sections:string[][]}};
export type AccountTerms=TermsDocument&{required:boolean;accepted_at:string|null};
async function verify(value:unknown):Promise<TermsDocument>{
 if(!value||typeof value!=='object')throw Error('Terms could not be verified.');
 const v=value as TermsDocument;
 if(typeof v.version!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(v.version)||!/^[a-f0-9]{64}$/.test(v.digest)||typeof v.document_text!=='string'||new TextEncoder().encode(v.document_text).length>65536)throw Error('Terms could not be verified.');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v.document_text)))).map(b=>b.toString(16).padStart(2,'0')).join('');
 if(hash!==v.digest)throw Error('Terms could not be verified.');
 const body=JSON.parse(v.document_text);
 if(typeof body.title!=='string'||typeof body.introduction!=='string'||!Array.isArray(body.sections)||body.sections.length<1||body.sections.length>50||body.sections.some((r:unknown)=>!Array.isArray(r)||r.length!==2||r.some(x=>typeof x!=='string')))throw Error('Terms could not be verified.');
 return {...v,body};
}
export function createTermsRequester(token=getAccessToken,request:typeof fetch=fetch){
 async function send(path:string,body?:unknown,owner?:string,access?:string,signal?:AbortSignal){
  return boundedRequest(async active=>{
   const credential=owner?(access??await token(owner)):undefined;active.throwIfAborted();
   const response=await request(`${apiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL,process.env.NODE_ENV)}${path}`,{method:body?'POST':'GET',cache:'no-store',signal:active,headers:{'Content-Type':'application/json',...(credential?{Authorization:`Bearer ${credential}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
   if(response.status===401)throw new InvalidSessionError('Sign in again.');
   if(response.status===409)throw Error('The Terms changed. Refresh and review the current version.');
   if(response.status===403)throw Error('Sign out and sign in again before accepting Terms.');
   if(response.status===429)throw Error('Please wait before trying again.');
   if(!response.ok)throw Error('Terms are unavailable. Retry or contact support@arbor.ph.');
   return response.json();
  },signal,12000);
 }
 return {
  current:async(signal?:AbortSignal)=>verify(await send('/terms/current',undefined,undefined,undefined,signal)),
  intent:async(email:string,doc:TermsDocument,confirmed:boolean,signal?:AbortSignal)=>{
   if(!confirmed)throw Error('Accept the Terms before creating an account.');
   const result=await send('/terms/signup-intent',{email,version:doc.version,digest:doc.digest,confirm:true},undefined,undefined,signal);
   if(!/^[a-f0-9]{64}$/.test(result.intent_token)||result.version!==doc.version||result.digest!==doc.digest||!Number.isFinite(Date.parse(result.expires_at)))throw Error('Signup acceptance could not be verified.');
   return result.intent_token as string;
  },
  account:async(owner:string,doc?:TermsDocument,access?:string,signal?:AbortSignal):Promise<AccountTerms>=>{
   const r=await send(doc?'/account/terms/accept':'/account/terms',doc?{version:doc.version,digest:doc.digest,confirm:true}:undefined,owner,access,signal);
   const d=await verify(r);if(doc&&(d.version!==doc.version||d.digest!==doc.digest||r.required!==false||r.accepted_at===null))throw Error('Acceptance could not be verified.');if(typeof r.required!=='boolean'||(r.accepted_at!==null&&!Number.isFinite(Date.parse(r.accepted_at))))throw Error('Terms status could not be verified.');
   return {...d,required:r.required,accepted_at:r.accepted_at};
  },
 };
}
export const accountTerms=createTermsRequester();
