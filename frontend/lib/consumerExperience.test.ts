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
  assert.match(html, /aria-label="ATRAM"/); assert.match(html, /brands%2Fsupplied%2Fissuers%2Fatram.png/); assert.doesNotMatch(html, /https:/);
});
test("provider logos preserve visible provider text", () => {
  const html = render(createElement(ProviderBrand, {provider:"pdax", name:"PDAX"}));
  assert.match(html, /PDAX/); assert.match(html, /identity-small/); assert.match(html, /alt="PDAX"/); assert.doesNotMatch(html, /Coinranking/);
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
  assert.match(html,/graph will appear/); assert.doesNotMatch(html, /recharts|12.4%|performance/i);
});
test("single observation has exact recorded amount, not a synthetic graph", () => {
  const html = render(createElement(PortfolioHistoryChart,{history:[{day:"2026-09-24",value_php:"8000",captured_at:"2026-09-24T00:00:00Z"}]}));
  assert.match(html,/₱8,000/); assert.match(html,/More observations/); assert.doesNotMatch(html,/recharts-area/);
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
  assert.match(source,/showModal\(\)/);assert.match(source,/previous.focus\(\)/);assert.match(source,/onCancel/);assert.match(source,/aria-labelledby/);
});
test("redesign includes no placeholder transaction action or client feature override", () => {
  const source=readFileSync("components/portfolio/LivePortfolio.tsx","utf8");
  assert.match(source,/\+ Add Investment/);assert.match(source,/This records a holding, not a transaction/);
  assert.doesNotMatch(source,/Record transaction|localStorage|LIVE_PORTFOLIO_ENABLED/);
});
