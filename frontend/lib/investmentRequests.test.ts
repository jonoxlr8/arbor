import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInvestmentRequestApi, requestText, validRequestText } from "./investmentRequests";
import InvestmentRequestForm from "../components/portfolio/InvestmentRequestForm";
import InvestmentCatalogue from "../components/portfolio/InvestmentCatalogue";

const id = "00000000-0000-4000-8000-000000000001";
const draft = {investment_name:"Example Index Fund",provider:"Example Broker",idempotency_key:id};
const receipt = {id,investment_name:draft.investment_name,provider:draft.provider,received_at:"2026-10-03T00:00:00Z",status:"received"};
test("request collects name/provider only, with ownership derived through existing token", async()=>{
 let seen=0;
 const send=createInvestmentRequestApi(async owner=>{assert.equal(owner,id);return "synthetic";},async(url,init)=>{
  seen++;assert.match(String(url),/\/v2\/investment-requests$/);assert.equal(init?.method,"POST");assert.equal((init?.headers as Record<string,string>).Authorization,"Bearer synthetic");assert.deepEqual(JSON.parse(String(init?.body)),draft);return new Response(JSON.stringify(receipt));
 });
 assert.deepEqual(await send(id,draft),receipt);assert.equal(seen,1);
});
test("normalizes whitespace and respects bounds",()=>{
 assert.equal(requestText(" Example\n Index  Fund "),"Example Index Fund");
 assert.equal(validRequestText(" ",120),false);assert.equal(validRequestText("x".repeat(121),120),false);assert.equal(validRequestText("x\0",120),false);
});
test("empty input makes no token or network request",async()=>{
 let calls=0;const send=createInvestmentRequestApi(async()=>{calls++;return"synthetic";},async()=>{calls++;return new Response();});
 await assert.rejects(send(id,{...draft,provider:""}),/Enter/);assert.equal(calls,0);
});
for(const status of[401,403,409,429,503])test(`request HTTP ${status} never claims success`,async()=>{
 const send=createInvestmentRequestApi(async()=>"synthetic",async()=>new Response(JSON.stringify({detail:"private provider detail"}),{status}));
 await assert.rejects(send(id,draft),error=>error instanceof Error&&!error.message.includes("private provider detail"));
});
for(const invalid of[{...receipt,provider:"other"},{...receipt,status:"supported"},{...receipt,received_at:"2026-10-03T00:00:00"},null])test(`unverified receipt ${JSON.stringify(invalid)} fails`,async()=>{
 const send=createInvestmentRequestApi(async()=>"synthetic",async()=>new Response(JSON.stringify(invalid)));await assert.rejects(send(id,draft),/confirm/);
});
test("both success receipt states are accepted",async()=>{
 const send=createInvestmentRequestApi(async()=>"synthetic",async()=>new Response(JSON.stringify({...receipt,status:"already_received"})));assert.equal((await send(id,draft)).status,"already_received");
});
test("two-field form does not collect finance or account details",()=>{
 const html=renderToStaticMarkup(createElement(InvestmentRequestForm,{userId:id,onBack:()=>{}}));
 assert.match(html,/Investment or fund name/);assert.match(html,/>Provider</);assert.match(html,/Send request/);assert.equal((html.match(/<input/g)||[]).length,2);assert.doesNotMatch(html,/type="email"|units|amount|phone/);
 const catalogue=renderToStaticMarkup(createElement(InvestmentCatalogue,{userId:id,catalog:[],onSelect:()=>{}}));assert.match(catalogue,/Can’t find your investment/);
});
