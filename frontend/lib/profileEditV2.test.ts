import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import InvestmentProfileEditor, {ProfileEditReview} from "../components/InvestmentProfileEditor";
import {V2Destination} from "../components/PlanV2View";
import {editAnswers,editInputs,editSaveLabel,createProfileEditRequester} from "./profileEditV2";
import {isPlanV2} from "./planV2";
import {chatPlanKey} from "./chatSession";
import type {PlanV2} from "./types/planV2";

function fixture():PlanV2 {
  return {strategy_engine_version:"2.0",revision:"a".repeat(64),profile:{strategy_engine_version:"2.0",full_name:"Fixture",country:"Philippines",currency:"PHP",emergency_savings:"three_to_six_months",high_interest_debt:"none",goal_target:null,current_portfolio_value:0,monthly_investment:5000,horizon:"ten_plus_years",risk_response:"hold"},plan:{strategy_engine_version:"2.0",plan_basis:"historical_assessment",path:"long_term",selected_strategy:"Growth",base_allocation:[{role:"global_equity",percentage_points:80},{role:"defensive",percentage_points:20}],planning_return_pct:5,inflation_pct:3,
    selection:{risk_response:"hold",horizon:"ten_plus_years",requested_strategy:"Growth",selected_strategy:"Growth",horizon_maximum_strategy:"Aggressive",is_short_term:false,cap_applied:false,reason:"requested_strategy_retained"},readiness:{readiness:"ready",core_strategy_can_be_shown:true,actionable_contribution_guidance_allowed:true,technology_satellite_readiness_eligible:true,bitcoin_satellite_readiness_eligible:true,message_requirement:"none"}}};
}
test("editing prefills supported inputs, retains zero and optional goal, excludes private/internal fields",()=>{
  const answers=editAnswers(fixture().profile);
  assert.equal(answers.monthly_investment,"5000");assert.equal(answers.current_portfolio_value,"0");
  const input=editInputs(answers);assert.equal(input.goal_target,null);assert.equal(input.current_portfolio_value,0);
  assert.equal("selected_approach" in input,false);assert.equal("saved_preferences" in input,false);
  assert.throws(()=>editInputs({...answers,monthly_investment:"-1"}));
  assert.throws(()=>editInputs({...answers,horizon:"unknown"}));
});
test("editor starts unsaved with labelled prefilled questions and no automatic plan selection",()=>{
  const html=renderToStaticMarkup(createElement(InvestmentProfileEditor,{value:fixture(),userId:"fixture",onCancel:()=>{},onSaved:()=>{}}));
  for(const text of ["Review your investment profile","Preview changes","Cancel editing","Monthly contribution","5,000","current plan remains Growth"])assert.ok(html.includes(text));
  assert.doesNotMatch(html,/recommended for you|suitable portfolio|best plan for you|type="range"/i);
});
test("canonical review distinguishes answers, assessment, readiness and historical plan; no projection invented",()=>{
  const current=fixture(), proposed=fixture();proposed.profile.monthly_investment=8000;
  proposed.plan.selection.requested_strategy="Conservative";
  proposed.plan.readiness={...proposed.plan.readiness,readiness:"foundation_first",actionable_contribution_guidance_allowed:false};
  const html=renderToStaticMarkup(createElement(ProfileEditReview,{preview:{current,proposed}}));
  for(const text of ["Nothing has been saved","5,000","8,000","Conservative","Foundation First","No saved plan-choice change","historical plan","No exact duration or projected balance"])assert.ok(html.includes(text));
  assert.equal(editSaveLabel({current,proposed}),"Save profile changes");
  proposed.profile.selected_approach="Balanced";
  assert.equal(editSaveLabel({current,proposed}),"Save changes and use Balanced as my plan");
});
test("historical snapshots are validated separately from updated assessment and rejected if malformed",()=>{
  const value=fixture();value.historical_plan=structuredClone(value.plan);value.plan.historical_allocation_preserved=true;
  value.profile.risk_response="sell_all";value.plan.selection={...value.plan.selection,risk_response:"sell_all",requested_strategy:"Conservative",selected_strategy:"Conservative"};
  assert.ok(isPlanV2(value));
  assert.equal(isPlanV2({...value,historical_plan:{}}),false);
  assert.equal(isPlanV2({...value,historical_plan:{...value.historical_plan,base_allocation:[]}}),false);
});
test("dormant long-term choice is valid only with a short horizon, and review explains its restoration",()=>{
  const current=fixture(), proposed=fixture();
  proposed.profile.selected_approach="Growth";proposed.profile.horizon="less_than_3_years";
  proposed.plan={...proposed.plan,plan_basis:"user_selected",path:"short_term",selected_strategy:null,base_allocation:null,planning_return_pct:null,dormant_selected_approach:"Growth",
    selection:{...proposed.plan.selection,horizon:"less_than_3_years",selected_strategy:null,horizon_maximum_strategy:null,is_short_term:true,cap_applied:false,reason:"short_term_path"},
    preference_result:{effective_target:null,technology_tilt:{requested_percentage_points:0,effective_percentage_points:0,strategy_cap_percentage_points:null,reasons:[]},bitcoin:{requested_percentage_points:0,effective_percentage_points:0,strategy_cap_percentage_points:null,reasons:[]}}};
  assert.ok(isPlanV2(proposed));
  assert.equal(isPlanV2({...proposed,profile:{...proposed.profile,horizon:"ten_plus_years"}}),false);
  const html=renderToStaticMarkup(createElement(ProfileEditReview,{preview:{current,proposed}}));
  assert.match(html,/Growth remains saved but dormant/);assert.match(html,/no active long-term allocation/);
  const portfolio=renderToStaticMarkup(createElement(V2Destination,{value:proposed,active:"portfolio",userId:"fixture"}));
  assert.match(portfolio,/Long-term scenarios are paused/);assert.doesNotMatch(portfolio,/Calculate scenario|<form/);
});
test("malformed response fails safely without installing preview as a saved plan",async()=>{
  const value=fixture(),request=createProfileEditRequester(async()=>"fixture",async()=>Response.json({current:value,proposed:{}}));
  await assert.rejects(request(false,{inputs:editInputs(editAnswers(value.profile)),expected_revision:value.revision!,proposed_approach:null},"fixture",new AbortController().signal),/response was incomplete/);
});
for(const save of [false,true])test(`${save?"save":"preview"} uses authenticated narrow endpoint and canonical response`,async()=>{
  const current=fixture(),payload={inputs:editInputs(editAnswers(current.profile)),proposed_approach:null,expected_revision:current.revision!};
  let calls=0;
  const request=createProfileEditRequester(async owner=>{assert.equal(owner,"fixture");return "fixture-token";},async(url,init)=>{
    calls++;assert.ok(String(url).endsWith(save?"/v2/profiles/me":"/v2/profiles/preview"));assert.equal(init?.method,save?"PUT":"POST");
    assert.equal(new Headers(init?.headers).get("Authorization"),"Bearer fixture-token");assert.deepEqual(JSON.parse(String(init?.body)),payload);
    return Response.json(save?current:{current,proposed:current});
  });
  await request(save,payload,"fixture",new AbortController().signal);assert.equal(calls,1);
});
for(const [status,copy] of [[401,"session has expired"],[409,"saved profile changed"],[422,"Check your answers"],[503,"edits are still here"]] as const)test(`profile error ${status} is recoverable and sanitized`,async()=>{
  const value=fixture(), request=createProfileEditRequester(async()=>"fixture",async()=>new Response("private error",{status}));
  await assert.rejects(request(true,{inputs:editInputs(editAnswers(value.profile)),proposed_approach:null,expected_revision:value.revision!},"fixture",new AbortController().signal),error=>error instanceof Error&&error.message.includes(copy)&&!error.message.includes("private"));
});
test("cancel, compare, duplicate and stale-response guards remain local; save changes invalidate session state",()=>{
  const editor=readFileSync("components/InvestmentProfileEditor.tsx","utf8");
  assert.match(editor,/onClick=\{onCancel\}/);assert.match(editor,/if\(pending.current\)return/);
  assert.match(editor,/!signal.aborted/);assert.match(editor,/Compare approaches/);assert.match(editor,/Keep \{planChoiceLabel/);
  assert.doesNotMatch(editor,/localStorage|sessionStorage|console\.log/);
  assert.match(readFileSync("components/PlanV2View.tsx","utf8"),/ContributionCard key=\{`\$\{userId\}:\$\{JSON.stringify\(value\)\}`\}/);
  const current=fixture(),changed=fixture();changed.profile.monthly_investment=8000;
  assert.notEqual(chatPlanKey(current),chatPlanKey(changed));
});
