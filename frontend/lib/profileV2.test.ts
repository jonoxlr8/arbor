import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PlanV2View, { V2Destination, V2PlanContent } from "../components/PlanV2View";
import { isPlanV2 } from "./planV2";
import { createV2ProfileCreator, isAccountPlan } from "./profileV2Api";
import { createProfileReader } from "./api";
import { createAccountRecovery, InvalidSessionError, type AccountState } from "./accountRecovery";
import type { AccountPlan, PlanV2, ProfileV2Input } from "./types/planV2";
import type { Plan } from "./types/plan";

const input: ProfileV2Input = {strategy_engine_version:"2.0", full_name:"A", country:"Philippines", currency:"PHP", emergency_savings:"three_to_six_months", high_interest_debt:"none", goal_target:null, current_portfolio_value:0, monthly_investment:0, horizon:"ten_plus_years", risk_response:"hold"};
function fixture(): PlanV2 {
  return {strategy_engine_version:"2.0", profile:{...input}, plan:{strategy_engine_version:"2.0", path:"long_term", selected_strategy:"Growth", base_allocation:[{role:"global_equity",percentage_points:80},{role:"defensive",percentage_points:20}], planning_return_pct:5, inflation_pct:3,
    selection:{risk_response:"hold",horizon:"ten_plus_years",requested_strategy:"Growth",horizon_maximum_strategy:"Aggressive",selected_strategy:"Growth",is_short_term:false,cap_applied:false,reason:"requested_strategy_retained"},
    readiness:{readiness:"ready",core_strategy_can_be_shown:true,actionable_contribution_guidance_allowed:true,technology_satellite_readiness_eligible:true,bitcoin_satellite_readiness_eligible:true,message_requirement:"none"}}};
}
const legacy: Plan = {profile:{full_name:"Legacy",country:"Philippines",currency:"PHP",risk_tolerance:"Balanced",goal_target:100,investment_horizon:10,monthly_investment:0,current_portfolio_value:0},portfolio:[],explanation:{summary:"Plan",reasons:[]},projection:{starting_value:0,projected_value:0,investment_period_years:10,assumed_return:.08,monthly_contribution:0,required_monthly_investment:1,yearly_projection:[]}};
const html = (value: PlanV2) => renderToStaticMarkup(createElement(V2PlanContent,{value}));

test("v2 restored plan uses the shared desktop/mobile shell and destinations", () => {
  const markup = renderToStaticMarkup(createElement(PlanV2View,{value:fixture(),onSignOut:()=>{},signingOut:false,logoutError:""}));
  assert.match(markup, /aria-label="Primary navigation"/);
  assert.match(markup, /aria-label="Mobile navigation"/);
  for (const destination of ["home", "portfolio", "ask", "settings"]) assert.ok(markup.includes(`href="#${destination}"`));
  assert.doesNotMatch(markup, /href="#plan"/);
  const page = readFileSync("app/page.tsx", "utf8");
  assert.match(page, /if \(isPlanV2\(account.plan\)\) return <PlanV2View/);
  assert.match(page, /return <ResultsDashboard key=\{account.userId\}/);
});
test("v2 unsupported destinations remain safe; settings preserves appearance and profile", () => {
  for (const active of ["portfolio"] as const) {
    const markup = renderToStaticMarkup(createElement(V2Destination, { value: fixture(), active }));
    assert.match(markup, /Your historical plan remains saved/);
    assert.match(markup, /href="#settings\/investment"/);
    assert.doesNotMatch(markup, /Add Holding|Send message/);
  }
  const settings = renderToStaticMarkup(createElement(V2Destination, { value: fixture(), active: "settings" }));
  assert.match(settings, /Appearance/);
  assert.match(settings, /Philippines/);
  const source = readFileSync("components/PlanV2View.tsx", "utf8");
  assert.doesNotMatch(source, /ResultsDashboard|HoldingsSection|EditProfileForm|getMyPortfolioHealth|calculate/);
  assert.match(source, /useSyncExternalStore\(subscribeNavigation, navigationSnapshot, serverNavigationSnapshot\)/);
});

test("numeric v2 contract is recognized; malformed or unknown tagged plans cannot fall back to v1", () => {
  assert.ok(isPlanV2(fixture()));
  assert.ok(isAccountPlan(legacy));
  assert.ok(isAccountPlan(fixture()));
  for (const change of [{planning_return_pct:"5"}, {base_allocation:[]}, {inflation_pct:NaN}, {readiness:{}}, {selection:{}}]) {
    assert.equal(isPlanV2({...fixture(),plan:{...fixture().plan,...change}}),false);
  }
  assert.equal(isAccountPlan({...legacy,strategy_engine_version:"2.0"}),false);
  assert.equal(isAccountPlan({...legacy,strategy_engine_version:"3.0"}),false);
});
test("long-term plan renders backend allocation and planning assumption", () => {
  const markup = html(fixture());
  assert.match(markup,/Growth/);
  assert.match(markup,/80%/); assert.match(markup,/20%/);
  assert.match(markup,/Planning return: 5.0%/);
  assert.match(markup,/not a forecast or guarantee/);
});
test("Foundation First preserves Aggressive preview without contribution action", () => {
  const value = fixture();
  if(value.plan.path !== "long_term") throw Error("fixture");
  value.plan.selected_strategy = "Aggressive";
  value.plan.readiness = {...value.plan.readiness,readiness:"foundation_first",actionable_contribution_guidance_allowed:false,technology_satellite_readiness_eligible:false,bitcoin_satellite_readiness_eligible:false,message_requirement:"foundation_first"};
  const markup = html(value);
  assert.match(markup,/Aggressive · preview/);
  assert.match(markup,/Foundation First/);
  assert.match(markup,/contribution allocations are paused/);
  assert.doesNotMatch(markup, /Create contribution|Invest now/);
});
test("Getting Ready notes core continuation and the beta boundary", () => {
  const value = fixture();
  value.plan.readiness = {...value.plan.readiness,readiness:"getting_ready",bitcoin_satellite_readiness_eligible:false,message_requirement:"readiness_caution"};
  assert.match(html(value),/financial-foundation consideration/);
  assert.match(html(value),/do not assess whether an investment is right for you/);
});
test("short-term contract and view contain no long-term allocation or return", () => {
  const value = fixture();
  value.profile.horizon = "less_than_3_years";
  value.plan = {...value.plan,path:"short_term",selected_strategy:null,base_allocation:null,planning_return_pct:null,
    selection:{...value.plan.selection,horizon:"less_than_3_years",selected_strategy:null,horizon_maximum_strategy:null,is_short_term:true,cap_applied:false,reason:"short_term_path"}};
  assert.ok(isPlanV2(value));
  assert.match(html(value),/A short-term path/);
  assert.doesNotMatch(html(value),/Conservative strategy|Base strategy allocation|Planning return:/);
  assert.equal(isPlanV2({...value,plan:{...value.plan,planning_return_pct:0}}),false);
});
test("cap explanation uses returned requested/selected strategy and horizon", () => {
  const value = fixture();
  value.plan.selection = {...value.plan.selection,requested_strategy:"Aggressive",horizon:"five_to_ten_years",cap_applied:true,reason:"horizon_capped"};
  assert.match(html(value),/Aggressive volatility comfort; the horizon check for 5–10 years returned Growth/);
});
test("v2 POST sends only answers to dedicated endpoint with authenticated token", async () => {
  const create = createV2ProfileCreator(async user => {assert.equal(user,"A");return "test-token";},async(url, options) => {
    assert.ok(String(url).endsWith("/v2/profiles"));
    assert.equal(options?.method,"POST");
    assert.equal(new Headers(options?.headers).get("Authorization"),"Bearer test-token");
    assert.deepEqual(JSON.parse(options?.body as string),input);
    return Response.json(fixture());
  });
  assert.deepEqual(await create(input,"A"),fixture());
});
test("v2 creation timeout aborts and reconciles once without repeat POST", async () => {
  let posts=0, reads=0; let signal:AbortSignal | undefined;
  const create = createV2ProfileCreator(async()=>"token",async(_url,options)=>{posts++;signal=options?.signal ?? undefined;return new Promise(()=>{});},async()=>{reads++;return fixture();},5);
  assert.ok(isPlanV2(await create(input,"A")));
  assert.equal(posts,1);assert.equal(reads,1);assert.equal(signal?.aborted,true);
});
test("uncertain save returns explicit error and user Retry may succeed", async () => {
  let fail=true;
  const create = createV2ProfileCreator(async()=>"token",async()=>{if(fail)throw Error("private db");return Response.json(fixture());},async()=>null,5);
  await assert.rejects(create(input,"A"),/couldn’t confirm your saved plan/);
  fail=false; assert.deepEqual(await create(input,"A"),fixture());
});
test("v2 422 and 401 are friendly; no automatic resubmission/reconciliation",async()=>{
  for(const status of [401,422]){
    let reads=0;
    const create=createV2ProfileCreator(async()=>"token",async()=>Response.json({detail:"private"},{status}),async()=>{reads++;return null;});
    await assert.rejects(create(input,"A"),error=>!String(error).includes("private") && (status!==401 || error instanceof InvalidSessionError));
    assert.equal(reads,0);
  }
});
test("account/unmount cancellation stops creation without a recovery read",async()=>{
  let reads=0;
  const controller=new AbortController();
  const create=createV2ProfileCreator(async()=>"token",async()=>new Promise(()=>{}),async()=>{reads++;return fixture();});
  const pending=create(input,"A",controller.signal);controller.abort();
  await assert.rejects(pending,/cancelled/);assert.equal(reads,0);
});
test("v2 creator preserves an existing v1 response instead of migrating it",async()=>{
  const create=createV2ProfileCreator(async()=>"token",async()=>Response.json(legacy));
  assert.deepEqual(await create(input,"A"),legacy);
});
test("shared recovery restores either version and keeps genuinely missing profile distinct",async()=>{
  for(const saved of [legacy,fixture(),null]){
    const states:AccountState<AccountPlan>[]=[];
    const owner=createAccountRecovery<AccountPlan>({getUser:async()=>({id:"A"}),getProfile:async()=>saved,onState:s=>states.push(s),onIdentityChange:()=>{}});
    await owner.restore();
    const last=states.at(-1);
    assert.equal(last?.status,saved?"ready":"no-profile");
    if(last?.status==="ready")assert.deepEqual(last.plan,saved);
    owner.signedOut();assert.equal(states.at(-1)?.status,"unauthenticated");
    await owner.restore();assert.equal(states.at(-1)?.status,saved?"ready":"no-profile");
  }
});
test("v2 profile read preserves single auth refresh and rejects malformed success",async()=>{
  let calls=0;const refresh:(boolean | undefined)[]=[];
  const read=createProfileReader<AccountPlan>(async(_user,force)=>{refresh.push(force);return "token";},async()=>++calls===1?Response.json({}, {status:401}):Response.json(fixture()),12000,isAccountPlan);
  assert.deepEqual(await read("A","known-token"),fixture());
  assert.deepEqual(refresh,[true]);assert.equal(calls,2);
  await assert.rejects(createProfileReader<AccountPlan>(async()=>"token",async()=>Response.json({strategy_engine_version:"2.0"}),10,isAccountPlan)("A"),/incomplete/);
});
test("onboarding keeps pending/cancellation guards and no browser persistence",()=>{
  const source=readFileSync("components/OnboardingV2.tsx","utf8");
  const selection=readFileSync("components/ApproachSelection.tsx","utf8");
  assert.ok(selection.includes("pending.current"));
  assert.ok(selection.includes("!controller.signal.aborted"));
  assert.ok(selection.includes("owner.current?.abort()"));
  assert.ok(source.includes("setStep(step - 1)"));
  assert.doesNotMatch(source,/localStorage|sessionStorage|console\.log/);
});
