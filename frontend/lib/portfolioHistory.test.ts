import test from "node:test";
import assert from "node:assert/strict";
import {historyExtrema,historyRange,portfolioValueChange,portfolioValueChangeFromStart,supportedHistorySegment,valueChangeDisclosure} from "./portfolioHistory";
import {recentPortfolioActivity,recentLedgerActivity,holdingsUpdatedAfter} from "./portfolioActivity";
import type {PortfolioHistory,PortfolioHolding,InvestmentEntry} from "./livePortfolio";

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
  const selected=historyRange(values,30,"2026-09-29");assert.deepEqual(selected.map(p=>p.day),["2026-09-01","2026-09-26"]);
  assert.equal(portfolioValueChange(selected)?.amount,"20.00");assert.equal(values[0].day,"2026-09-26");
});
test("1D, 1W, 1M, 1Y, 5Y and All use UTC calendar dates without synthetic days",()=>{
  const values=[point("2021-09-28","0"),point("2021-09-29","1"),point("2025-09-20","1"),point("2026-09-01","2"),point("2026-09-23","3"),point("2026-09-28","4"),point("2026-09-29","5")];
  for(const [days,expected] of [[1,["2026-09-29"]],[7,["2026-09-23","2026-09-28","2026-09-29"]],
    [30,["2026-09-01","2026-09-23","2026-09-28","2026-09-29"]],
    [365,["2026-09-01","2026-09-23","2026-09-28","2026-09-29"]],
    [1826,["2021-09-29","2025-09-20","2026-09-01","2026-09-23","2026-09-28","2026-09-29"]],
    [0,values.map(p=>p.day)] ] as const)
    assert.deepEqual(historyRange(values,days,"2026-09-29").map(p=>p.day),expected);
  assert.deepEqual(historyRange([point("2026-09-28","4")],1,"2026-09-29"),[]);
});
test("range color tracks value movement, independently of historical recorded-cost gain",()=>{
  const start={...point("2026-09-20","10000.00"),recorded_gain_php:"0.00"};
  const contribution={...point("2026-09-24","15000.00"),recorded_gain_php:"0.00"};
  const down={...point("2026-09-29","13500.00"),recorded_gain_php:"1500.00"};
  assert.deepEqual([portfolioValueChange([start,contribution])?.direction,portfolioValueChange([start,contribution])?.amount,portfolioValueChange([start,contribution])?.percentage],["up","5000.00","50.00"]);
  assert.deepEqual([portfolioValueChange([contribution,down])?.direction,portfolioValueChange([contribution,down])?.amount,portfolioValueChange([contribution,down])?.percentage],["down","-1500.00","-10.00"]);
  assert.equal(portfolioValueChange([contribution,{...down,value_php:"15000.00"}])?.direction,"flat");
  assert.equal(portfolioValueChange([contribution])?.direction,undefined);
  assert.equal(portfolioValueChangeFromStart([start,contribution],0)?.amount,"0.00");
  assert.deepEqual([historyExtrema([start,contribution,down])?.high.day,historyExtrema([start,contribution,down])?.low.day],["2026-09-24","2026-09-20"]);
});
test("USD history stops at the last missing captured-FX point and never uses current FX",()=>{
  const old={...point("2026-09-20","10000.00"),value_usd:null};
  const first={...point("2026-09-24","15000.00"),value_usd:"300.00"};
  const gap={...point("2026-09-26","16000.00"),value_usd:null};
  const last={...point("2026-09-29","16500.00"),value_usd:"330.00"};
  assert.deepEqual(supportedHistorySegment([old,first,gap,last],"USD"),[last]);
  assert.deepEqual(supportedHistorySegment([old,first,last],"USD"),[first,last]);
  assert.equal(portfolioValueChange([first,last],"USD")?.amount,"30.00");
  assert.equal(portfolioValueChange([old,first],"USD"),null);
  assert.equal(historyExtrema([first,last],"USD")?.high.day,"2026-09-29");
});
test("a contribution raises portfolio value without becoming recorded-cost gain",()=>{
  const values=[point("2026-09-27","10000.00"),point("2026-09-28","15000.00")];
  assert.equal(portfolioValueChange(values)?.amount,"5000.00");
  assert.equal(portfolioValueChange(values)?.percentage,"50.00");
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
test("Bitcoin ledger activity uses BTC units and corrections are not new purchases",()=>{
  const entry={id:"one",holding_id:"holding",product_id:"pdax_btc",provider:"pdax",investment_date:"2026-09-25",units:"0.01",amount_paid_php:null,recorded_at:"2026-09-26T00:00:00Z",updated_at:"2026-09-27T00:00:00Z",revision:2,voided_at:null} satisfies InvestmentEntry;
  const events=recentLedgerActivity([entry],[],null);
  assert.match(events[0].title,/Corrected Bitcoin/);
  assert.match(events[0].detail,/0\.01 BTC/);
  assert.equal(events[0].amount,null);
  assert.equal(events[0].product_id,"pdax_btc");
  assert.equal(events[0].provider,"pdax");
});
test("Home recent activity prefers record-change time over backdated investment date",()=>{
  const older={id:"old",holding_id:"h",product_id:"gotrade_vt",provider:"gotrade",investment_date:"2025-09-15",units:"0.5",amount_paid_php:null,recorded_at:"2026-09-28T10:00:00Z",updated_at:"2026-09-28T10:00:00Z",revision:1,voided_at:null} satisfies InvestmentEntry;
  const newerByInvestmentDate={...older,id:"newer-date",investment_date:"2026-09-27",recorded_at:"2026-09-27T10:00:00Z",updated_at:"2026-09-27T10:00:00Z"};
  const result=recentLedgerActivity([newerByInvestmentDate,older],[],null);
  assert.equal(result[0].key,"entry:old");assert.match(result[0].detail,/Investment date 2025-09-15/);
  assert.equal(result[0].amount,null);
});
test("Home recent activity omits soft-deleted investments",()=>{
  const entry={id:"deleted",holding_id:"h",product_id:"gotrade_vt",provider:"gotrade",investment_date:"2026-09-27",units:"1",amount_paid_php:"100",recorded_at:"2026-09-27T10:00:00Z",updated_at:"2026-09-28T10:00:00Z",revision:2,voided_at:"2026-09-28T10:00:00Z"} satisfies InvestmentEntry;
  assert.deepEqual(recentLedgerActivity([entry],[],null),[]);
});
