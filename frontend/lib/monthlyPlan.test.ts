import test from "node:test";
import assert from "node:assert/strict";
import {createElement} from "react";
import {renderToStaticMarkup as render} from "react-dom/server";
import {readFileSync} from "node:fs";
import {monthlyMoney,validMonthlyPlan,createMonthlyPlanApi,type MonthlyPlan} from "./monthlyPlan";
import MonthlyInvesting from "../components/contributions/MonthlyInvesting";
import {AccountAccessContext} from "../components/AccountAccess";
import {contributionFixture} from "./contributions.test";
import type {Entitlements} from "./entitlements";

export const monthlyPlanFixture:MonthlyPlan={contribution_amount:"10000",current_portfolio_value:"0",source:"recorded_portfolio",status:"waiting",rows:[{sleeve:"global_equity",target_percentage_points:"80",current_value:"0",target_value_after_contribution:"8000",deficit:"8000",amount:"8000",product_id:null,provider_id:null,minimum:null,status:"choose_investment"}],provider_groups:[],ready_amount:"0",recordable_amount:"0",verify_minimum_amount:"0",waiting_amount:"0",choose_investment_amount:"10000",reserve_amount:"0",unallocated_amount:"0"};
test("monthly Decimal display preserves backend digits, signs and cents",()=>{
  assert.equal(monthlyMoney("10000.00"),"₱10,000");assert.equal(monthlyMoney("800.008"),"₱800.008");assert.equal(monthlyMoney("-100.50"),"−₱100.50");assert.equal(monthlyMoney("0.002"),"₱0.002");
  for(const value of ["NaN","Infinity","bad","1e3"])assert.throws(()=>monthlyMoney(value));
});
test("monthly response accepts Decimal strings and rejects mismatched investment/provider",()=>{
  assert.ok(validMonthlyPlan(monthlyPlanFixture));
  for(const bad of [null,{}, {...monthlyPlanFixture,rows:[null]}, {...monthlyPlanFixture,ready_amount:100}, {...monthlyPlanFixture,recordable_amount:"NaN"}, {...monthlyPlanFixture,rows:[{...monthlyPlanFixture.rows[0],product_id:"gotrade_vt",provider_id:"pdax"}]}])assert.equal(validMonthlyPlan(bad),false);
});
test("monthly API sends only current inputs, not client targets/owner or provider URLs",async()=>{
  let body:unknown,url="";
  const api=createMonthlyPlanApi(async()=>"synthetic-token",async(input,init)=>{url=String(input);body=JSON.parse(init!.body as string);return Response.json(monthlyPlanFixture);});
  await api.calculate("owner",{contribution_amount:"10000",confirm_empty:true});
  assert.ok(url.endsWith("/v2/monthly-plan"));assert.deepEqual(body,{contribution_amount:"10000",confirm_empty:true});
});
test("monthly API fails closed on incomplete success and stale portfolio",async()=>{
  await assert.rejects(createMonthlyPlanApi(async()=>"synthetic",async()=>Response.json({})).calculate("owner",{contribution_amount:"100"}),/could not be confirmed/);
  await assert.rejects(createMonthlyPlanApi(async()=>"synthetic",async()=>Response.json({}, {status:409})).calculate("owner",{contribution_amount:"100"}),/fresh look/);
});
const plan=()=>{const p=structuredClone(contributionFixture);p.plan.plan_basis="user_selected";return p;};
const access=(tracking:boolean):Entitlements=>({tier:"plus",status:"trial",effective_tier:"plus",private_beta:true,features:["live_portfolio","monthly_contribution_planner"],ask_monthly_limit:null,ask_usage:null,ask_usage_available:true,availability:{live_portfolio:tracking,monthly_checkin:true}});
for(const tracking of [true,false])test(`monthly initial UI tracking=${tracking} uses one current-value source`,()=>{
  const html=render(createElement(AccountAccessContext.Provider,{value:{value:access(tracking),error:"",retry(){}}},createElement(MonthlyInvesting,{value:plan(),userId:"owner",onPlanChange(){}})));
  assert.match(html,/Invest this month/);assert.match(html,/Review contribution/);
  assert.equal(html.includes("recorded portfolio supplies current values automatically"),tracking);
  assert.equal(html.includes("I have no investments yet"),!tracking);
  assert.doesNotMatch(html,/Mark as invested|scenario|localStorage/);
});
for(const path of ["foundation","short_term","historical"])test(`monthly ${path} path cannot expose completion or allocation form`,()=>{
  const p=plan();
  if(path==="foundation")p.plan.readiness.actionable_contribution_guidance_allowed=false;
  if(path==="short_term")p.plan={...p.plan,path:"short_term",selected_strategy:null,base_allocation:null,planning_return_pct:null};
  if(path==="historical")p.plan.plan_basis="historical_assessment";
  const html=render(createElement(MonthlyInvesting,{value:p,userId:"owner",onPlanChange(){}}));
  assert.match(html,/paused/);assert.doesNotMatch(html,/Contribution amount|Mark as invested|Review contribution/);
});
test("monthly UI has no browser financial persistence, allocation engine or holding mutation",()=>{
  const source=readFileSync("components/contributions/MonthlyInvesting.tsx","utf8");
  assert.doesNotMatch(source,/localStorage|sessionStorage|portfolioApi\.(save|capture|remove)|Math\.round/);
  assert.match(source,/monthlyPlanApi.calculate/);assert.match(source,/recordable_amount/);assert.match(source,/does not hold or carry it forward automatically/);
  assert.match(source,/rel="noopener noreferrer"/);assert.match(source,/href="#portfolio\/add"/);
});
