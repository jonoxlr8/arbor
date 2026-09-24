import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createPortfolioApi, isPortfolio, validHolding, freshnessText, portfolioValues, scenarioAvailability, type LivePortfolioData } from "./livePortfolio";
import LivePortfolio, { PortfolioSummary, PlanAlignment } from "../components/portfolio/LivePortfolio";
import PortfolioHistoryChart from "../components/portfolio/PortfolioHistoryChart";
import ContributionCard from "../components/contributions/ContributionCard";
import { contributionFixture } from "./contributions.test";
import { PlusFeature, AccountAccessContext } from "../components/AccountAccess";
import type { Entitlements } from "./entitlements";
import { isEntitlements } from "./entitlements";
import { V2Destination } from "../components/PlanV2View";

export const portfolioFixture: LivePortfolioData = {
  currency:"PHP",complete:true,known_value_php:"5600.00",total_value_php:"5600.00",unavailable_count:0,stale_count:0,
  provider_values_php:{gotrade:"5600.00"},valued_at:"2026-09-24T00:00:00Z", history:[],
  catalog:[{product_id:"gotrade_vt",provider:"gotrade",provider_name:"Gotrade",display_name:"VT",sleeve:"global_equity",price_kind:"reference"}],
  holdings:[{id:"fixture",product_id:"gotrade_vt",provider:"gotrade",provider_name:"Gotrade",display_name:"VT",sleeve:"global_equity",price_kind:"reference",units:"1",cost_basis_php:null,value_php:"5600.00",freshness:"fresh",as_of:"2026-09-24T00:00:00Z",updated_at:"2026-09-24T00:00:00Z"}],
  sleeves:[{sleeve:"global_equity",known_value_php:"5600.00",current_percentage:"100",target_percentage:80,difference_pp:"20"},
    {sleeve:"defensive",known_value_php:"0.00",current_percentage:"0",target_percentage:20,difference_pp:"-20"},
    {sleeve:"technology_tilt",known_value_php:"0.00",current_percentage:"0",target_percentage:0,difference_pp:"0"},
    {sleeve:"crypto",known_value_php:"0.00",current_percentage:"0",target_percentage:0,difference_pp:"0"}],
};
const html=(component: Parameters<typeof renderToStaticMarkup>[0])=>renderToStaticMarkup(component);
for (const enabled of [undefined, false, true]) test(`server availability ${enabled} selects live or manual path independently of Plus`,()=>{
  const value = structuredClone(contributionFixture); value.plan.plan_basis="user_selected";
  const access: Entitlements = {tier:"plus",status:"trial",effective_tier:"plus",private_beta:true,
    features:["live_portfolio","monthly_contribution_planner"],ask_monthly_limit:null,ask_usage:null,ask_usage_available:true,
    ...(enabled === undefined ? {} : {availability:{live_portfolio:enabled}})};
  assert.ok(isEntitlements(access));
  const markup=html(createElement(AccountAccessContext.Provider,{value:{value:access,error:"",retry:()=>{}}},
    createElement(V2Destination,{value,active:"portfolio",userId:"test"})));
  assert.equal(markup.includes("Hypothetical current values"),enabled!==true);
  assert.doesNotMatch(markup,/Add holding|Explore Arbor Plus/);
  assert.equal(isEntitlements({...access,availability:{live_portfolio:"true"}}),false);
});
test("portfolio contract requires complete typed decimal data",()=>{
  assert.ok(isPortfolio(portfolioFixture));
  for(const value of [null,{}, {...portfolioFixture,known_value_php:5600}, {...portfolioFixture,sleeves:[]}, {...portfolioFixture,holdings:[{}]}]) assert.equal(isPortfolio(value),false);
});
test("holdings entry validates supported pairs and sensible decimal precision",()=>{
  const draft={provider:"gotrade",product_id:"gotrade_vt",units:"0.012345678901",cost_basis_php:null};
  assert.ok(validHolding(draft,portfolioFixture.catalog));
  for(const units of ["0","-1","NaN","Infinity","0.0000000000001","1e3",""]) assert.equal(validHolding({...draft,units},portfolioFixture.catalog),false);
  assert.equal(validHolding({...draft,provider:"pdax"},portfolioFixture.catalog),false);
  assert.equal(validHolding({...draft,product_id:"AAPL"},portfolioFixture.catalog),false);
  assert.equal(validHolding({...draft,cost_basis_php:"1.001"},portfolioFixture.catalog),false);
});
test("summary uses PHP grouping and distinguishes partial/stale totals",()=>{
  const markup=html(createElement(PortfolioSummary,{portfolio:{...portfolioFixture,complete:false,unavailable_count:1,stale_count:1}}));
  assert.match(markup,/₱5,600/);assert.match(markup,/not the complete portfolio value/);assert.match(markup,/cached prices/);
  assert.doesNotMatch(markup,/Buy|Sell|NaN|Guaranteed/);
});
test("alignment is a signed comparison not a health score",()=>{
  const markup=html(createElement(PlanAlignment,{portfolio:portfolioFixture}));
  assert.match(markup,/Plan Alignment/);assert.match(markup,/-20.00pp/);assert.match(markup,/100.00%/);assert.match(markup,/not a score/);
});
test("unavailable alignment is not displayed as zero",()=>{
  const p={...portfolioFixture,sleeves:portfolioFixture.sleeves.map(s=>({...s,current_percentage:null,difference_pp:null,target_percentage:null}))};
  const markup=html(createElement(PlanAlignment,{portfolio:p}));
  assert.match(markup,/Not applicable/);assert.match(markup,/Unavailable/);assert.doesNotMatch(markup,/0.00%/);
});
test("history has no fake points and one observed value is readable",()=>{
  assert.match(html(createElement(PortfolioHistoryChart,{history:[]})),/graph will appear/);
  const markup=html(createElement(PortfolioHistoryChart,{history:[{day:"2026-09-24",value_php:"5600.00",captured_at:"2026-09-24T00:00:00Z"}]}));
  assert.match(markup,/₱5,600/);assert.match(markup,/not an investment-return chart/);assert.match(markup,/recorded values \(1\)/);
});
test("freshness distinguishes NAV, cached reference and missing price",()=>{
  const h=portfolioFixture.holdings[0];
  assert.match(freshnessText(h),/Reference price/);
  assert.match(freshnessText({...h,price_kind:"nav"}),/Latest NAV/);
  assert.match(freshnessText({...h,freshness:"stale"}),/Cached/);
  assert.match(freshnessText({...h,as_of:null}),/unavailable/);
});
test("canonical holdings replace manual sleeve and ownership inputs; explicit options remain",()=>{
  assert.deepEqual(portfolioValues(portfolioFixture),{global_equity:"5600.00",defensive:"0.00",technology_tilt:"0.00",crypto:"0.00"});
  const markup=html(createElement(ContributionCard,{value:contributionFixture,userId:"test",portfolio:portfolioFixture}));
  assert.match(markup,/come from your saved holdings/);assert.match(markup,/Choose an option/);
  assert.doesNotMatch(markup,/Hypothetical current values|I do not own|Confirm ownership/);
});
test("loading and Free entitlement surface are accessible",()=>{
  assert.match(html(createElement(LivePortfolio,{value:contributionFixture,userId:"test"})),/role="status"/);
  const markup=html(createElement(AccountAccessContext.Provider,{value:{value:{features:[]} as unknown as Entitlements,error:"",retry:()=>{}}},
    createElement(PlusFeature,{feature:"live_portfolio",title:"Live Portfolio"},createElement("p",null,"PRIVATE"))));
  assert.match(markup,/Explore Arbor Plus/);assert.doesNotMatch(markup,/PRIVATE/);
});
test("portfolio API uses normal auth, never user identity in body, and exact decimal units",async()=>{
  const calls: {url:string;options?:RequestInit}[]=[];
  const api=createPortfolioApi(async user=>{assert.equal(user,"A");return "fixture-token";},async(url,options)=>{calls.push({url:String(url),options});return Response.json(options?.method==="GET"?portfolioFixture:{saved:true});});
  assert.deepEqual(await api.read("A"),portfolioFixture);
  await api.save("A",{provider:"gotrade",product_id:"gotrade_vt",units:"0.123456789012",cost_basis_php:null});
  await api.save("A",{provider:"gotrade",product_id:"gotrade_vt",units:"2",cost_basis_php:null},"record");
  await api.remove("A","record");
  assert.deepEqual(calls.map(c=>c.options?.method),["GET","POST","PUT","DELETE"]);
  assert.ok(calls.every(c=>!c.url.includes("token")&&!c.url.includes("user_id")));
  assert.equal(JSON.parse(String(calls[1].options?.body)).units,"0.123456789012");
  assert.equal(JSON.parse(String(calls[1].options?.body)).user_id,undefined);
});
for(const status of [401,403,409,422,503])test(`portfolio API ${status} is safe and recoverable`,async()=>{
  const api=createPortfolioApi(async()=>"fixture",async()=>Response.json({detail:"secret internal error"},{status}));
  await assert.rejects(api.read("A"),e=>e instanceof Error&&!e.message.includes("secret")&&!!e.message);
});
test("short-term and historical plans never open long-term scenarios despite actual holdings",()=>{
  const historical=structuredClone(contributionFixture);
  historical.plan.plan_basis="historical_assessment";
  assert.equal(scenarioAvailability(historical,portfolioFixture),"plan_required");
  const short={...historical,plan:{...historical.plan,path:"short_term",plan_basis:"user_selected"}} as typeof contributionFixture;
  assert.equal(scenarioAvailability(short,portfolioFixture),"plan_required");
});
test("stale or incomplete holdings cannot fall through to hypothetical manual entry",()=>{
  const selected=structuredClone(contributionFixture);selected.plan.plan_basis="user_selected";
  assert.equal(scenarioAvailability(selected,portfolioFixture),"available");
  assert.equal(scenarioAvailability(selected,{...portfolioFixture,stale_count:1}),"prices_required");
  assert.equal(scenarioAvailability(selected,{...portfolioFixture,complete:false}),"prices_required");
  assert.equal(scenarioAvailability(selected,{...portfolioFixture,holdings:[]}),"available");
});
test("multiple observed history points have accessible values and range controls",()=>{
  const markup=html(createElement(PortfolioHistoryChart,{history:[
    {day:"2026-09-23",value_php:"5000.00",captured_at:"2026-09-23T00:00:00Z"},
    {day:"2026-09-24",value_php:"5600.00",captured_at:"2026-09-24T00:00:00Z"},
  ]}));
  assert.match(markup,/₱5,000/);assert.match(markup,/₱5,600/);assert.match(markup,/recorded values \(2\)/);
  for(const range of ["1M","3M","1Y","All"])assert.ok(markup.includes(range));
});
