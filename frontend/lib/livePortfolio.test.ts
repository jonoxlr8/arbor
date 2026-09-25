import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createPortfolioApi, isPortfolio, validHolding, freshnessText, portfolioValues, scenarioAvailability, supportsManualValue, validManualValue, type LivePortfolioData } from "./livePortfolio";
import LivePortfolio, { PortfolioSummary, PlanAlignment, DataAttribution } from "../components/portfolio/LivePortfolio";
import PortfolioHistoryChart from "../components/portfolio/PortfolioHistoryChart";
import ContributionCard from "../components/contributions/ContributionCard";
import { contributionFixture } from "./contributions.test";
import { PlusFeature, AccountAccessContext } from "../components/AccountAccess";
import type { Entitlements } from "./entitlements";
import { isEntitlements } from "./entitlements";
import { V2Destination } from "../components/PlanV2View";
import { PortfolioError, portfolioReadError } from "./livePortfolio";

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
for (const [status, code] of [[401,"portfolio_auth"],[403,"portfolio_entitlement"],[404,"portfolio_unavailable"],[500,"portfolio_server"],[503,"portfolio_server"]] as const) test(`read classifies ${status} without exposing body`, async () => {
  const api = createPortfolioApi(async()=>"fixture",async()=>Response.json({detail:"private database URL and payload"},{status}));
  await assert.rejects(api.read("A"), error => error instanceof PortfolioError && error.code === code && !error.message.includes("private"));
});
test("network and malformed successful responses have distinct bounded errors", async () => {
  const responses = [async()=>{throw new TypeError("private API URL");},async()=>Response.json({private:"payload"}),async()=>new Response("invalid JSON")];
  for (const [index, request] of responses.entries()) {
    await assert.rejects(createPortfolioApi(async()=>"fixture",request).read("A"), error => error instanceof PortfolioError && error.code === (index === 0 ? "portfolio_network" : "portfolio_contract") && !error.message.includes("private"));
  }
  assert.equal(portfolioReadError(new Error("secret" )).code,"portfolio_server");
  assert.equal(portfolioReadError(new Error("secret" )).message.includes("secret"),false);
});
test("successful read retry is a fresh GET with no financial mutation", async () => {
  const calls: RequestInit[] = [];
  const api = createPortfolioApi(async()=>"fixture",async(_,options)=>{calls.push(options!);return calls.length === 1 ? new Response(null,{status:503}) : Response.json({...portfolioFixture,data_sources:["toap"]});});
  await assert.rejects(api.read("A"),PortfolioError);
  assert.ok(isPortfolio(await api.read("A")));
  assert.deepEqual(calls.map(c=>[c.method,c.cache,c.body]),[["GET","no-store",undefined],["GET","no-store",undefined]]);
});
test("manual value is limited to six funds and exact positive PHP amounts",()=>{
  for(const provider of ["gcash","dragonfi"])for(const sleeve of ["global_equity","technology","defensive"])assert.ok(supportsManualValue({product_id:`${provider}_${sleeve}`}));
  for(const product_id of ["gotrade_vt","pdax_btc","AAPL","gcash_arbitrary"])assert.equal(supportsManualValue({product_id}),false);
  for(const value of ["0","-1","NaN","Infinity","0.001","10000000000000000",""])assert.equal(validManualValue(value),false);
  assert.ok(validManualValue("12450.25"));
});
test("fund value-only drafts work while ETF/BTC units remain mandatory",()=>{
  for(const product_id of ["gcash_global_equity","dragonfi_defensive"]){
    const provider=product_id.split('_')[0];
    const catalog=[{...portfolioFixture.catalog[0],product_id,provider}];
    const draft={provider,product_id,units:null,cost_basis_php:null,manual_value_php:"8000"};
    assert.ok(validHolding(draft,catalog));
    assert.equal(validHolding({...draft,manual_value_php:null},catalog),false);
    assert.ok(validHolding({...draft,units:"10",manual_value_php:null},catalog));
  }
  for(const product_id of ["gotrade_vt","pdax_btc"]){
    const provider=product_id.split('_')[0],catalog=[{...portfolioFixture.catalog[0],product_id,provider}];
    assert.equal(validHolding({provider,product_id,units:null,cost_basis_php:null,manual_value_php:"8000"},catalog),false);
  }
});
test("manual source and expiry never masquerade as official NAV",()=>{
  const h={...portfolioFixture.holdings[0],product_id:"gcash_global_equity",provider:"gcash",price_kind:"nav" as const,valuation_source:"manual_user" as const,manual_value_php:"8000.00",manual_value_updated_at:"2026-09-24T00:00:00Z"};
  assert.match(freshnessText(h),/Updated by you/);assert.doesNotMatch(freshnessText(h),/NAV|market price/);
  assert.match(freshnessText({...h,freshness:"unavailable",as_of:null}),/Value needs updating.*Last updated by you/);
  assert.match(freshnessText({...h,valuation_source:"nav"}),/NAV updated/);
});
test("manual-value API sends only value and supports clearing without deleting",async()=>{
  const calls:RequestInit[]=[];
  const api=createPortfolioApi(async()=>"fixture",async(url,options)=>{assert.match(String(url),/holdings\/record\/manual-value$/);calls.push(options!);return Response.json({saved:true});});
  await api.manualValue("A","record","12450.25");await api.manualValue("A","record",null);
  assert.deepEqual(calls.map(c=>c.method),["PUT","PUT"]);
  assert.deepEqual(calls.map(c=>JSON.parse(String(c.body))),[{manual_value_php:"12450.25"},{manual_value_php:null}]);
});
test("manual value failures are safe and do not trigger a delete or another write",async()=>{
  let calls=0;
  const api=createPortfolioApi(async()=>"fixture",async(_,options)=>{calls++;assert.equal(options?.method,"PUT");return Response.json({detail:"internal storage error"},{status:503});});
  await assert.rejects(api.manualValue("A","record","8000"),/temporarily unavailable/);
  assert.equal(calls,1);
});
for (const enabled of [undefined, false, true]) test(`server availability ${enabled} selects live or manual path independently of Plus`,()=>{
  const value = structuredClone(contributionFixture); value.plan.plan_basis="user_selected";
  const access: Entitlements = {tier:"plus",status:"trial",effective_tier:"plus",private_beta:true,
    features:["live_portfolio","monthly_contribution_planner"],ask_monthly_limit:null,ask_usage:null,ask_usage_available:true,
    ...(enabled === undefined ? {} : {availability:{live_portfolio:enabled}})};
  assert.ok(isEntitlements(access));
  const markup=html(createElement(AccountAccessContext.Provider,{value:{value:access,error:"",retry:()=>{}}},
    createElement(V2Destination,{value,active:"portfolio",userId:"test",section:"contribution"})));
  assert.doesNotMatch(markup,/Hypothetical current values/); // Monthly workflow now belongs to Home.
  assert.equal(markup.includes("Loading your portfolio"),enabled===true);
  assert.doesNotMatch(markup,/Add holding|Explore Arbor Plus/);
  assert.equal(isEntitlements({...access,availability:{live_portfolio:"true"}}),false);
});
test("portfolio contract requires complete typed decimal data",()=>{
  assert.ok(isPortfolio(portfolioFixture));
  for(const value of [null,{}, {...portfolioFixture,known_value_php:5600}, {...portfolioFixture,sleeves:[]}, {...portfolioFixture,holdings:[{}]}]) assert.equal(isPortfolio(value),false);
});
for(const sources of [["toap"], ["marketstack","coinranking","exchangerate_api","toap"], ["marketstack"], ["coinranking"], ["exchangerate_api"], []])test(`portfolio accepts canonical sources ${JSON.stringify(sources)}`,()=>{
  assert.ok(isPortfolio({...portfolioFixture,data_sources:sources}));
});
test("portfolio source validation still rejects unknown and malformed metadata",()=>{
  for(const sources of [["unknown"], ["toap","unknown"], ["TOAP"], ["https://uitf.com.ph"], "toap", null, {}, 1, [null], [1], [[]], [{source:"toap"}]]){
    assert.equal(isPortfolio({...portfolioFixture,data_sources:sources}),false,JSON.stringify(sources));
  }
});
test("TOAP portfolio passes API validation and reaches existing NAV attribution",async()=>{
  const product={product_id:"dragonfi_global_equity",provider:"dragonfi",provider_name:"DragonFi",display_name:"BPI Global Equity Fund of Funds",sleeve:"global_equity" as const,price_kind:"nav" as const};
  const response:LivePortfolioData={...portfolioFixture,data_sources:["toap"],known_value_php:"2031.80",total_value_php:"2031.80",
    provider_values_php:{dragonfi:"2031.80"},catalog:[product],
    holdings:[{...portfolioFixture.holdings[0],...product,units:"20",value_php:"2031.80",valuation_source:"nav"}],
    sleeves:portfolioFixture.sleeves.map(s=>({...s,known_value_php:s.sleeve==="global_equity"?"2031.80":"0.00"}))};
  const api=createPortfolioApi(async()=>"fixture",async()=>Response.json(response));
  const portfolio=await api.read("A");
  assert.deepEqual(portfolio,response);
  const attribution=html(createElement(DataAttribution,{sources:portfolio.data_sources!}));
  assert.match(attribution,/NAV data by TOAP \/ UITF.com.ph/);
  assert.match(attribution,/href="https:\/\/uitf.com.ph"/);
  assert.equal((attribution.match(/NAV data by TOAP/g)||[]).length,1);
  assert.doesNotMatch(attribution,/DragonFi/);
  assert.equal(portfolio.holdings[0].provider_name,"DragonFi");
  assert.match(freshnessText(portfolio.holdings[0]),/NAV updated/);
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
  assert.match(markup,/Plan Alignment/);assert.match(markup,/20.00 percentage points below your target/);assert.match(markup,/100.00%/);assert.match(markup,/not a score/);
});
test("unavailable alignment is not displayed as zero",()=>{
  const p={...portfolioFixture,sleeves:portfolioFixture.sleeves.map(s=>({...s,current_percentage:null,difference_pp:null,target_percentage:null}))};
  const markup=html(createElement(PlanAlignment,{portfolio:p}));
  assert.match(markup,/Not applicable/);assert.match(markup,/Unavailable/);assert.doesNotMatch(markup,/0.00%/);
});
test("history has no fake points and one observed value is readable",()=>{
  assert.match(html(createElement(PortfolioHistoryChart,{history:[]})),/graph will appear/);
  const markup=html(createElement(PortfolioHistoryChart,{history:[{day:"2026-09-24",value_php:"5600.00",captured_at:"2026-09-24T00:00:00Z"}]}));
  assert.match(markup,/₱5,600/);assert.match(markup,/not an investment-return chart/);assert.match(markup,/Portfolio history/);
});
test("freshness distinguishes NAV, cached reference and missing price",()=>{
  const h=portfolioFixture.holdings[0];
  assert.match(freshnessText(h),/Latest available market price updated/);
  assert.match(freshnessText({...h,price_kind:"nav"}),/Latest NAV/);
  assert.match(freshnessText({...h,freshness:"stale"}),/Cached/);
  assert.match(freshnessText({...h,as_of:null}),/unavailable/);
});
test("source attribution is separate from holding provider and uses fixed links",()=>{
  const markup=html(createElement(DataAttribution,{sources:["coinranking","exchangerate_api","marketstack","toap","https://evil"]}));
  assert.match(markup,/Crypto data by Coinranking/);assert.match(markup,/Rates By Exchange Rate API/);
  assert.match(markup,/NAV data by TOAP \/ UITF.com.ph/);assert.match(markup,/href="https:\/\/uitf.com.ph"/);
  assert.doesNotMatch(markup,/evil|Coinranking account/);assert.match(markup,/min-h-11/);
  assert.equal(isPortfolio({...portfolioFixture,data_sources:"coinranking"}),false);
  assert.equal(isPortfolio({...portfolioFixture,data_sources:["coinranking"]}),true);
  assert.match(freshnessText({...portfolioFixture.holdings[0],sleeve:"crypto"}),/Reference price updated/);
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
  assert.match(markup,/₱5,000/);assert.match(markup,/₱5,600/);assert.match(markup,/Portfolio history/);
  for(const range of [">1M<",">3M<",">1Y<"])assert.ok(!markup.includes(range));
});
