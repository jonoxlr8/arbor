import test from "node:test";
import assert from "node:assert/strict";
import {createElement} from "react";
import {renderToStaticMarkup as render} from "react-dom/server";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {INVESTMENTS,ISSUERS,PROVIDERS,providerName,providerDisplayText,catalogueGroups} from "./investmentIdentity";
import type {PortfolioProduct} from "./livePortfolio";
import InvestmentIdentity from "../components/InvestmentIdentity";
import ProviderIdentity from "../components/ProviderIdentity";
import InvestmentCatalogue from "../components/portfolio/InvestmentCatalogue";
import {HomeActivity} from "../components/app/V2Home";
import {sleeveColors} from "../components/AssetIdentity";

const catalog:PortfolioProduct[]=Object.entries(INVESTMENTS).map(([product_id,p])=>({product_id,provider:product_id.startsWith("coins_")?"coins_ph":product_id.split("_")[0],provider_name:"source display",display_name:p.fullName,sleeve:p.category==="bitcoin"?"crypto":"global_equity",price_kind:p.category==="fund"?"nav":"reference"}));
test("display names simplify GFunds and GCrypto without changing IDs",()=>{
  assert.equal(providerName("gcash"),"GFunds");assert.equal(providerName("gcrypto"),"GCrypto");
  assert.deepEqual(Object.keys(PROVIDERS),["gcash","gotrade","dragonfi","gcrypto","coins_ph","pdax"]);
});
test("legacy reply labels are presentation-only and preserve values and source wording",()=>{
  assert.equal(providerDisplayText('GCash / GFunds: PHP 8,000.00 entered by you. GCash / GCrypto: 0.001 BTC.'),'GFunds: PHP 8,000.00 entered by you. GCrypto: 0.001 BTC.');
  assert.equal(providerDisplayText('GCash account; NAV unavailable'), 'GCash account; NAV unavailable');
});
test("exactly twelve supported provider/product choices have identity metadata",()=>{
  assert.equal(Object.keys(INVESTMENTS).length,12);
  assert.equal(catalog.filter(p=>p.price_kind==="nav").length,6);
  assert.equal(INVESTMENTS.gcash_global_equity.unitClass,"PHP Unit Class");
  assert.equal(INVESTMENTS.gcash_technology.unitClass,"A PHP Unit Class");
  assert.equal(INVESTMENTS.dragonfi_global_equity.unitClass,"Class P · PHP");
});
test("issuer is distinct from holding provider for all asset categories",()=>{
  assert.equal(INVESTMENTS.gotrade_vt.issuer,"vanguard");assert.equal(INVESTMENTS.gotrade_vgt.issuer,"vanguard");assert.equal(INVESTMENTS.gotrade_bnd.issuer,"vanguard");
  assert.equal(INVESTMENTS.gcash_defensive.issuer,"atram");assert.equal(INVESTMENTS.dragonfi_defensive.issuer,"bpi");assert.equal(INVESTMENTS.pdax_btc.issuer,"bitcoin");
  assert.doesNotMatch(render(createElement(ProviderIdentity,{provider:"pdax"})),/Coinranking|Bitcoin/);
});
test("all supplied logos are fixed local assets with optimized display and accessible names",()=>{
  for(const identity of [...Object.values(ISSUERS),...Object.values(PROVIDERS)]){
    assert.ok(identity.logo);
    assert.match(identity.logo,/^\/brands\/supplied\/(?:providers|issuers)\/[a-z]+\.png$/);
    assert.ok(readFileSync(`public${identity.logo}`).length < 150_000);
  }
  assert.match(render(createElement(InvestmentIdentity,{product:"pdax_btc"})),/issuers%2Fbitcoin.png/);
  assert.match(render(createElement(InvestmentIdentity,{product:"gotrade_vt"})),/issuers%2Fvanguard.png/);
  assert.match(render(createElement(InvestmentIdentity,{product:"gcash_global_equity"})),/alt="ATRAM"/);
});
test("supplied PNGs are byte-for-byte originals recorded in the provenance manifest",()=>{
  const manifest=JSON.parse(readFileSync('public/brands/supplied/manifest.json','utf8')) as {assets:{file:string;bytes:number;sha256:string}[]};
  assert.equal(manifest.assets.length,9);
  for(const asset of manifest.assets){
    const data=readFileSync(`public/brands/supplied/${asset.file}`);
    assert.equal(data.length,asset.bytes);
    assert.equal(createHash('sha256').update(data).digest('hex'),asset.sha256);
  }
});
test("GFunds and GCrypto share the supplied GCash mark while issuers remain separate",()=>{
  assert.equal(PROVIDERS.gcash.logo,PROVIDERS.gcrypto.logo);
  for(const id of Object.keys(PROVIDERS))assert.match(render(createElement(ProviderIdentity,{provider:id})),/brands%2Fsupplied%2Fproviders/);
  assert.match(render(createElement(InvestmentIdentity,{product:'dragonfi_defensive'})),/issuers%2Fbpi.png/);
  assert.doesNotMatch(render(createElement(InvestmentIdentity,{product:'unknown',name:'Unknown investment'})),/<img/);
});
test("catalogue categories intersect with search and never expand server products",()=>{
  assert.equal(catalogueGroups(catalog,'','fund').flatMap(g=>g.products).length,6);
  assert.equal(catalogueGroups(catalog,'','etf').flatMap(g=>g.products).length,3);
  assert.equal(catalogueGroups(catalog,'PDAX','bitcoin').flatMap(g=>g.products).length,1);
  assert.deepEqual(catalogueGroups(catalog,'VT','fund'),[]);
  assert.deepEqual(catalogueGroups([{...catalog[0],product_id:'arbitrary'}]),[]);
});
test("catalogue groups are neutral and preserve server allowlist only",()=>{
  assert.deepEqual(catalogueGroups(catalog).map(g=>g.name),["GFunds","DragonFi","Gotrade","Bitcoin"]);
  assert.equal(catalogueGroups([catalog[0]]).flatMap(g=>g.products).length,1);
  assert.deepEqual(catalogueGroups([]),[]);
});
test("catalogue search supports provider, ticker, fund and exact class",()=>{
  assert.equal(catalogueGroups(catalog," GFunds ").flatMap(g=>g.products).length,3);
  assert.equal(catalogueGroups(catalog,"VGT").flatMap(g=>g.products).length,1);
  assert.equal(catalogueGroups(catalog,"Class P").flatMap(g=>g.products).length,2);
  assert.equal(catalogueGroups(catalog,"unlisted asset").length,0);
});
test("catalogue shows investment buttons, never asks provider first or ranks choices",()=>{
  const html=render(createElement(InvestmentCatalogue,{catalog,onSelect:()=>{}}));
  assert.match(html,/Search investments/);assert.equal((html.match(/class="catalogue-row"/g)??[]).length,12);
  assert.match(html,/Add Bitcoin · GCrypto/);assert.doesNotMatch(html,/<select|recommended|suitable|best for you|GCash \/ G/);
});
test("allocation palette is stable and shared by donut, alignment and preview",()=>{
  assert.equal(new Set(Object.values(sleeveColors)).size,4);
  for(const path of ["components/portfolio/Allocation.tsx","components/portfolio/LivePortfolio.tsx","components/contributions/ContributionResult.tsx"])assert.match(readFileSync(path,"utf8"),/sleeveColors/);
});
test("primary holding flow keeps units optional for funds and required for ETFs/BTC",()=>{
  const source=readFileSync("components/portfolio/LivePortfolio.tsx","utf8");
  assert.match(source,/InvestmentCatalogue/);assert.match(source,/I know my fund units/);assert.match(source,/Bitcoin amount \(BTC\)/);assert.match(source,/Shares/);assert.match(source,/inputMode="decimal" required/);assert.doesNotMatch(source,/>Provider<select|Save holding record/);
});
test("Home empty activity makes no invented completion claims",()=>{
  const html=render(createElement(HomeActivity,{state:null,available:false}));
  assert.match(html,/Monthly history isn’t available yet/);assert.doesNotMatch(html,/Contribution recorded|₱/);
});
test("Home shows only supplied history and labels undone records distinctly",()=>{
  const row={month:"2026-09",amount_php:"5000.00",completed_at:"2026-09-24T08:00:00Z",undone_at:null};
  const html=render(createElement(HomeActivity,{available:true,state:{month:"2026-09",current:row,history:[row]}}));
  assert.match(html,/₱5,000/);assert.match(html,/Holdings are tracked separately/);
  const undone=render(createElement(HomeActivity,{available:true,state:{month:"2026-09",current:null,history:[{...row,undone_at:"2026-09-25T08:00:00Z"}]}}));
  assert.match(undone,/Check-in undone/);assert.doesNotMatch(undone,/Contribution recorded/);
});
test("price attribution stays visible while source explanation is disclosed",()=>{
  const source=readFileSync("components/portfolio/LivePortfolio.tsx","utf8");assert.match(source,/<\/details><DataAttribution/);assert.match(source,/About prices &amp; data/);
});
