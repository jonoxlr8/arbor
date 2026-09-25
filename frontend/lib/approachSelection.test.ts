import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ApproachSelection, { ApproachOptions, InvestingProfileSummary, validApproaches } from "../components/ApproachSelection";
import { V2Destination } from "../components/PlanV2View";
import PreferencesV2 from "../components/PreferencesV2";
import { createApproachRequester } from "./profileV2Api";
import { isPlanV2 } from "./planV2";
import type { PlanV2, ProfileV2Input } from "./types/planV2";

const input: ProfileV2Input = {strategy_engine_version:"2.0",full_name:"Test",country:"Philippines",currency:"PHP",emergency_savings:"three_to_six_months",high_interest_debt:"none",goal_target:null,current_portfolio_value:0,monthly_investment:0,horizon:"ten_plus_years",risk_response:"sell_all",selected_approach:"Growth",saved_preferences:{technology_tilt:20,bitcoin:20}};
const options = {assessment:{requested_strategy:"Conservative" as const,is_short_term:false},approaches:[
  {strategy:"Conservative" as const,allocation:[{role:"global_equity",percentage_points:40},{role:"defensive",percentage_points:60}],planning_return_pct:4},
  {strategy:"Balanced" as const,allocation:[{role:"global_equity",percentage_points:60},{role:"defensive",percentage_points:40}],planning_return_pct:4.5},
  {strategy:"Growth" as const,allocation:[{role:"global_equity",percentage_points:80},{role:"defensive",percentage_points:20}],planning_return_pct:5},
  {strategy:"Aggressive" as const,allocation:[{role:"global_equity",percentage_points:100},{role:"defensive",percentage_points:0}],planning_return_pct:5.5},
]};
test("investing profile summarizes answers without assigning a model or inventing a goal",()=>{
  const html=renderToStaticMarkup(createElement(InvestingProfileSummary,{input,assessment:options.assessment}));
  assert.match(html,/Your investing profile/);
  assert.match(html,/10\+ years/);
  assert.match(html,/Conservative/);
  assert.match(html,/Not set yet/);
  assert.match(html,/No plan has been selected for you/);
  assert.doesNotMatch(html,/Risk Score|recommended|satellite/i);
});
function selected(): PlanV2 {
  return {strategy_engine_version:"2.0",profile:{...input},plan:{strategy_engine_version:"2.0",plan_basis:"user_selected",path:"long_term",selected_strategy:"Growth",base_allocation:[{role:"global_equity",percentage_points:80},{role:"defensive",percentage_points:20}],planning_return_pct:5,inflation_pct:3,
    selection:{risk_response:"sell_all",horizon:"ten_plus_years",requested_strategy:"Conservative",selected_strategy:"Conservative",horizon_maximum_strategy:"Aggressive",is_short_term:false,cap_applied:false,reason:"requested_strategy_retained"},
    readiness:{readiness:"ready",core_strategy_can_be_shown:true,actionable_contribution_guidance_allowed:true,technology_satellite_readiness_eligible:true,bitcoin_satellite_readiness_eligible:true,message_requirement:"none"},
    preference_result:{technology_tilt:{requested_percentage_points:0,effective_percentage_points:0,strategy_cap_percentage_points:10,reasons:[]},bitcoin:{requested_percentage_points:0,effective_percentage_points:0,strategy_cap_percentage_points:5,reasons:[]},effective_target:{strategy_engine_version:"2.0",base_strategy:"Growth",allocation:{weights:[{role:"global_equity",percentage_points:80},{role:"defensive",percentage_points:20},{role:"technology_tilt",percentage_points:0},{role:"crypto",percentage_points:0}]}}}}};
}
test("approach comparison uses returned canonical models, no selection or recommendation",()=>{
  assert.ok(validApproaches(options));
  const html=renderToStaticMarkup(createElement(ApproachOptions,{options,selected:"",onSelect:()=>{}}));
  assert.equal((html.match(/aria-pressed="false"/g)||[]).length,4);
  for(const name of ["Conservative","Balanced","Growth","Aggressive"])assert.ok(html.includes(name));
  assert.match(html,/informational profile/);assert.match(html,/not a plan selection/);assert.match(html,/Projections are hypothetical/);
  assert.doesNotMatch(html,/recommended for you|best for you|suitable for you|Arbor recommends/i);
});
test("short term shows an explicit path choice without long term options",()=>{
  const html=renderToStaticMarkup(createElement(ApproachOptions,{options:{...options,assessment:{...options.assessment,is_short_term:true}},selected:"",onSelect:()=>{}}));
  assert.match(html,/Short-term planning/);assert.doesNotMatch(html,/80%|Planning return assumption/);
});
test("initial chooser cannot save or silently preselect and communicates progress",()=>{
  const html=renderToStaticMarkup(createElement(ApproachSelection,{input,userId:"test",onComplete:()=>{},onBack:()=>{}}));
  assert.match(html,/Loading approaches/);assert.match(html,/Understand/);
  assert.doesNotMatch(html,/Use this as my plan|aria-pressed="true"/);
});
test("malformed options fail closed, including null records and weights",()=>{
  for(const bad of [null,{}, {...options,approaches:[null,...options.approaches.slice(1)]},{...options,approaches:[{...options.approaches[0],allocation:[null,null]},...options.approaches.slice(1)]},{...options,approaches:Array(4).fill(options.approaches[0])}])assert.equal(validApproaches(bad),false);
});
test("selected plan may differ from assessment; historical preferences do not change standard target",()=>{
  const value=selected();assert.ok(isPlanV2(value));
  const html=renderToStaticMarkup(createElement(V2Destination,{value,active:"portfolio"}));
  assert.match(html,/Your plan/);assert.match(html,/80%/);assert.match(html,/20%/);
  assert.deepEqual(value.profile.saved_preferences,{technology_tilt:20,bitcoin:20});
  assert.doesNotMatch(html,/Effective target allocation|recommended for you/);
  const bad=structuredClone(value);bad.plan.preference_result!.effective_target!.allocation.weights[0].percentage_points=70;bad.plan.preference_result!.effective_target!.allocation.weights[1].percentage_points=30;
  assert.equal(isPlanV2(bad),false);
  assert.equal(isPlanV2({...value,profile:{...value.profile,selected_approach:null}}),false);
});
test("historical plan requires explicit selection before scenario UI",()=>{
  const value=selected();delete value.plan.plan_basis;delete value.profile.selected_approach;
  const html=renderToStaticMarkup(createElement(V2Destination,{value,active:"portfolio",userId:"test"}));
  assert.match(html,/Checking your Arbor access/);assert.doesNotMatch(html,/<form|Calculate scenario/);
});
test("historical request and effective values are explicitly labeled as earlier assessment data",()=>{
  const value=selected();
  value.plan.preference_result!.technology_tilt.reasons=["strategy_cap"];
  const html=renderToStaticMarkup(createElement(PreferencesV2,{value,historical:true}));
  assert.match(html,/Saved historical requests/);
  assert.match(html,/Earlier effective allocation/);
  assert.match(html,/earlier assessment capped this request at 10%/);
  assert.doesNotMatch(html,/Arbor can currently apply|Your strategy allows/);
});
test("navigation dismisses the unsaved approach chooser",()=>{
  const source=readFileSync("components/PlanV2View.tsx","utf8");
  assert.match(source,/if \(previousDestination !== active\) \{\s*setPreviousDestination\(active\);\s*setChoosing\(false\);/);
});
for(const path of ["approaches","plan-preview","profiles/approach"] as const)test(`authenticated ${path} uses explicit payload and normal ownership token`,async()=>{
  let calls=0;
  const request=createApproachRequester(async owner=>{assert.equal(owner,"test");return "fixture-token";},async(url,init)=>{
    calls++;assert.ok(String(url).endsWith(`/v2/${path}`));assert.equal(init?.method,path==="profiles/approach"?"PUT":"POST");
    assert.equal(new Headers(init?.headers).get("Authorization"),"Bearer fixture-token");assert.deepEqual(JSON.parse(String(init?.body)),input);
    return Response.json(path==="approaches"?options:selected());
  });
  await request(path,input,"test",new AbortController().signal);assert.equal(calls,1);
});
for(const status of [401,422,503])test(`approach API ${status} does not expose raw errors`,async()=>{
  const request=createApproachRequester(async()=>"fixture",async()=>new Response("private details",{status}));
  await assert.rejects(request("profiles/approach",input,"test",new AbortController().signal),error=>error instanceof Error&&!error.message.includes("private"));
});
test("selection save only occurs inside explicit action, guarded against duplicate and stale responses",()=>{
  const source=readFileSync("components/ApproachSelection.tsx","utf8");
  const effect=source.slice(source.indexOf("useEffect(() =>"),source.indexOf("function payload"));
  assert.doesNotMatch(effect,/createV2Profile|profiles\/approach/);
  assert.match(source,/if \(!selected \|\| !preview \|\| pending.current\) return/);
  assert.match(source,/!controller.signal.aborted/);
  assert.doesNotMatch(source,/localStorage|sessionStorage|console\.log/);
});
