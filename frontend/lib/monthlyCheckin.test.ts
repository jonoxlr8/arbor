import test from "node:test";
import assert from "node:assert/strict";
import {createElement} from "react";
import React from "react";
import {renderToStaticMarkup as render} from "react-dom/server";
import {MonthlyCheckin,MonthlySummary} from "../components/MonthlyCheckin";
import PlanCreated from "../components/PlanCreated";
import {AccountAccessContext} from "../components/AccountAccess";
import {createMonthlyApi,validMonthly,monthLabel,checkinDate,checkinAmountInput,type MonthlyState} from "./monthlyCheckin";
import {contributionFixture} from "./contributions.test";
import {isNextAction} from "./nextAction";
import type {Entitlements} from "./entitlements";

const pending:MonthlyState={month:"2026-09",current:null,history:[]};
const row={month:"2026-09",amount_php:"5000.25",completed_at:"2026-09-24T23:30:00Z",undone_at:null};
const complete:MonthlyState={...pending,current:row,history:[row]};
function findElement(node: React.ReactNode, predicate: (element: React.ReactElement<Record<string, unknown>>) => boolean): React.ReactElement<Record<string, unknown>> | undefined {
 if (Array.isArray(node)) return node.map(child=>findElement(child,predicate)).find(Boolean);
 if (!React.isValidElement<Record<string, unknown>>(node)) return undefined;
 return predicate(node) ? node : findElement(node.props.children as React.ReactNode,predicate);
}
for (const [scenarioAmount, expected] of [["10000","10000.00"],["10000.0","10000.00"],["10000.00","10000.00"],["10000.000","10000.00"],["10000.5","10000.50"],["10000.500","10000.50"],["999.999",""]]) {
 test(`confirmation initializes actual amount input from ${scenarioAmount}`,t=>{
  // Exercise the component's click/cancel handlers with isolated hook state.
  // Effects are disabled: no browser auth or hosted reads/writes in unit tests.
  const states:unknown[]=[pending,"",0,null,"",false];let cursor=0;
  t.mock.method(React,"useState",((initial:unknown)=>{const i=cursor++;return [i in states?states[i]:initial,(value:unknown)=>{states[i]=value;}];}) as typeof React.useState);
  t.mock.method(React,"useRef",((value:unknown)=>({current:value})) as typeof React.useRef);
  t.mock.method(React,"useEffect",()=>{});
  t.mock.method(React,"useContext",()=>({value:{availability:{monthly_checkin:true},features:["monthly_contribution_planner"]}}));
  const value=structuredClone(contributionFixture);value.plan.plan_basis="user_selected";
  const child=MonthlyCheckin({value,userId:"fixture",scenarioAmount});assert.ok(child);
  const props=child.props;
  const activity=child.type as (componentProps:typeof props)=>React.ReactNode;
  const draw=()=>{cursor=0;return activity(props);};
  const button=findElement(draw(),el=>el.type==="button"&&el.props.children==="Submit monthly contribution");assert.ok(button);
  (button.props.onClick as ()=>void)();
  const input=findElement(draw(),el=>el.type==="input");assert.ok(input);
  assert.equal(input.props.value,expected);assert.equal(input.props.required,true);
  if(!expected)assert.match(String(states[1]),/amount you actually invested/);
  const cancel=findElement(draw(),el=>el.type==="button"&&el.props.children==="Cancel");assert.ok(cancel);
  (cancel.props.onClick as ()=>void)();assert.equal(findElement(draw(),el=>el.type==="input"),undefined);
 });
}
for (const [input, expected] of [["10000","10000.00"],["10000.0","10000.00"],["10000.00","10000.00"],["10000.000","10000.00"],["10000.5","10000.50"],["10000.500","10000.50"],["999.999",""],["0.01000","0.01"],["999999999999.99000","999999999999.99"]]) {
 test(`check-in form normalizes ${input} without rounding planner amounts`,()=>{
  assert.equal(checkinAmountInput(input),expected);
 });
}
test("check-in prefill rejects invalid, nonpositive, out-of-range and meaningful sub-cent amounts",()=>{
 for(const input of ["", "NaN", "Infinity", "-1", "1e4", "1,000", "0", "0.000", "0.001", "1000000000000", "999.999"])
  assert.equal(checkinAmountInput(input),"");
});
test("normalized preview amount survives the existing confirmation API contract",async()=>{
 let sent:unknown;
 const normalized=checkinAmountInput("10000.000");
 const record={...row,amount_php:normalized};
 const api=createMonthlyApi(async()=>"fixture",async(_url,init)=>{
  sent=JSON.parse(String(init?.body));return new Response(JSON.stringify({...pending,current:record,history:[record]}));
 });
 const result=await api("A",new AbortController().signal,"complete",{month:pending.month,amount_php:normalized});
 assert.deepEqual(sent,{month:pending.month,amount_php:"10000.00"});
 assert.equal(result.current?.amount_php,"10000.00");
});
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
 assert.match(html,/Your plan is ready|You chose/);assert.match(html,/See ways to invest/);assert.match(html,/does not place trades/);
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
