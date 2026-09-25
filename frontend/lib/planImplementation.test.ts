import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import { readFileSync } from "node:fs";
import { PLAN_OPTIONS, implementationGroups, planTargets, providerDestination } from "./planImplementation";
import { INVESTMENTS, providerName } from "./investmentIdentity";
import { contributionFixture } from "./contributions.test";
import { AccountAccessContext } from "../components/AccountAccess";
import type { Entitlements } from "./entitlements";
import { V2Destination } from "../components/PlanV2View";
import V2Home from "../components/app/V2Home";
import PlanImplementation from "../components/portfolio/PlanImplementation";
import PortfolioHistoryChart from "../components/portfolio/PortfolioHistoryChart";

const plan = () => { const value = structuredClone(contributionFixture); value.plan.plan_basis = "user_selected"; return value; };
const access = (plus: boolean, available: boolean): Entitlements => ({
  tier:plus?"plus":"free",status:plus?"trial":"active",effective_tier:plus?"plus":"free",private_beta:plus,
  features:plus?["live_portfolio","monthly_contribution_planner","profile_rebuild"]:[],
  ask_monthly_limit:plus?null:10,ask_usage:null,ask_usage_available:true,availability:{live_portfolio:available,monthly_checkin:false},
});
const withAccess = (plus: boolean, available: boolean, node: React.ReactNode) => render(createElement(AccountAccessContext.Provider,{value:{value:access(plus,available),error:"",retry(){}}},node));

test("implementation uses only nonzero user-selected targets, never old preferences", () => {
  const value = plan();
  value.plan.preference_result!.effective_target!.allocation.weights = [{role:"crypto",percentage_points:100}];
  assert.deepEqual(implementationGroups(value).map(g=>[g.role,g.percentage_points]),[["global_equity",80],["defensive",20]]);
  const original = structuredClone(value);
  implementationGroups(value);assert.deepEqual(value,original);
});
test("zero targets and dormant short-term selection produce no extra options", () => {
  const value = plan();
  if(value.plan.path === "long_term")value.plan.base_allocation=[{role:"global_equity",percentage_points:100},{role:"defensive",percentage_points:0}];
  assert.equal(implementationGroups(value).length,1);
  value.plan={...value.plan,path:"short_term",selected_strategy:null,base_allocation:null,planning_return_pct:null,dormant_selected_approach:"Growth"};
  assert.deepEqual(planTargets(value),[]);assert.deepEqual(implementationGroups(value),[]);
  assert.equal(render(createElement(PlanImplementation,{value})),"");
});
test("historical effective targets remain historical, including nonzero satellites", () => {
  const value = plan();value.plan.plan_basis="historical_assessment";
  value.plan.preference_result!.effective_target!.allocation.weights=[{role:"global_equity",percentage_points:65},{role:"technology_tilt",percentage_points:10},{role:"crypto",percentage_points:5},{role:"defensive",percentage_points:20}];
  assert.deepEqual(implementationGroups(value).map(g=>g.percentage_points),[65,10,5,20]);
  assert.match(render(createElement(PlanImplementation,{value})),/historical targets stay unchanged/);
});
test("foundation-first suppresses implementation links and monthly completion pressure", () => {
  const value = plan();value.plan.readiness={...value.plan.readiness,readiness:"foundation_first",actionable_contribution_guidance_allowed:false,message_requirement:"foundation_first"};
  assert.deepEqual(implementationGroups(value),[]);
  const html=withAccess(true,false,createElement(V2Destination,{value,userId:"test",active:"portfolio"}));
  assert.match(html,/Foundation First/);assert.doesNotMatch(html,/provider-open|Review this month|Mark as invested/);
});
test("short-term Portfolio preserves dormant path and hides long-term implementation", () => {
  const value=plan();value.plan={...value.plan,path:"short_term",selected_strategy:null,base_allocation:null,planning_return_pct:null,dormant_selected_approach:"Growth"};
  const html=withAccess(true,false,createElement(V2Destination,{value,userId:"test",active:"portfolio"}));
  assert.match(html,/dormant/);assert.doesNotMatch(html,/provider-open|Review this month/);
});
test("twelve supported options have identities and neutral alphabetical provider order", () => {
  const options=Object.values(PLAN_OPTIONS).flat();assert.equal(new Set(options.map(o=>o.product)).size,12);
  for(const group of Object.values(PLAN_OPTIONS)) {
    assert.deepEqual(group.map(o=>providerName(o.provider)),group.map(o=>providerName(o.provider)).sort());
    for(const option of group){assert.ok(INVESTMENTS[option.product]);assert.ok(providerDestination(option.provider));}
  }
});
test("official destinations fail closed for unknown providers or supplied URLs", () => {
  for(const key of ["https://evil.example","javascript:alert(1)","gotrade?next=x","ibkr","__proto__","constructor",""])assert.equal(providerDestination(key),null);
  for(const group of Object.values(PLAN_OPTIONS))for(const option of group){const url=new URL(providerDestination(option.provider)!);assert.equal(url.protocol,"https:");assert.equal(url.search,"");assert.equal(url.hash,"");}
});
test("external links name the provider and new tab with safe rel, no selection or ranking", () => {
  const html=render(createElement(PlanImplementation,{value:plan()}));
  assert.equal((html.match(/target="_blank" rel="noopener noreferrer"/g)??[]).length,6);
  assert.match(html,/Open GFunds \(opens in a new tab\)/);assert.match(html,/provider name, not ranked/);
  assert.doesNotMatch(html,/GCash \/|Recommended|best for|aria-pressed="true"|checked=""/);
});
test("return flow calls existing recording action only when provided", () => {
  const value=plan();const off=render(createElement(PlanImplementation,{value}));
  assert.doesNotMatch(off,/Record investment/);
  const on=render(createElement(PlanImplementation,{value,onRecord(){}}));
  assert.match(on,/Already invested/);assert.match(on,/Use \+ Add Investment above/);assert.doesNotMatch(on,/\+ Record investment/);assert.match(on,/does not place trades/);
});
for(const plus of [false,true])for(const available of [false,true])test(`Portfolio access: plus ${plus}, availability ${available}`,()=>{
  const html=withAccess(plus,available,createElement(V2Destination,{value:plan(),userId:"test",active:"portfolio"}));
  if(plus&&available){assert.match(html,/Loading your portfolio/);assert.match(html,/\+ Add Investment/);}
  else {assert.match(html,/Ways to invest/);assert.match(html,/Open GFunds/);assert.doesNotMatch(html,/\+ Add Investment|Loading your portfolio/);}
  if(!plus)assert.match(html,/Explore Arbor Plus/);
});
test("feature-OFF Portfolio keeps education primary; monthly investing belongs to Home", () => {
  const html=withAccess(true,false,createElement(V2Destination,{value:plan(),userId:"test",active:"portfolio"}));
  assert.match(html,/Ways to invest/);
  assert.doesNotMatch(html,/contribution-secondary|Contribution amount \(PHP\)|Review this month/);
  const home=withAccess(true,false,createElement(V2Home,{value:plan(),userId:"test"}));
  assert.match(home,/href="#home\/monthly"/);
});
test("explicit final allocation drives Ways to invest without changing the core",()=>{
  const value=plan();if(value.plan.path!=="long_term")throw Error("Expected long term");
  value.plan.final_allocation=[{role:"global_equity",percentage_points:80},{role:"technology_tilt",percentage_points:10},{role:"crypto",percentage_points:10},{role:"defensive",percentage_points:0}];
  assert.deepEqual(implementationGroups(value).map(g=>g.role),["global_equity","technology_tilt","crypto"]);
  assert.deepEqual(value.plan.base_allocation,[{role:"global_equity",percentage_points:80},{role:"defensive",percentage_points:20}]);
});
test("Portfolio primary tabs contain no monthly peer",()=>{
  const source=readFileSync("components/portfolio/LivePortfolio.tsx","utf8");
  assert.match(source,/\["holdings", "performance", "allocation", "history"\]/);
  assert.doesNotMatch(source,/showContribution|ContributionCard/);
});
test("Home always includes Portfolio while off and Free never reads holdings",()=>{
  for(const plus of [false,true]){
    const html=withAccess(plus,false,createElement(V2Home,{value:plan(),userId:"test"}));
    assert.match(html,/Portfolio overview/);assert.match(html,/home-history-empty/);assert.match(html,/Explore your portfolio/);
    assert.doesNotMatch(html,/Checking your recorded portfolio|\+ Add Investment/);
  }
  const freeOn=withAccess(false,true,createElement(V2Home,{value:plan(),userId:"test"}));
  assert.match(freeOn,/Tracking is part of Arbor Plus/);assert.doesNotMatch(freeOn,/Checking your recorded portfolio/);
});
test("compact Home chart preserves zero/one-point footprint, not artificial returns",()=>{
  for(const history of [[],[{day:"2026-09-25",value_php:"8000",captured_at:"2026-09-25T12:00:00Z"}]]){
    const html=render(createElement(PortfolioHistoryChart,{history,compact:true}));
    assert.match(html,/compact-chart/);assert.match(html,/chart-empty/);assert.doesNotMatch(html,/recharts-area|\+12|return percentage/);
  }
});
test("next action routes add-first-holding into existing catalogue; no backend priority rewrite",()=>{
  const source=readFileSync("components/PlanV2View.tsx","utf8");
  assert.match(source,/action.key === "add_first_holding" \? "portfolio\/add"/);
  const live=readFileSync("components/portfolio/LivePortfolio.tsx","utf8");
  assert.match(live,/section === "add" \? blank\(\) : null/);
  assert.doesNotMatch(readFileSync("components/app/V2Home.tsx","utf8"),/portfolioApi\.(save|capture|remove)/);
});
