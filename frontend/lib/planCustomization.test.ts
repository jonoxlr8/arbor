import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import { readFileSync } from "node:fs";
import { CORE_CUSTOMIZATION, FinalPlanReview, PlanCustomization } from "../components/PlanCustomization";
import InvestmentProfileEditor from "../components/InvestmentProfileEditor";
import PlanCreated from "../components/PlanCreated";
import { isPlanV2 } from "./planV2";
import { planTargets } from "./planImplementation";
import { isMatchingPlanPreview } from "./profileV2Api";
import { editAnswers, editInputs, editSaveLabel, createProfileEditRequester } from "./profileEditV2";
import type { ExplicitCustomization, PlanV2 } from "./types/planV2";

function fixture(choice: ExplicitCustomization = { technology_tilt: 10, bitcoin: 10 }): PlanV2 {
  return {
    strategy_engine_version:"2.0", revision:"a".repeat(64),
    profile:{strategy_engine_version:"2.0",full_name:"Alex",country:"Philippines",currency:"PHP",emergency_savings:"three_to_six_months",high_interest_debt:"none",goal_target:null,current_portfolio_value:0,monthly_investment:10000,horizon:"ten_plus_years",risk_response:"hold",selected_approach:"Aggressive",explicit_customization:{...choice},saved_preferences:{technology_tilt:20,bitcoin:20},implementation_choices:{}},
    plan:{strategy_engine_version:"2.0",plan_basis:"user_selected",path:"long_term",selected_strategy:"Aggressive",base_allocation:[{role:"global_equity",percentage_points:100},{role:"defensive",percentage_points:0}],planning_return_pct:5.5,inflation_pct:3,
      selection:{risk_response:"hold",horizon:"ten_plus_years",requested_strategy:"Growth",selected_strategy:"Growth",horizon_maximum_strategy:"Aggressive",is_short_term:false,cap_applied:false,reason:"requested_strategy_retained"},
      readiness:{readiness:"ready",core_strategy_can_be_shown:true,actionable_contribution_guidance_allowed:true,technology_satellite_readiness_eligible:true,bitcoin_satellite_readiness_eligible:true,message_requirement:"none"},
      customization:{...choice,provenance:"user_selected"},
      final_allocation:[{role:"global_equity",percentage_points:100-choice.technology_tilt-choice.bitcoin},{role:"defensive",percentage_points:0},{role:"technology_tilt",percentage_points:choice.technology_tilt},{role:"crypto",percentage_points:choice.bitcoin}],
      preference_result:{technology_tilt:{requested_percentage_points:0,effective_percentage_points:0,strategy_cap_percentage_points:20,reasons:[]},bitcoin:{requested_percentage_points:0,effective_percentage_points:0,strategy_cap_percentage_points:10,reasons:[]},effective_target:{strategy_engine_version:"2.0",base_strategy:"Aggressive",allocation:{weights:[{role:"global_equity",percentage_points:100},{role:"defensive",percentage_points:0},{role:"technology_tilt",percentage_points:0},{role:"crypto",percentage_points:0}]}}}},
  };
}

for (const choice of [{technology_tilt:0,bitcoin:0},{technology_tilt:10,bitcoin:0},{technology_tilt:0,bitcoin:10},{technology_tilt:5,bitcoin:5},{technology_tilt:10,bitcoin:10}] as ExplicitCustomization[]) {
  test(`explicit ${choice.technology_tilt}/${choice.bitcoin} accepts canonical final targets, without reinterpreting historical fields`, () => {
    const value=fixture(choice);assert.ok(isPlanV2(value));
    assert.deepEqual(value.profile.saved_preferences,{technology_tilt:20,bitcoin:20});
    assert.equal(value.plan.preference_result!.technology_tilt.effective_percentage_points,0);
    assert.deepEqual(planTargets(value),value.plan.final_allocation!.filter(w=>w.percentage_points>0));
  });
}
test("backend final review shows 80/10/10 and explicit source, never an assessment recommendation",()=>{
  const html=render(createElement(FinalPlanReview,{value:fixture()}));
  for(const label of ["Aggressive","80%","10%","Global Equity","Technology","Bitcoin","You chose this allocation","Technology and Bitcoin were added by you"])assert.ok(html.includes(label));
  assert.doesNotMatch(html,/recommended|suitable|Defensive/);
});
test("core None/None is complete and does not invent optional sleeves",()=>{
  const html=render(createElement(FinalPlanReview,{value:fixture(CORE_CUSTOMIZATION)}));
  assert.match(html,/100%/);assert.match(html,/core plan is unchanged/);
  assert.equal(CORE_CUSTOMIZATION.technology_tilt,0);assert.equal(CORE_CUSTOMIZATION.bitcoin,0);
});
test("customization has only six accessible radio choices with None defaults and neutral help",()=>{
  const html=render(createElement(PlanCustomization,{approach:"Aggressive",value:CORE_CUSTOMIZATION,onChange(){}}));
  assert.equal((html.match(/type="radio"/g)||[]).length,6);
  assert.equal((html.match(/checked=""/g)||[]).length,2);
  assert.equal((html.match(/value="0"/g)||[]).length,2);
  for(const text of ["core plan is complete as-is","larger price swings","Defensive target stays unchanged","already own many technology"])assert.ok(html.includes(text));
  assert.doesNotMatch(html,/type="range"|type="number"|recommended|suitable/i);
});
test("a returned model with Defensive preserves it in the final contract",()=>{
  const value=fixture();value.profile.selected_approach="Growth";
  if(value.plan.path!=="long_term")throw Error();
  value.plan.selected_strategy="Growth";value.plan.base_allocation=[{role:"global_equity",percentage_points:80},{role:"defensive",percentage_points:20}];
  value.plan.preference_result!.effective_target!.base_strategy="Growth";
  value.plan.preference_result!.effective_target!.allocation.weights[0].percentage_points=80;
  value.plan.preference_result!.effective_target!.allocation.weights[1].percentage_points=20;
  value.plan.final_allocation![0].percentage_points=60;value.plan.final_allocation![1].percentage_points=20;
  assert.ok(isPlanV2(value));
  value.plan.final_allocation![0].percentage_points=70;value.plan.final_allocation![1].percentage_points=10;
  assert.equal(isPlanV2(value),false);
});
test("missing final allocation, provenance or inconsistent final targets fail closed",()=>{
  for(const alter of [
    (v:PlanV2)=>{v.plan.final_allocation=null;},
    (v:PlanV2)=>{v.plan.customization=null;},
    (v:PlanV2)=>{v.plan.customization!.provenance="historical" as "user_selected";},
    (v:PlanV2)=>{v.plan.final_allocation![0].percentage_points=90;},
    (v:PlanV2)=>{v.plan.final_allocation![0].percentage_points=-1;},
    (v:PlanV2)=>{v.plan.final_allocation![2].percentage_points=5;v.plan.final_allocation![0].percentage_points=85;},
    (v:PlanV2)=>{v.profile.explicit_customization!.bitcoin=20 as 10;},
    (v:PlanV2)=>{v.profile.explicit_customization!.bitcoin="10" as unknown as 10;},
  ]){const value=fixture();alter(value);assert.equal(isPlanV2(value),false);}
});
test("old user-selected responses remain valid and no new choices are fabricated",()=>{
  const value=fixture();delete value.profile.explicit_customization;delete value.plan.customization;delete value.plan.final_allocation;
  assert.ok(isPlanV2(value));assert.deepEqual(planTargets(value),[{role:"global_equity",percentage_points:100}]);
  value.profile.explicit_customization=null;value.plan.customization=null;value.plan.final_allocation=null;assert.ok(isPlanV2(value));
});
test("preview response must match the exact choices sent",()=>{
  const value=fixture();assert.ok(isMatchingPlanPreview(value,value.profile));
  assert.equal(isMatchingPlanPreview(value,{...value.profile,selected_approach:"Balanced"}),false);
  assert.equal(isMatchingPlanPreview(value,{...value.profile,explicit_customization:{technology_tilt:0,bitcoin:0}}),false);
});
test("normal profile editing does not resubmit customization or implementation metadata",()=>{
  const value=fixture();value.profile.implementation_choices={crypto:"pdax_btc"};
  const inputs=editInputs(editAnswers(value.profile));
  assert.equal("explicit_customization" in inputs,false);assert.equal("implementation_choices" in inputs,false);assert.equal("saved_preferences" in inputs,false);
});
test("same approach plus changed customization is a plan change; explicit 0/0 may restore core",()=>{
  const current=fixture(),proposed=fixture(CORE_CUSTOMIZATION);
  assert.equal(editSaveLabel({current,proposed}),"Save changes and use Aggressive as my plan");
});
test("implementation metadata is recognized only for the correct supported sleeve/product",()=>{
  const value=fixture();value.profile.implementation_choices={global_equity:"gotrade_vt",technology_tilt:"gotrade_vgt",crypto:"pdax_btc"};assert.ok(isPlanV2(value));
  value.profile.implementation_choices={crypto:"gotrade_vt"};assert.equal(isPlanV2(value),false);
  value.profile.implementation_choices={crypto:"arbitrary"};assert.equal(isPlanV2(value),false);
});
test("settings Change Plan enters the explicit chooser, not a preselected or automatically saved model",()=>{
  const html=render(createElement(InvestmentProfileEditor,{value:fixture(),userId:"fixture",initialMode:"plan",onCancel(){},onSaved(){}}));
  assert.match(html,/Loading approaches/);assert.match(html,/Cancel editing/);assert.doesNotMatch(html,/aria-pressed="true"|Use this as my plan/);
});
test("preview/cancel/save remains server-bound, versioned and free of financial browser persistence",async()=>{
  const value=fixture();let requests=0;
  const request=createProfileEditRequester(async()=>"fixture-token",async(_url,init)=>{
    requests++;const body=JSON.parse(String(init?.body));assert.deepEqual(body.explicit_customization,CORE_CUSTOMIZATION);assert.equal(body.expected_revision,value.revision);
    return Response.json({current:value,proposed:fixture(CORE_CUSTOMIZATION)});
  });
  await request(false,{inputs:editInputs(editAnswers(value.profile)),proposed_approach:"Aggressive",expected_revision:value.revision!,explicit_customization:CORE_CUSTOMIZATION},"fixture",new AbortController().signal);
  assert.equal(requests,1);
  for(const path of ["components/ApproachSelection.tsx","components/InvestmentProfileEditor.tsx","components/PlanCustomization.tsx"]){const source=readFileSync(path,"utf8");assert.doesNotMatch(source,/localStorage|sessionStorage|100\s*-|base_allocation.*map|console\.log/);}
});
test("confirmed long-term plan points to Ways while Foundation First points Home",()=>{
  const value=fixture();assert.match(render(createElement(PlanCreated,{value,onContinue(){}})),/See ways to invest/);
  value.plan.readiness.actionable_contribution_guidance_allowed=false;
  const html=render(createElement(PlanCreated,{value,onContinue(){}}));assert.match(html,/Go to Home/);assert.doesNotMatch(html,/See ways to invest/);
});
