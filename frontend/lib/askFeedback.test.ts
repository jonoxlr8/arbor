import test from "node:test";
import assert from "node:assert/strict";
import { createAskFeedbackClient } from "./askFeedback";
import { parseAskPresentation, ASK_ACTIONS } from "./askPresentation";
import { createChatReader } from "./api";
const id="00000000-0000-4000-8000-000000000001";
const context={intent:"actual_holdings",answer_version:"deterministic-ask-1"} as const;
test("Ask actions are navigation only, metadata finite, old replies compatible", async () => {
  assert.deepEqual(parseAskPresentation({},"Old reply"),{});
  for (const action of Object.keys(ASK_ACTIONS)) assert.equal(parseAskPresentation({action},"Reply").action,action);
  for(const bad of [{action:"https://evil.test"},{action:"__proto__"},{summary:"Made up amount"},{feedback_context:{...context,question:"PRIVATE"}},{feedback_context:{intent:"customer-name",answer_version:"deterministic-ask-1"}}]) assert.throws(()=>parseAskPresentation(bad,"Recorded value."));
  const reader=createChatReader(async()=>({}),async(_url,init)=>{assert.deepEqual(JSON.parse(init?.body as string),{message:"Magkano portfolio ko?"});return Response.json({reply:"Recorded value. More detail.",summary:"Recorded value.",action:"portfolio",feedback_context:context});});
  assert.equal((await reader("Magkano portfolio ko?")).action,"portfolio");
});
test("feedback sends only explicit finite vote fields, preserves UUID for edits",async()=>{
 const requests:unknown[]=[];
 const client=createAskFeedbackClient(async()=>({Authorization:"Bearer fixture"}),async(url,init)=>{
  assert.match(String(url),new RegExp(`/ask/feedback/${id}$`));assert.equal(init?.method,"PUT");assert.equal(init?.cache,"no-store");
  const body=JSON.parse(init?.body as string);requests.push(body);return Response.json({saved:true,helpful:body.helpful,reason:body.reason});
 });
 await client.save(id,{...context,helpful:false,reason:null,question:"PRIVATE",reply:"PRIVATE",holdings:[1],amount:15000} as never);
 await client.save(id,{...context,helpful:false,reason:"unclear"});
 assert.deepEqual(requests,[{helpful:false,reason:null,...context},{helpful:false,reason:"unclear",...context}]);
});
test("availability read is never a vote and missing capability stays false",async()=>{
 let calls=0;const client=createAskFeedbackClient(async()=>({}),async(_url,init)=>{calls++;assert.equal(init?.method,"GET");assert.equal(init?.body,undefined);return Response.json({available:false});});
 assert.equal(await client.access(),false);assert.equal(calls,1);
});
test("invalid feedback input, false confirmation and auth failures are not saved",async()=>{
 let calls=0;const client=createAskFeedbackClient(async()=>({}),async()=>{calls++;return Response.json({saved:false,helpful:true,reason:null});});
 for(const vote of [{...context,helpful:1,reason:null},{...context,helpful:true,reason:"PRIVATE"},{...context,intent:"PRIVATE",helpful:true,reason:null}])await assert.rejects(client.save(id,vote as never));
 assert.equal(calls,0);await assert.rejects(client.save(id,{...context,helpful:true,reason:null}),/confirmed/);
 const denied=createAskFeedbackClient(async()=>({}),async()=>Response.json({}, {status:403}));await assert.rejects(denied.save(id,{...context,helpful:true,reason:null}),/could not be saved/);
});
test("feedback deadline/abort never claims save success",async()=>{
 const client=createAskFeedbackClient(async()=>({}),async()=>new Promise(()=>{}),5);await assert.rejects(client.save(id,{...context,helpful:true,reason:null}),/timed out/);
 const controller=new AbortController();controller.abort();await assert.rejects(client.access(controller.signal));
});
