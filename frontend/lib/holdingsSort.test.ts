import test from "node:test";
import assert from "node:assert/strict";
import { sortedHoldings, HOLDINGS_SORT_OPTIONS } from "./holdingsSort";
import type { PortfolioHolding } from "./livePortfolio";
const h=(id:string,value:string|null,pct:string|null,cost:string|null="100",product="unknown_"+id):PortfolioHolding=>({id,product_id:product,provider:"synthetic",display_name:id,provider_name:"Synthetic",sleeve:"global_equity",price_kind:"reference",units:"1",cost_basis_php:cost,manual_value_php:null,value_php:value,recorded_gain_php:pct===null?null:"0",recorded_gain_percentage:pct,freshness:value===null?"unavailable":"fresh",as_of:null,updated_at:"2026-10-03T00:00:00Z",valuation_source:"market_reference"});
const ids=(v:PortfolioHolding[])=>v.map(x=>x.id);
test("latest five sort options, default value order and real zero; unavailable stays last",()=>{
 assert.deepEqual(HOLDINGS_SORT_OPTIONS.map(x=>x[1]),["Highest value","Lowest value","Highest gain %","Lowest gain %","Name A–Z"]);
 const rows=[h("unknown","",null),h("small","100","0"),h("none",null,null),h("large","1000","5"),h("zero","0","0")];
 assert.deepEqual(ids(sortedHoldings(rows,"highest_value")),["large","small","zero","unknown","none"]);
 assert.deepEqual(ids(sortedHoldings(rows,"lowest_value")),["zero","small","large","unknown","none"]);
});
test("gain order uses existing recorded-cost percentage, preserves negative/zero and missing last",()=>{
 const rows=[h("missing_cost","999999","900",null),h("negative","200","-20"),h("positive","100","10"),h("zero","300","0"),h("missing_pct","500",null),h("unvalued",null,"99")];
 assert.deepEqual(ids(sortedHoldings(rows,"highest_gain")),["positive","zero","negative","missing_cost","missing_pct","unvalued"]);
 assert.deepEqual(ids(sortedHoldings(rows,"lowest_gain")),["negative","zero","positive","missing_cost","missing_pct","unvalued"]);
});
test("decimal precision retained beyond Number range, fractions and signed comparison",()=>{
 const rows=[h("low","9999999999999999.01","-0.001"),h("high","9999999999999999.02","-0.0001"),h("zero","000.000","-0.000")];
 assert.deepEqual(ids(sortedHoldings(rows,"highest_value")),["high","low","zero"]);
 assert.deepEqual(ids(sortedHoldings(rows,"highest_gain")),["zero","high","low"]);
});
test("name sorting includes unvalued rows, deterministic known ties and no input mutation",()=>{
 const rows=[h("Zebra",null,null),h("Beta","100","0"),h("Alpha","100","0")];const before=JSON.stringify(rows);
 assert.deepEqual(ids(sortedHoldings(rows,"name")),["Alpha","Beta","Zebra"]);
 assert.deepEqual(ids(sortedHoldings(rows,"highest_value")),["Alpha","Beta","Zebra"]);
 assert.equal(JSON.stringify(rows),before);assert.equal(sortedHoldings(rows,"name")[0],rows[2]);
});
test("sorting uses full fund identity rather than ticker shorthand",()=>{
 const rows=[h("VT","1","0","100","gotrade_vt"),h("ATRAM","1","0","100","gcash_global_equity")];
 assert.deepEqual(ids(sortedHoldings(rows,"name")),["ATRAM","VT"]);
});
