import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountAccessContext, ComparePlans, PlusFeature } from "../components/AccountAccess";
import { createEntitlementReader, FREE_LIMIT_MESSAGE, isEntitlements, isAskUsage, type Entitlements } from "./entitlements";
import { createChatReader } from "./api";
import { chatErrorMessage, createChatSession } from "./chatSession";
import { isNextAction } from "./nextAction";

const free: Entitlements = { tier:"free",status:"active",effective_tier:"free",private_beta:false,
  features:["plan_creation","basic_projection","basic_implementation","ask_arbor_basic","next_action"],ask_monthly_limit:10,
  ask_usage:{used:9,remaining:1,allowed:true,period:"2026-09-01"},ask_usage_available:true };
const plus: Entitlements = {...free,tier:"plus",status:"trial",effective_tier:"plus",private_beta:true,
  features:[...free.features,"profile_rebuild","monthly_contribution_planner","ask_arbor_full"],ask_monthly_limit:null,ask_usage:null};

for (const [label,value] of [["Free",free],["Private Beta",plus],["Plus Active",{...plus,status:"active",private_beta:false}],["Expired Plus",{...free,tier:"plus",status:"expired"}]] as const) {
  test(`Compare Plans ${label}: current access, plain prices, no payment action`,()=>{
    const html=renderToStaticMarkup(createElement(ComparePlans,{value}));
    assert.match(html,/₱399\/month/);assert.match(html,/₱3,990\/year/);assert.match(html,/₱0/);
    assert.match(html,/10 Ask Arbor questions per month/);assert.match(html,/Full Ask Arbor access/);
    assert.match(html,/No payment is collected/);assert.doesNotMatch(html,/<button|checkout|Unlimited AI|Buy now/i);
    assert.equal(html.includes("Current plan: Arbor Plus — Private Beta"),value.private_beta);
    assert.match(html,/grid gap-5 md:grid-cols-2/);assert.match(html,/min-w-0/);
  });
}
for (const feature of ["profile_rebuild","monthly_contribution_planner"]) {
  for (const value of [free,plus]) test(`${feature} gate reflects server access ${value.effective_tier}`,()=>{
    const html=renderToStaticMarkup(createElement(AccountAccessContext.Provider,{value:{value,error:"",retry:()=>{}}},
      createElement(PlusFeature,{feature,title:"Planning tool"},createElement("p",null,"Tool content"))));
    assert.equal(html.includes("Tool content"),value.effective_tier==="plus");
    if(value.effective_tier==="free")assert.match(html,/href="#settings"/);
  });
}
test("unknown access does not mount Plus children; errors have retry",()=>{
  for(const error of ["","Please retry"]) {
    const html=renderToStaticMarkup(createElement(AccountAccessContext.Provider,{value:{value:null,error,retry:()=>{}}},
      createElement(PlusFeature,{feature:"profile_rebuild",title:"Edit"},"Secret tool")));
    assert.doesNotMatch(html,/Secret tool/);assert.match(html,error?/role="alert"/:/role="status"/);
    if(error)assert.match(html,/>Retry</);
  }
});
test("owner-token reader never sends tier or quota state",async()=>{
  const read=createEntitlementReader(async id=>{assert.equal(id,"A");return "fixture";},async(url,init)=>{
    assert.ok(String(url).endsWith("/account/entitlements"));assert.equal(init?.body,undefined);
    assert.equal(new Headers(init?.headers).get("Authorization"),"Bearer fixture");
    assert.equal(init?.cache,"no-store");return Response.json(free);
  });
  assert.deepEqual(await read("A",new AbortController().signal),free);
});
for(const status of [401,403,503])test(`access ${status} fails safely`,async()=>{
  const read=createEntitlementReader(async()=>"fixture",async()=>new Response("secret",{status}));
  await assert.rejects(read("A",new AbortController().signal),e=>e instanceof Error&&!e.message.includes("secret"));
});
test("contract rejects invalid access and quota values",()=>{
  assert.ok(isEntitlements(free));assert.ok(isEntitlements(plus));
  for(const value of [null,{}, {...free,tier:"admin"},{...free,features:null},{...free,ask_monthly_limit:Infinity},{...free,ask_usage:{used:99}}])assert.equal(isEntitlements(value),false);
  assert.equal(isAskUsage({used:9,remaining:10,allowed:true,period:"2026-09-01"}),false);
});
test("quota response is preserved; tenth completed answer not discarded",async()=>{
  const usage={used:10,remaining:0,allowed:true,period:"2026-09-01"};
  const read=createChatReader(async()=>({Authorization:"Bearer fixture"}),async()=>Response.json({reply:"Your plan explained",ask_usage:usage}));
  const seen:unknown[]=[];const session=createChatSession(read,s=>seen.push(s));
  await session.send("Explain my plan");
  assert.deepEqual(seen.at(-1),{status:"ready",data:{question:"Explain my plan",reply:"Your plan explained",ask_usage:usage}});
});
test("limit response uses calm safe text, not raw backend error",async()=>{
  const read=createChatReader(async()=>({}),async()=>Response.json({detail:{code:"ask_arbor_limit",message:"ignored server text"}},{status:429}));
  await assert.rejects(read("Explain my plan"),new Error(FREE_LIMIT_MESSAGE));
  assert.equal(chatErrorMessage(FREE_LIMIT_MESSAGE),FREE_LIMIT_MESSAGE);
});
test("unrecognized rate limit is not mislabeled as Free quota",async()=>{
  const read=createChatReader(async()=>({}),async()=>new Response("secret",{status:429}));
  await assert.rejects(read("Explain my plan"),error=>error instanceof Error && !error.message.includes("Free") && !error.message.includes("secret"));
});
test("server next action can lead Free user to Compare Plans",()=>{
  assert.ok(isNextAction({key:"review_monthly_contribution",destination:"settings",title:"Explore contribution planning",explanation:"Part of Plus",button_label:"Explore Arbor Plus",blocking:false}));
});
test("both saved-plan shells share account UI and the same editor gate",()=>{
  for (const file of ["components/PlanV2View.tsx","components/ResultsDashboard.tsx"]) {
    const source=readFileSync(file,"utf8");
    assert.match(source,/AccountAccessProvider key=\{props.userId\}/);
    assert.match(source,/<AccountPlans/);
    assert.match(source,/<PlusFeature feature="profile_rebuild"/);
  }
});
