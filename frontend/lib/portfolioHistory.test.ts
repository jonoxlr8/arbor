import test from "node:test";
import assert from "node:assert/strict";
import {historyRange,portfolioValueChange,valueChangeDisclosure} from "./portfolioHistory";
import {recentPortfolioActivity,holdingsUpdatedAfter} from "./portfolioActivity";
import type {PortfolioHistory,PortfolioHolding} from "./livePortfolio";

const point=(day:string,value_php:string):PortfolioHistory=>({day,value_php,captured_at:`${day}T12:00:00Z`});
for(const [first,last,amount,percentage] of [["100.00","112.34","12.34","12.34"],["100.00","87.66","-12.34","-12.34"],["3.00","4.00","1.00","33.33"],["200.00","200.01","0.01","0.01"],["0.00","50.00","50.00",null],["9999999999999999.98","9999999999999999.99","0.01","0.00"]])test(`exact recorded value change ${first} to ${last}`,()=>{
  const value=portfolioValueChange([point("2026-08-01",first!),point("2026-09-01",last!)]);
  assert.equal(value?.amount,amount);assert.equal(value?.percentage,percentage);
});
test("no invented zero baseline, no subcent truncation",()=>{
  assert.equal(portfolioValueChange([]),null);assert.equal(portfolioValueChange([point("2026-09-01","10")]),null);
  assert.equal(portfolioValueChange([point("2026-08-01","1.001"),point("2026-09-01","10")]),null);
  assert.match(valueChangeDisclosure,/Contributions and holding changes/);assert.match(valueChangeDisclosure,/not an investment return/);
});
test("selected range uses only real observations, sorted without mutating source",()=>{
  const values=[point("2026-09-26","120"),point("2026-08-01","90"),point("2026-09-01","100")];
  const selected=historyRange(values,30);assert.deepEqual(selected.map(p=>p.day),["2026-09-01","2026-09-26"]);
  assert.equal(portfolioValueChange(selected)?.amount,"20.00");assert.equal(values[0].day,"2026-09-26");
});
const holding={id:"fixture",product_id:"gotrade_vt",provider:"gotrade",display_name:"VT",created_at:"2026-09-24T10:00:00Z",updated_at:"2026-09-24T10:00:00Z"} as PortfolioHolding;
test("activity distinguishes additions, updates and unknown creation; never invents deleted events",()=>{
  assert.match(recentPortfolioActivity([holding],null)[0].title,/Added VT/);
  assert.match(recentPortfolioActivity([{...holding,updated_at:"2026-09-25T10:00:00Z"}],null)[0].title,/Updated VT/);
  assert.match(recentPortfolioActivity([{...holding,created_at:undefined}],null)[0].title,/Updated VT/);
  assert.equal(recentPortfolioActivity([],null).length,0);
  assert.equal(recentPortfolioActivity([holding],null)[0].amount,null);
});
test("monthly completion follow-up uses timestamps, never increases a holding value",()=>{
  assert.equal(holdingsUpdatedAfter([holding],"2026-09-25T00:00:00Z"),false);
  assert.equal(holdingsUpdatedAfter([{...holding,updated_at:"2026-09-26T00:00:00Z"}],"2026-09-25T00:00:00Z"),true);
});
