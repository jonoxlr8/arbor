import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountAccessContext, ComparePlans, PlusFeature } from "../components/AccountAccess";
import type { Entitlements } from "./entitlements";

const free: Entitlements = { tier:"free", status:"active", effective_tier:"free", private_beta:false,
  features:["live_portfolio","plan_creation","basic_implementation"], ask_monthly_limit:10,
  ask_usage:null, ask_usage_available:true, availability:{live_portfolio:true,monthly_checkin:true} };
const plus: Entitlements = {...free, tier:"plus", status:"trial", effective_tier:"plus", private_beta:true,
  features:[...free.features,"monthly_contribution_planner","plan_alignment","future_projection","ask_arbor_full"], ask_monthly_limit:null};
const source = (path: string) => readFileSync(path,"utf8");

test("Plus gate labels planning without rendering Plus content to Free", () => {
  const child = createElement("span",null,"private monthly payload");
  const render = (value: Entitlements) => renderToStaticMarkup(createElement(AccountAccessContext.Provider,
    {value:{value,error:"",retry:()=>{}}}, createElement(PlusFeature,{feature:"monthly_contribution_planner",title:"Monthly plan"},child)));
  assert.match(render(free),/Arbor Plus/);
  assert.doesNotMatch(render(free),/private monthly payload/);
  assert.match(render(plus),/private monthly payload/);
});

test("Monthly pending is outside the Plus gate and absent from Home", () => {
  const shell = source("components/PlanV2View.tsx");
  const home = source("components/app/V2Home.tsx");
  assert.match(shell, /<MonthlyPendingRecording userId=\{userId\}\/><PlusFeature feature="monthly_contribution_planner"/);
  assert.doesNotMatch(home,/PendingRecordingResume|pendingToRecord/);
  assert.match(source("components/contributions/MonthlyInvesting.tsx"),/className="eyebrow plus-eyebrow">Arbor Plus/);
  assert.match(source("components/contributions/PendingRecordingResume.tsx"),/Finish recording your investment/);
});

test("Plus labels identify gated insights, not core tracking or Learn", () => {
  const portfolio = source("components/portfolio/LivePortfolio.tsx");
  assert.match(portfolio, /<PlusFeature feature="plan_alignment" title="Portfolio insights">/);
  assert.doesNotMatch(portfolio.slice(portfolio.indexOf('id="section-holdings"'),portfolio.indexOf('<PortfolioPlanningTools/>')),/plus-eyebrow/);
  const tools=source("components/portfolio/PortfolioPlanningTools.tsx");
  assert.equal((tools.match(/Arbor Plus/g)||[]).length,3);
  assert.match(tools, /href="#portfolio\/insights"[^>]+aria-haspopup="dialog"/);
  assert.doesNotMatch(source("components/dashboard/LearnSection.tsx"),/plus-eyebrow/);
  const settings = renderToStaticMarkup(createElement(ComparePlans,{value:plus}));
  assert.match(settings,/Current plan: Arbor Plus Trial/);
  assert.doesNotMatch(settings,/checkout|credit card number|renewal date/i);
});
