import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import HomeGoal from "../components/app/HomeGoal";
import { AccountAccessContext } from "../components/AccountAccess";
import type { PlanV2 } from "./types/planV2";
import type { LivePortfolioData } from "./livePortfolio";

const plan = {profile:{goal_target:500000,goal_name:null,goal_date:null,monthly_investment:2000},
  plan:{path:"long_term",plan_basis:"user_selected",readiness:{actionable_contribution_guidance_allowed:true}}} as PlanV2;
const holdings = (known_value_php: string, complete=true) => ({known_value_php,complete,holdings:[]}) as unknown as LivePortfolioData;
const access = (plus: boolean) => ({value:{features:plus?["future_projection"]:[],effective_tier:plus?"plus":"free"},error:"",retry:()=>{}}) as never;
const markup = (value: PlanV2, portfolio: LivePortfolioData | null, plus=false) => renderToStaticMarkup(
  createElement(AccountAccessContext.Provider,{value:access(plus)},createElement(HomeGoal,{value,portfolio})));

test("historical goal names are not invented and no holdings is genuine zero progress",()=>{
  const text = markup(plan,holdings("0"));
  assert.match(text,/Your goal/);
  assert.match(text,/₱0/);
  assert.match(text,/of ₱500,000/);
  assert.match(text,/0\.0% complete/);
  assert.match(text,/Explore Arbor Plus/);
});
test("complete, exceeded and incomplete goal progress stay distinct",()=>{
  const named = {...plan,profile:{...plan.profile,goal_name:"Home"}} as PlanV2;
  assert.match(markup(named,holdings("106000")),/21\.2% complete/);
  assert.match(markup(named,holdings("550000")),/110\.0% complete/);
  const incomplete = markup(named,holdings("106000",false));
  assert.match(incomplete,/Known progress/);
  assert.doesNotMatch(incomplete,/21\.2% complete/);
});
test("no valuation does not claim zero progress and Plus needs a target date",()=>{
  assert.match(markup(plan,null,true),/Checking your recorded portfolio/);
  assert.match(markup(plan,holdings("0"),true),/Add a target date/);
});
test("goal, monthly action and projection retain the intended reading order",()=>{
  const text = renderToStaticMarkup(createElement(AccountAccessContext.Provider,{value:access(true)},
    createElement(HomeGoal,{value:plan,portfolio:holdings("0"),monthly:createElement("a",{href:"#home/monthly"},"Monthly contribution")})));
  assert.ok(text.indexOf('id="home-goal-title"') < text.indexOf("Monthly contribution"));
  assert.ok(text.indexOf("Monthly contribution") < text.indexOf('id="home-projection-title"'));
});
test("only the entitled projection is marked Arbor Plus; basic goal progress is not",()=>{
  const plus = markup(plan, holdings("0"), true);
  assert.match(plus, /class="eyebrow plus-eyebrow">Arbor Plus<\/p><h2 id="home-projection-title"/);
  assert.doesNotMatch(plus, /<section class="home-goal"[^>]*>\s*<p class="eyebrow plus-eyebrow"/);
  const free = markup(plan, holdings("0"));
  assert.doesNotMatch(free, /class="eyebrow plus-eyebrow"/);
});
