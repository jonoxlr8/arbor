import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import V2Home, { HomePlanContext } from "../components/app/V2Home";
import ProviderBrand from "../components/ProviderBrand";
import { V2Destination, V2PlanContent } from "../components/PlanV2View";
import { AccountAccessContext } from "../components/AccountAccess";
import { contributionFixture } from "./contributions.test";
import type { Entitlements } from "./entitlements";
import { destinationFromHash, destinations } from "./appNavigation";
import { readFileSync } from "node:fs";

const value = structuredClone(contributionFixture);
value.plan.plan_basis = "user_selected";
const render = renderToStaticMarkup;
const access: Entitlements = { tier:"plus",status:"trial",effective_tier:"plus",private_beta:true,features:["live_portfolio","monthly_contribution_planner"],ask_monthly_limit:null,ask_usage:null,ask_usage_available:true,availability:{live_portfolio:false} };
test("four destinations include fully labeled mobile Ask Arbor and legacy bookmarks resolve", () => {
  assert.deepEqual(destinations.map(d => d.label), ["Home","Portfolio","Ask Arbor","Settings"]);
  assert.ok(destinations.every(d => d.label === d.mobileLabel));
  for (const hash of ["#portfolio/contribution","#portfolio/holdings"]) assert.equal(destinationFromHash(hash),"portfolio");
  for (const hash of ["#plan", "#portfolio/plan", "#home/plan"]) assert.equal(destinationFromHash(hash), "home");
  assert.equal(destinationFromHash("#settings/plus"),"settings");
});
test("Home uses planning inputs without inventing projections or current balances", () => {
  const html = render(createElement(V2Home,{value}));
  assert.match(html,/Your saved plan|Monthly contribution|Your plan/);
  assert.doesNotMatch(html,/Planning return:|Plan Alignment|Current portfolio value|<form/);
  assert.match(html,/Set a goal/);
  assert.doesNotMatch(html,/YOUR NEXT STEP|Keep your plan in view/);
});
test("Home respects readiness and short-term state without manufacturing progress", () => {
  const foundation=structuredClone(value);foundation.plan.readiness.readiness="foundation_first";
  assert.match(render(createElement(HomePlanContext,{value:foundation})),/Contribution previews are paused/);
  const short=structuredClone(value);short.plan={...short.plan,path:"short_term",selected_strategy:null,base_allocation:null,planning_return_pct:null};
  assert.match(render(createElement(HomePlanContext,{value:short})),/Short-term path/);
});
test("Home only mounts holdings reader for server availability AND entitlement", () => {
  for (const enabled of [false,true]) for (const entitled of [false,true]) {
    const entitlement={...access,features:entitled?access.features:[],availability:{live_portfolio:enabled}};
    const html=render(createElement(AccountAccessContext.Provider,{value:{value:entitlement,error:"",retry(){}}},createElement(V2Home,{value,userId:"test"})));
    assert.equal(html.includes("Checking your recorded portfolio"),enabled&&entitled);
  }
});
test("Free Portfolio keeps implementation education without repeating plan details", () => {
  const html=render(createElement(AccountAccessContext.Provider,{value:{value:{...access,features:[],effective_tier:"free"},error:"",retry(){}}},createElement(V2Destination,{value,userId:"test",active:"portfolio",section:"contribution"})));
  assert.match(html,/Ways to invest/);
  assert.match(html,/#home\/plan/);
  assert.doesNotMatch(html,/portfolio-plan-details/);
  assert.doesNotMatch(html,/Calculate scenario|Add holding/);
});
test("provider logo preserves visible accessible text without remote logo URLs", () => {
  const html=render(createElement(ProviderBrand,{provider:"pdax",name:"PDAX"}));
  assert.match(html,/>PDAX</);assert.match(html,/aria-hidden="true"/);assert.match(html,/data-glyph="exchange"/);assert.doesNotMatch(html,/https:|<img/);
});
test("navigation preserves chat but saved plan changes reset context; Home never captures", () => {
  const shell=readFileSync("components/PlanV2View.tsx","utf8");
  assert.match(shell,/chatVisited && <div hidden=/);
  assert.match(shell,/ChatSection key=\{`\$\{userId\}:\$\{JSON.stringify\(value\)\}`\}/);
  assert.doesNotMatch(readFileSync("components/app/V2Home.tsx","utf8"),/portfolioApi\.(save|capture|remove)/);
});

test("expanded Plan Sheet exposes assumptions and saved context without inventing a forecast", () => {
 const html=render(createElement(V2PlanContent,{value,expanded:true}));
 assert.match(html,/Planning assumptions<\/h3>/);assert.match(html,/Planning return:/);
 assert.doesNotMatch(html,/<summary[^>]*>Planning assumptions/);
 assert.match(html,/Your goal and timeframe/);assert.match(html,/not investments already recorded/);
 assert.match(html,/does not contain a projected future amount/);
 assert.match(html,/actual returns vary and investments can lose value/);
 const empty=structuredClone(value);empty.profile.goal_target=null;empty.profile.goal_name=null;empty.profile.goal_date=null;empty.profile.monthly_investment=null;
 assert.match(render(createElement(V2PlanContent,{value:empty,expanded:true})),/No goal name set/);
 assert.match(render(createElement(V2PlanContent,{value:empty,expanded:true})),/Not set/);
});
