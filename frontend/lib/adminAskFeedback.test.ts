import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAdminFeedbackApi,validFeedbackPage} from './adminAskFeedback';
const row={helpful:false,reason:'unclear',intent:'actual_holdings',created_at:'2026-10-03T00:00:00Z'};
const page={items:[row],topics:[{intent:'actual_holdings',helpful:1,not_helpful:1}],offset:0,has_more:false};
test('feedback projection rejects identities, text, unknown topics and malformed counts',()=>{
 assert.ok(validFeedbackPage(page,0));
 for(const key of ['user_id','id','email','answer_version','question','amount'])assert.equal(validFeedbackPage({...page,items:[{...row,[key]:'private'}]},0),false);
 for(const patch of [{reason:'free text'},{intent:'unknown'},{helpful:'false'},{created_at:'2026-10-03'}])assert.equal(validFeedbackPage({...page,items:[{...row,...patch}]},0),false);
 assert.equal(validFeedbackPage({...page,topics:[{intent:'plan',helpful:-1,not_helpful:2}]},0),false);
 assert.equal(validFeedbackPage({...page,topics:[page.topics[0],page.topics[0]]},0),false);
 assert.equal(validFeedbackPage(page,50),false);
});
test('feedback client uses verified actor token and GET only with bounded page',async()=>{
 const calls:unknown[]=[];const api=createAdminFeedbackApi(async id=>{assert.equal(id,'owner');return 'fixture';},async(input,init)=>{calls.push([String(input),init?.method,init?.cache]);return new Response(JSON.stringify(String(input).endsWith('/access')?{allowed:true}:page),{status:200});});
 assert.equal(await api.access('owner'),true);assert.deepEqual(await api.list('owner'),page);assert.ok(calls.every(c=>Array.isArray(c)&&c[1]==='GET'&&c[2]==='no-store'));
 await assert.rejects(()=>api.list('owner',-1));assert.equal(calls.length,2);
});
test('feedback reader fails closed for revocation or malformed capability',async()=>{
 for(const response of [new Response('{}',{status:403}),new Response(JSON.stringify({allowed:true,user_id:'private'}),{status:200})]){
 const api=createAdminFeedbackApi(async()=> 'fixture',async()=>response);await assert.rejects(()=>api.access('owner'));
 }
});
