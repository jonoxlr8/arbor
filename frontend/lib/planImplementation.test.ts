import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import { readFileSync } from "node:fs";
import { PLAN_OPTIONS, implementationGroups, planTargets, providerDestination } from "./planImplementation";
import { INVESTMENTS, investmentMark, providerName } from "./investmentIdentity";
import InvestmentCatalogue from "../components/portfolio/InvestmentCatalogue";
import { contributionFixture } from "./contributions.test";
import { AccountAccessContext } from "../components/AccountAccess";
import type { Entitlements } from "./entitlements";
import { V2Destination, V2PlanContent } from "../components/PlanV2View";
import V2Home from "../components/app/V2Home";
import PlanImplementation from "../components/portfolio/PlanImplementation";
import PortfolioHistoryChart from "../components/portfolio/PortfolioHistoryChart";
import { entryDraftError } from "./livePortfolio";
import { manilaInvestmentToday } from "./investmentEntries";

const plan = () => { const value = structuredClone(contributionFixture); value.plan.plan_basis = "user_selected"; return value; };
const access = (plus: boolean, available: boolean): Entitlements => ({
  tier:plus?"plus":"free",status:plus?"trial":"active",effective_tier:plus?"plus":"free",private_beta:plus,
  features:plus?["live_portfolio","monthly_contribution_planner","profile_rebuild","plan_alignment"]:["live_portfolio"],
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
  assert.match(render(createElement(V2PlanContent,{value})),/Foundation First/);assert.doesNotMatch(html,/provider-open|Review this month|Mark as invested/);
});
test("short-term Portfolio preserves dormant path and hides long-term implementation", () => {
  const value=plan();value.plan={...value.plan,path:"short_term",selected_strategy:null,base_allocation:null,planning_return_pct:null,dormant_selected_approach:"Growth"};
  const html=withAccess(true,false,createElement(V2Destination,{value,userId:"test",active:"portfolio"}));
  assert.match(render(createElement(V2PlanContent,{value})),/dormant/);assert.doesNotMatch(html,/provider-open|Review this month/);
});
test("twelve supported options have identities and neutral alphabetical provider order", () => {
  const options=Object.values(PLAN_OPTIONS).flat();assert.equal(new Set(options.map(o=>o.product)).size,12);
  for(const group of Object.values(PLAN_OPTIONS)) {
    assert.deepEqual(group.map(o=>providerName(o.provider)),group.map(o=>providerName(o.provider)).sort());
    for(const option of group){assert.ok(INVESTMENTS[option.product]);assert.ok(providerDestination(option.provider));}
  }
});
test("all twelve catalogue pairs accept only user-entered date, units and actual PHP paid", () => {
  const options=Object.values(PLAN_OPTIONS).flat();
  for (const option of options) {
    const catalog=[{product_id:option.product,provider:option.provider,provider_name:providerName(option.provider),
      display_name:INVESTMENTS[option.product].fullName,sleeve:"global_equity" as const,price_kind:"reference" as const}];
    const draft={product_id:option.product,provider:option.provider,investment_date:manilaInvestmentToday(),
      units:option.product.endsWith("_btc") ? "0.00012345" : "0.5",amount_paid_php:"1650.50",idempotency_key:"fixture"};
    assert.equal(entryDraftError(draft,catalog),null,option.product);
    assert.match(entryDraftError({...draft,amount_paid_php:null},catalog)!,/actual PHP amount/,option.product);
    assert.match(entryDraftError({...draft,units:""},catalog)!,/actual units/,option.product);
    assert.match(entryDraftError({...draft,provider:"wrong"},catalog)!,/supported/,option.product);
  }
});
test("Ways to invest and Add Investment share every canonical product and provider identity", () => {
  const value = plan();
  if (value.plan.path !== "long_term") throw Error("Expected long-term plan");
  value.plan.final_allocation = [
    { role: "global_equity", percentage_points: 40 }, { role: "defensive", percentage_points: 30 },
    { role: "technology_tilt", percentage_points: 20 }, { role: "crypto", percentage_points: 10 },
  ];
  const ways = render(createElement(PlanImplementation, { value }));
  const choices = Object.values(PLAN_OPTIONS).flat();
  const catalogue = render(createElement(InvestmentCatalogue, { catalog: choices.map(option => ({
    product_id: option.product, provider: option.provider, provider_name: providerName(option.provider),
    display_name: INVESTMENTS[option.product].fullName, sleeve: "global_equity" as const, price_kind: "reference" as const,
  })), onSelect() {} }));
  assert.equal(choices.length, 12);
  for (const option of choices) {
    const tone = investmentMark(option.product).tone;
    const product = option.product.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const [surface, html, tag] of [["Ways", ways, "li"], ["Add", catalogue, "button"]] as const) {
      const row = html.match(new RegExp(`<${tag}[^>]*data-product="${product}"[^>]*>[\\s\\S]*?<\\/${tag}>`))?.[0];
      assert.ok(row, `${surface} missing ${option.product}`);
      assert.match(row, new RegExp(`data-identity="${tone}"`));
      assert.match(row, new RegExp(`data-provider="${option.provider}"`));
    }
  }
});
test("official destinations fail closed for unknown providers or supplied URLs", () => {
  for(const key of ["https://evil.example","javascript:alert(1)","gotrade?next=x","ibkr","__proto__","constructor",""])assert.equal(providerDestination(key),null);
  for(const group of Object.values(PLAN_OPTIONS))for(const option of group){const url=new URL(providerDestination(option.provider)!);assert.equal(url.protocol,"https:");assert.equal(url.search,"");assert.equal(url.hash,"");}
});
test("external links name the provider and new tab with safe rel, no selection or ranking", () => {
  const html=render(createElement(PlanImplementation,{value:plan()}));
  assert.equal((html.match(/target="_blank" rel="noopener noreferrer"/g)??[]).length,6);
  assert.equal((html.match(/class="provider-open" href="https:\/\//g)??[]).length,6);
  assert.match(html,/Open GFunds \(opens in a new tab\)/);assert.match(html,/provider name, not ranked/);
  assert.match(html, /href="#home\/plan"[^>]*>Plan details/);
  assert.doesNotMatch(html, /href="#home\/plan"[^>]*target="_blank"/);
  assert.doesNotMatch(html,/GCash \/|Recommended|best for|aria-pressed="true"|checked=""/);
});
test("Ways launchers keep Home and Portfolio navigation inside Arbor", () => {
  const home=withAccess(true,false,createElement(V2Home,{value:plan(),userId:"test"}));
  assert.match(home, /href="#portfolio\/ways"[^>]*>Ways to invest/);
  assert.doesNotMatch(home, /href="#portfolio\/ways"[^>]*target="_blank"/);
  const portfolio=readFileSync("components/portfolio/LivePortfolio.tsx","utf8");
  assert.match(portfolio, /<a href="#portfolio\/ways" data-sheet-launcher="ways">/);
});
test("return flow calls existing recording action only when provided", () => {
  const value=plan();const off=render(createElement(PlanImplementation,{value}));
  assert.doesNotMatch(off,/Record investment/);
  const on=render(createElement(PlanImplementation,{value,onRecord(){}}));
  assert.match(on,/Already invested/);assert.match(on,/Use \+ Add Investment above/);assert.doesNotMatch(on,/\+ Record investment/);assert.match(on,/does not place trades/);
});
for(const plus of [false,true])for(const available of [false,true])test(`Portfolio access: plus ${plus}, availability ${available}`,()=>{
  const html=withAccess(plus,available,createElement(V2Destination,{value:plan(),userId:"test",active:"portfolio"}));
  if(available){assert.match(html,/Loading your portfolio/);assert.match(html,/\+ Add Investment/);}
  else {assert.match(html,/Ways to invest/);assert.match(html,/Open GFunds/);assert.doesNotMatch(html,/\+ Add Investment|Loading your portfolio/);}
  if(!available)assert.match(html,/tracking is temporarily unavailable/i);
});
test("feature-OFF Portfolio keeps education primary; Home has one shared planning Sheet shortcut", () => {
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
test("Portfolio is holdings-first with secondary history and Plus insights",()=>{
  const source=readFileSync("components/portfolio/LivePortfolio.tsx","utf8");
  assert.match(source,/section id="section-holdings"/);
  assert.match(source,/Portfolio insights/);
  assert.match(source,/Investment activity/);
  assert.doesNotMatch(source,/portfolio-tabs|setTab\(/);
  assert.doesNotMatch(source,/showContribution|ContributionCard/);
});
test("Home always includes Portfolio while off and Free can read basic holdings",()=>{
  for(const plus of [false,true]){
    const html=withAccess(plus,false,createElement(V2Home,{value:plan(),userId:"test"}));
    assert.match(html,/Portfolio overview/);assert.match(html,/home-history-empty/);assert.match(html,/Explore your portfolio/);
    assert.doesNotMatch(html,/Checking your recorded portfolio|\+ Add Investment/);
  }
  const freeOn=withAccess(false,true,createElement(V2Home,{value:plan(),userId:"test"}));
  assert.match(freeOn,/Checking your recorded portfolio/);assert.doesNotMatch(freeOn,/Tracking is part of Arbor Plus/);
});
test("compact Home chart keeps a visible flat-line frame without artificial returns",()=>{
  for(const history of [[],[{day:"2026-09-25",value_php:"8000",captured_at:"2026-09-25T12:00:00Z"}]]){
    const html=render(createElement(PortfolioHistoryChart,{history,compact:true}));
    assert.match(html,/compact-chart/);assert.match(html,/chart-plot/);assert.doesNotMatch(html,/Portfolio value change|\+12|return percentage/);
  }
});
test("Home omits the duplicate next-step banner; Portfolio still opens the existing catalogue",()=>{
  const source=readFileSync("components/PlanV2View.tsx","utf8");
  assert.doesNotMatch(source,/<NextActionCard/);
  const live=readFileSync("components/portfolio/LivePortfolio.tsx","utf8");
  assert.match(live,/section === "add" \? null : undefined/);
  assert.match(live,/DatedInvestmentFlow/);
  assert.doesNotMatch(readFileSync("components/app/V2Home.tsx","utf8"),/portfolioApi\.(save|capture|remove)/);
});
