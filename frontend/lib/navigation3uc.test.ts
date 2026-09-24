import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import V2Home, { HomePlanContext } from "../components/app/V2Home";
import ProviderBrand from "../components/ProviderBrand";
import { V2Destination } from "../components/PlanV2View";
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
  for (const hash of ["#plan","#portfolio/plan","#portfolio/contribution","#portfolio/holdings"]) assert.equal(destinationFromHash(hash),"portfolio");
  assert.equal(destinationFromHash("#settings/plus"),"settings");
});
test("Home uses planning inputs without inventing projections or current balances", () => {
  const html = render(createElement(V2Home,{value,nextAction:createElement("button",null,"Next step")}));
  assert.match(html,/Your saved plan|Planned monthly contribution|Planning assumptions/);
  assert.doesNotMatch(html,/Planning return:|Plan Alignment|Current portfolio value|<form/);
  assert.equal((html.match(/<button/g) ?? []).length,1);
});
test("Home respects readiness and short-term state without manufacturing progress", () => {
  const foundation=structuredClone(value);foundation.plan.readiness.readiness="foundation_first";
  assert.match(render(createElement(HomePlanContext,{value:foundation})),/Contribution scenarios are paused/);
  const short=structuredClone(value);short.plan={...short.plan,path:"short_term",selected_strategy:null,base_allocation:null,planning_return_pct:null};
  assert.match(render(createElement(HomePlanContext,{value:short})),/short-term path is active/);
});
test("Home only mounts holdings reader for server availability AND entitlement", () => {
  for (const enabled of [false,true]) for (const entitled of [false,true]) {
    const entitlement={...access,features:entitled?access.features:[],availability:{live_portfolio:enabled}};
    const html=render(createElement(AccountAccessContext.Provider,{value:{value:entitlement,error:"",retry(){}}},createElement(V2Home,{value,userId:"test"})));
    assert.equal(html.includes("Checking your recorded portfolio"),enabled&&entitled);
  }
});
test("Free Portfolio keeps plan and implementation education with calm Plus destination", () => {
  const html=render(createElement(AccountAccessContext.Provider,{value:{value:{...access,features:[],effective_tier:"free"},error:"",retry(){}}},createElement(V2Destination,{value,userId:"test",active:"portfolio",section:"contribution"})));
  assert.match(html,/Your model targets|Explore implementation options|Explore Arbor Plus/);
  assert.doesNotMatch(html,/Calculate scenario|Add holding/);
});
test("provider fallback is visible accessible text without remote or invented logos", () => {
  const html=render(createElement(ProviderBrand,{provider:"pdax",name:"PDAX"}));
  assert.match(html,/>PDAX</);assert.doesNotMatch(html,/<img|https:/);
});
test("navigation preserves chat but saved plan changes reset context; Home never captures", () => {
  const shell=readFileSync("components/PlanV2View.tsx","utf8");
  assert.match(shell,/chatVisited && <div hidden=/);
  assert.match(shell,/ChatSection key=\{`\$\{userId\}:\$\{JSON.stringify\(value\)\}`\}/);
  assert.doesNotMatch(readFileSync("components/app/V2Home.tsx","utf8"),/portfolioApi\.(save|capture|remove)/);
});
