import test from "node:test";
import assert from "node:assert/strict";
import {createElement} from "react";
import {renderToStaticMarkup as render} from "react-dom/server";
import {MonthlyCheckin,MonthlySummary} from "../components/MonthlyCheckin";
import PlanCreated from "../components/PlanCreated";
import {AccountAccessContext} from "../components/AccountAccess";
import {createMonthlyApi,validMonthly,monthLabel,checkinDate,type MonthlyState} from "./monthlyCheckin";
import {contributionFixture} from "./contributions.test";
import {isNextAction} from "./nextAction";
import type {Entitlements} from "./entitlements";

const pending:MonthlyState={month:"2026-09",current:null,history:[]};
const row={month:"2026-09",amount_php:"5000.25",completed_at:"2026-09-24T23:30:00Z",undone_at:null};
const complete:MonthlyState={...pending,current:row,history:[row]};
test("canonical monthly shapes reject mismatched months and invalid records",()=>{
 assert.ok(validMonthly(pending));assert.ok(validMonthly(complete));
 assert.equal(validMonthly({...complete,month:"2026-10"}),false);
 assert.equal(validMonthly({...complete,current:{...row,amount_php:"NaN"}}),false);
 assert.equal(validMonthly({...complete,current:{...row,undone_at:row.completed_at}}),false);
});
test("UTC labels do not shift completion to next local day",()=>{
 assert.match(monthLabel("2026-09"),/September 2026/);assert.match(checkinDate(row.completed_at),/Sep 24/);
});
test("pending and complete copy distinguishes self-report from portfolio",()=>{
 assert.match(render(createElement(MonthlySummary,{state:pending})),/outside Arbor|UTC/);
 const html=render(createElement(MonthlySummary,{state:complete}));
 assert.match(html,/You’re set for September/);assert.match(html,/5,000.25/);assert.match(html,/No holdings or trades were created/);
 assert.doesNotMatch(html,/Trade confirmed|Order completed|Buy now/);
});
test("first-run confirmation names user choice without assigning investments",()=>{
 const value=structuredClone(contributionFixture);value.plan.plan_basis="user_selected";
 const html=render(createElement(PlanCreated,{value,onContinue(){}}));
 assert.match(html,/Your plan is ready|You chose/);assert.match(html,/Go to Home/);assert.match(html,/does not place trades/);
 value.plan.plan_basis="historical_assessment";
 assert.doesNotMatch(render(createElement(PlanCreated,{value,onContinue(){}})),/You chose/);
});
test("monthly surface fails closed for availability, Free, foundation and short horizon",()=>{
 const base:Entitlements={tier:"plus",status:"trial",effective_tier:"plus",private_beta:true,features:["monthly_contribution_planner"],ask_monthly_limit:null,ask_usage:null,ask_usage_available:true,availability:{live_portfolio:false,monthly_checkin:true}};
 for(const mode of ["off","free","foundation","short","historical","allowed"]){
  const value=structuredClone(contributionFixture);value.plan.plan_basis=mode==="historical"?"historical_assessment":"user_selected";
  if(mode==="foundation")value.plan.readiness.actionable_contribution_guidance_allowed=false;
  if(mode==="short")value.plan={...value.plan,path:"short_term",base_allocation:null,selected_strategy:null,planning_return_pct:null};
  const access={...base,features:mode==="free"?[]:base.features,availability:{live_portfolio:false,monthly_checkin:mode!=="off"}};
  const html=render(createElement(AccountAccessContext.Provider,{value:{value:access,error:"",retry(){}}},createElement(MonthlyCheckin,{value,userId:"owner"})));
  assert.equal(html.includes("Monthly check-in"),mode==="allowed");
 }
});
test("monthly API uses JWT, no user ID in request body and strict response validation",async()=>{
 const calls:{url:string;init:RequestInit|undefined}[]=[];
 const api=createMonthlyApi(async owner=>{assert.equal(owner,"A");return "fixture";},async(url,init)=>{calls.push({url:String(url),init});return new Response(JSON.stringify(complete));});
 assert.deepEqual(await api("A",new AbortController().signal,"complete",{month:"2026-09",amount_php:"5000.25"}),complete);
 assert.deepEqual(JSON.parse(String(calls[0].init?.body)),{month:"2026-09",amount_php:"5000.25"});
 assert.equal((calls[0].init?.headers as Record<string,string>).Authorization,"Bearer fixture");
 const failing=createMonthlyApi(async()=>"fixture",async()=>new Response("database secret",{status:503}));
 await assert.rejects(failing("A",new AbortController().signal),/couldn’t load or save/);
});
test("completed action is a recognized deterministic product destination",()=>{
 assert.ok(isNextAction({key:"monthly_complete",destination:"portfolio",title:"You’re set for September",explanation:"Recorded outside Arbor",button_label:"View your portfolio",blocking:false}));
});
