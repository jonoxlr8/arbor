import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createTermsRequester} from './accountTerms';
import {createAuthHelpers} from './auth';
import type {SupabaseClient} from '@supabase/supabase-js';
const text=JSON.stringify({title:'Terms',introduction:'Synthetic',sections:[['Rule','Choose explicitly']]});
const doc={version:'test-1',digest:createHash('sha256').update(text).digest('hex'),document_text:text};
const response=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status});
test('verified document, separate signup intent and unchecked refusal',async()=>{
 const calls:{path:string;init?:RequestInit}[]=[];
 const api=createTermsRequester(async()=>{throw Error('anonymous must not obtain credentials');},async(path,init)=>{calls.push({path:String(path),init});return response(String(path).endsWith('current')?doc:{intent_token:'a'.repeat(64),version:doc.version,digest:doc.digest,expires_at:new Date(Date.now()+600000).toISOString()});});
 const d=await api.current();assert.equal(d.body.title,'Terms');
 await assert.rejects(api.intent('fake@example.test',d,false));assert.equal(calls.length,1);
 await api.intent('fake@example.test',d,true);
 assert.deepEqual(JSON.parse(String(calls[1].init?.body)),{email:'fake@example.test',version:doc.version,digest:doc.digest,confirm:true});
 assert.equal((calls[1].init?.headers as Record<string,string>).Authorization,undefined);
});
test('owner token with no owner/timestamp selectors and no inferred acceptance',async()=>{
 const calls:RequestInit[]=[];
 const api=createTermsRequester(async owner=>{assert.equal(owner,'A');return 'fake-token';},async(_,init)=>{calls.push(init!);return response({...doc,required:init?.method!=='POST',accepted_at:init?.method==='POST'?'2026-10-01T12:00:00Z':null});});
 const d=await api.account('A');assert.equal(d.required,true);assert.equal(calls[0].method,'GET');
 await api.account('A',d);assert.deepEqual(JSON.parse(String(calls[1].body)),{version:doc.version,digest:doc.digest,confirm:true});assert.equal(calls[1].cache,'no-store');
});
test('tampered documents, stale version and invalid receipt fail closed',async()=>{
 for(const value of [{...doc,digest:'0'.repeat(64)},{...doc,version:''}]){
  const api=createTermsRequester(async()=>'',async()=>response(value));await assert.rejects(api.current());
 }
 for(const status of [401,403,409,429,503]){
  const api=createTermsRequester(async()=>'',async()=>response({},status));await assert.rejects(api.account('A'));
 }
 const api=createTermsRequester(async()=>'',async()=>response({...doc,required:'no',accepted_at:null}));await assert.rejects(api.account('A'));
});
test('signup SDK cannot run without a verified intent capability',async()=>{
 let calls=0;
 const api=createAuthHelpers(async()=>({auth:{signUp:async()=>{calls++;return {data:{},error:null};}}}) as unknown as SupabaseClient);
 await assert.rejects(api.signUp('fake@example.test','synthetic','invalid'));assert.equal(calls,0);
});
