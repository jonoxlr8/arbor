import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FinalPlanReview } from "../components/PlanCustomization";
import HomeBudget from "../components/app/HomeBudget";
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
  assert.match(text,/0\.0% of target/);
  assert.doesNotMatch(text,/Explore Arbor Plus|What If/);
});
test("complete, exceeded and incomplete goal progress stay distinct",()=>{
  const named = {...plan,profile:{...plan.profile,goal_name:"Home"}} as PlanV2;
  assert.match(markup(named,holdings("106000")),/21\.2% of target/);
  assert.match(markup(named,holdings("550000")),/110\.0% of target/);
  const incomplete = markup(named,holdings("106000",false));
  assert.match(incomplete,/Known progress/);
  assert.doesNotMatch(incomplete,/21\.2% of target/);
});
test("no valuation does not claim zero progress or mount a projection on Home",()=>{
  assert.match(markup(plan,null,true),/Checking your recorded portfolio/);
  assert.doesNotMatch(markup(plan,holdings("0"),true),/home-projection|What If/);
});
test("goal and factual monthly context retain reading order without projection",()=>{
  const text = renderToStaticMarkup(createElement(AccountAccessContext.Provider,{value:access(true)},
    createElement(HomeGoal,{value:plan,portfolio:holdings("0"),monthly:createElement("a",{href:"#home/monthly"},"Monthly contribution")})));
  assert.ok(text.indexOf('id="home-goal-title"') < text.indexOf("Monthly contribution"));
  assert.doesNotMatch(text,/home-projection-title/);
});
test("Home goal stays basic and has no duplicated Plus promotion",()=>{
  for(const plus of [false,true])assert.doesNotMatch(markup(plan,holdings("0"),plus),/plus-eyebrow|Arbor Plus|Explore What If/);
});

test("unset budget and explicit zero render distinctly in Home and final review", () => {
  for (const amount of [null, 0]) {
    const value = {...plan, profile:{...plan.profile, monthly_investment:amount}, plan:{...plan.plan, path:"short_term"}} as PlanV2;
    const budget = renderToStaticMarkup(createElement(HomeBudget,{value}));
    const review = renderToStaticMarkup(createElement(FinalPlanReview,{value}));
    assert.match(budget, amount === null ? /Not set yet/ : /₱0/);
    assert.match(review, amount === null ? /Not set yet/ : /₱0/);
  }
});

test("goal visual compares recorded values with the target and optional saved date, without a forecast",()=>{
 const dated={...plan,profile:{...plan.profile,goal_target:3000000,goal_date:"2036-09-30"}} as PlanV2;
 const text=markup(dated,holdings("124800"));
 assert.match(text,/4\.2% of target/);assert.match(text,/recorded value/);assert.match(text,/Target date · Sep 2036/);
 assert.doesNotMatch(text,/on track|projected|forecast/i);
 assert.doesNotMatch(markup(dated,holdings("124800",false)),/4\.2% of target/);
});
