import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import { readFileSync } from "node:fs";
import Allocation from "../components/portfolio/Allocation";
import AssetIdentity, { assetMonogram } from "../components/AssetIdentity";
import ProviderBrand from "../components/ProviderBrand";
import PortfolioHistoryChart from "../components/portfolio/PortfolioHistoryChart";
import { PortfolioSummary, PlanAlignment } from "../components/portfolio/LivePortfolio";
import ContributionCard from "../components/contributions/ContributionCard";
import { portfolioFixture } from "./livePortfolio.test";
import { contributionFixture } from "./contributions.test";

test("asset identities reuse locally sourced investment identities, never remote logos", () => {
  assert.equal(assetMonogram("gotrade_vt"), "VT");
  assert.equal(assetMonogram("gotrade_vgt"), "VGT");
  assert.equal(assetMonogram("bitcoin"), "₿");
  const html = render(createElement(AssetIdentity, {product:"gcash_technology", sleeve:"technology_tilt"}));
  assert.match(html, /aria-hidden="true"/); assert.match(html, /data-glyph="circuit"/); assert.doesNotMatch(html, /https:|<img/);
});
test("provider logos preserve visible provider text", () => {
  const html = render(createElement(ProviderBrand, {provider:"pdax", name:"PDAX"}));
  assert.match(html, /PDAX/); assert.match(html, /identity-small/); assert.match(html, /data-glyph="exchange"/); assert.doesNotMatch(html, /Coinranking/);
});
test("allocation renders accessible canonical percentages without alignment score", () => {
  const html = render(createElement(Allocation, {weights:[{role:"global_equity",percentage_points:70},{role:"defensive",percentage_points:30}]}));
  assert.match(html, /conic-gradient/); assert.match(html, /Global Equity/); assert.match(html, /70%/); assert.match(html, /30%/);
  assert.doesNotMatch(html, /on track|>100%<|suitable|recommended/i);
});
test("current allocation is identified separately from plan targets", () => {
  const html = render(createElement(Allocation, {label:"Current allocation",weights:[{role:"global_equity",percentage_points:100}]}));
  assert.match(html, /Current mix/); assert.doesNotMatch(html, /Target mix/);
});
test("empty history does not fabricate returns or chart points", () => {
  const html = render(createElement(PortfolioHistoryChart,{history:[]}));
  assert.match(html,/No investments recorded yet/); assert.match(html,/chart-plot/); assert.doesNotMatch(html, /12.4%|performance return/i);
  assert.match(html,/No portfolio history yet/); assert.match(html,/chart-no-history-empty_zero/); assert.doesNotMatch(html,/chart-flat-line|<line|linearGradient/);
});
test("current-only graph has one value headline and no invented history", () => {
  const html = render(createElement(PortfolioHistoryChart,{history:[],knownValue:"12800",holdingsCount:1}));
  assert.match(html,/Current value · No history yet/);
  assert.match(html,/chart-no-history-current_only/); assert.doesNotMatch(html,/chart-flat-line|<line|linearGradient/);
  assert.equal((html.match(/₱12,800\.00/g) ?? []).length,1);
});
test("single observation has exact recorded amount, not a synthetic graph", () => {
  const html = render(createElement(PortfolioHistoryChart,{history:[{day:"2026-09-24",value_php:"8000",captured_at:"2026-09-24T00:00:00Z"}],knownValue:"8000"}));
  assert.match(html,/₱8,000/); assert.match(html,/Not enough history in this range yet/); assert.match(html,/chart-plot/); assert.doesNotMatch(html,/Portfolio value change/);
});
test("all seven history ranges remain available with sparse genuine observations", () => {
  const history = [
    {day:"2026-01-01",value_php:"100",captured_at:"2026-01-01T00:00:00Z"},
    {day:"2026-09-26",value_php:"120",captured_at:"2026-09-26T00:00:00Z"},
  ];
  const html = render(createElement(PortfolioHistoryChart,{history,knownValue:"120",holdingsCount:1}));
  for (const label of ["1W", "1M", "3M", "6M", "1Y", "5Y", "All"]) assert.match(html,new RegExp(`>${label}<`));
  assert.doesNotMatch(html,/>1D</);
  assert.match(html,/Not enough history in this range yet/);
  const supported = render(createElement(PortfolioHistoryChart,{history:[...history,{day:"2026-09-20",value_php:"110",captured_at:"2026-09-20T00:00:00Z"}],knownValue:"120",holdingsCount:1}));
  assert.match(supported,/>1M</);
});
test("partial portfolio still discloses known value and missing holdings", () => {
  const html = render(createElement(PortfolioSummary,{portfolio:{...portfolioFixture,complete:false,unavailable_count:1}}));
  assert.match(html,/Known portfolio value/); assert.match(html,/not the complete portfolio value/); assert.match(html,/value-number/);
});
test("alignment is plain-language comparison and no opaque score", () => {
  const html = render(createElement(PlanAlignment,{portfolio:portfolioFixture}));
  assert.match(html,/Current:/); assert.match(html,/Target:/); assert.match(html,/comparison, not a score/);
});
test("monthly preview defaults to canonical planning amount and one primary calculation", () => {
  const value={...contributionFixture,profile:{...contributionFixture.profile,monthly_investment:5000}};
  const html = render(createElement(ContributionCard,{value,userId:"fixture"}));
  assert.match(html,/Preview contribution/); assert.match(html,/Where will you invest/);
  assert.doesNotMatch(html,/Calculate scenario|Monthly scenario|selected implementation route/i);
  assert.match(html,/value="5000"/);
  assert.match(html,/<details[^>]*><summary[^>]*>Compare another/);
});
test("unavailable current allocation does not draw a misleading zero-value bar", () => {
  const portfolio={...portfolioFixture,complete:false,sleeves:portfolioFixture.sleeves.map(s=>({...s,current_percentage:null,difference_pp:null}))};
  const html=render(createElement(PlanAlignment,{portfolio}));
  assert.match(html,/Current: Unavailable/);assert.doesNotMatch(html,/alignment-track/);
});
test("sheets rely on native modal focus/inert behavior and restore focus", () => {
  const source=readFileSync("components/ui/Sheet.tsx","utf8");
  assert.match(source,/showModal\(\)/);assert.match(source,/previous.focus\(\{\s*preventScroll:\s*true/);assert.match(source,/onCancel/);assert.match(source,/aria-labelledby/);
  assert.match(source,/arbor-sheet-wide/);
});
test("factual activity and implementation are sheet launchers, not inline expanded sections", () => {
  const portfolio=readFileSync("components/portfolio/LivePortfolio.tsx","utf8");
  const home=readFileSync("components/app/V2Home.tsx","utf8");
  const activitySheet=readFileSync("components/portfolio/InvestmentActivitySheet.tsx","utf8");
  assert.match(portfolio,/data-sheet-launcher="history"/);
  assert.match(portfolio,/data-sheet-launcher="ways"/);
  assert.match(portfolio,/section === "history" && <InvestmentActivitySheet/);
  assert.match(portfolio,/section === "ways" .* <Sheet title="Ways to invest"/);
  assert.doesNotMatch(portfolio,/<details id="section-history"|<details id="section-ways"/);
  assert.match(home,/href="#home\/activity"/);
  assert.match(home,/href="#portfolio\/ways"/);
  assert.match(home,/section === "activity" && portfolio && userId && <InvestmentActivitySheet/);
  assert.match(activitySheet,/<Sheet title="Investment activity"/);
  assert.doesNotMatch(home,/Recent activity.*Arbor Plus/);
});
test("Portfolio hierarchy places ways before Plus insights and activity before final data disclosure", () => {
  const portfolio=readFileSync("components/portfolio/LivePortfolio.tsx","utf8");
  const positions=["portfolio-value",'id="section-holdings"','data-sheet-launcher="ways"','<PortfolioPlanningTools/>','data-sheet-launcher="history"','className="portfolio-data"'].map(marker=>portfolio.indexOf(marker));
  assert.ok(positions.every(position=>position>=0));
  assert.deepEqual(positions,[...positions].sort((left,right)=>left-right));
});
test("sheet URLs preserve Back navigation and a direct-link close fallback", () => {
  const navigation=readFileSync("lib/appNavigation.ts","utf8");
  assert.match(navigation,/window\.history\.state\?\.arborSheet/);
  assert.match(navigation,/window\.history\.back\(\)/);
  assert.match(navigation,/sheetFallbackHash\(target\)/);
});
test("dated investment action is present without a client feature override", () => {
  const source=readFileSync("components/portfolio/LivePortfolio.tsx","utf8");
  assert.match(source,/\+ Add Investment/);assert.match(source,/DatedInvestmentFlow/);
  assert.doesNotMatch(source,/localStorage|LIVE_PORTFOLIO_ENABLED/);
});
