import test from "node:test";
import assert from "node:assert/strict";
import {historyChartSeries,historyExtrema,historyRange,portfolioPeriodGain,portfolioValueChange,portfolioValueChangeFromStart,supportedHistoryPoints,valueChangeDisclosure} from "./portfolioHistory";
import {recentPortfolioActivity,recentLedgerActivity,datedInvestmentEntries,investmentEntryAction,investmentEntryCost,investmentEntryUnits,holdingsUpdatedAfter} from "./portfolioActivity";
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
test("all seven ranges use UTC calendar dates without synthetic history days",()=>{
  const values=[point("2021-09-28","0"),point("2021-09-29","1"),point("2025-09-20","1"),point("2026-04-03","2"),point("2026-07-02","2"),point("2026-09-01","2"),point("2026-09-23","3"),point("2026-09-28","4"),point("2026-09-29","5")];
  for(const [days,expected] of [[7,["2026-09-23","2026-09-28","2026-09-29"]],
    [30,["2026-09-01","2026-09-23","2026-09-28","2026-09-29"]],
    [90,["2026-07-02","2026-09-01","2026-09-23","2026-09-28","2026-09-29"]],
    [180,["2026-04-03","2026-07-02","2026-09-01","2026-09-23","2026-09-28","2026-09-29"]],
    [365,["2026-04-03","2026-07-02","2026-09-01","2026-09-23","2026-09-28","2026-09-29"]],
    [1826,values.slice(1).map(p=>p.day)],
    [0,values.map(p=>p.day)] ] as const)
    assert.deepEqual(historyRange(values,days,"2026-09-29").map(p=>p.day),expected);
});
test("display holds old and disjoint gaps, carries a prior point in, and never carries backward",()=>{
  const old={...point("2026-05-01","100"),value_usd:"2"};
  const gap={...point("2026-07-10","120"),value_usd:null};
  const middle={...point("2026-07-20","130"),value_usd:"3"};
  const later={...point("2026-08-12","140"),value_usd:null};
  const newest={...point("2026-09-10","150"),value_usd:"4"};
  const history=[newest,later,middle,gap,old];
  const usd=historyChartSeries(history,90,"USD","2026-09-29");
  assert.deepEqual(usd.map(p=>[new Date(p.timestamp).toISOString().slice(0,10),p.plotValue]),
    [["2026-07-02",2],["2026-07-20",3],["2026-09-10",4],["2026-09-29",4]]);
  assert.deepEqual(supportedHistoryPoints(historyRange(history,90,"2026-09-29"),"USD"),[middle,newest]);
  assert.deepEqual(historyChartSeries([middle,newest],90,"USD","2026-09-29").map(p=>new Date(p.timestamp).toISOString().slice(0,10)),
    ["2026-07-20","2026-09-10","2026-09-29"],"no future value is carried to July 2");
  assert.deepEqual(historyChartSeries(history,90,"PHP","2026-09-29").map(p=>new Date(p.timestamp).toISOString().slice(0,10)),
    ["2026-07-02","2026-07-10","2026-07-20","2026-08-12","2026-09-10","2026-09-29"]);
  assert.deepEqual(historyChartSeries([old],7,"USD","2026-09-29").map(p=>p.plotValue),[2,2],"valid prior value holds through an empty week");
  assert.deepEqual(historyChartSeries([old],7,"USD","2026-09-29","2.50").map(p=>p.plotValue),[2,2.5],
    "a trusted current value updates only at today's display endpoint");
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
test("Portfolio USD keeps genuine supported points across missing FX dates without conversion",()=>{
  const old={...point("2026-09-20","10000.00"),value_usd:null};
  const first={...point("2026-09-24","15000.00"),value_usd:"300.00"};
  const gap={...point("2026-09-26","16000.00"),value_usd:null};
  const last={...point("2026-09-29","16500.00"),value_usd:"330.00"};
  assert.deepEqual(supportedHistoryPoints([old,first,gap,last],"USD"),[first,last]);
  assert.deepEqual(supportedHistoryPoints([old,first,gap,last],"USD").map(point=>point.day),["2026-09-24","2026-09-29"]);
  assert.deepEqual(supportedHistoryPoints([old,first,last],"USD"),[first,last]);
  assert.equal(portfolioValueChange([first,last],"USD")?.amount,"30.00");
  assert.equal(portfolioValueChange([old,first],"USD"),null);
  assert.equal(historyExtrema([first,last],"USD")?.high.day,"2026-09-29");
});
test("Sep 6-8 and multi-day gaps keep only genuine PHP/USD observations and calendar spacing",()=>{
  const sep6={...point("2026-09-06","900000.00"),value_usd:"18000.00"};
  const sep7={...point("2026-09-07","915000.00"),value_usd:null};
  const sep8={...point("2026-09-08","930000.00"),value_usd:"18600.00"};
  const sep10={...point("2026-09-10","940000.00"),value_usd:"18800.00"};
  const php=supportedHistoryPoints([sep6,sep8],"PHP");
  const usd=supportedHistoryPoints([sep6,sep7,sep8],"USD");
  assert.deepEqual(php.map(p=>p.day),["2026-09-06","2026-09-08"]);
  assert.deepEqual(usd.map(p=>p.day),["2026-09-06","2026-09-08"]);
  assert.equal(sep7.value_usd,null,"missing FX stays unavailable");
  assert.equal(Date.parse(`${usd[1].day}T00:00:00Z`)-Date.parse(`${usd[0].day}T00:00:00Z`),2*86400000);
  assert.deepEqual(supportedHistoryPoints([sep6,sep10],"PHP").map(p=>p.day),["2026-09-06","2026-09-10"]);
});
const gainPoint=(day:string,value_php:string,cost:string|null,gain:string|null,usd:string|null="200.00"):PortfolioHistory=>({
  day,value_php,value_usd:usd,captured_at:null,origin:"reconstructed",cost_complete:cost!==null,
  recorded_cost_php:cost,recorded_gain_php:gain,recorded_gain_percentage:null,
});
test("period gain uses the most recent complete pre-window baseline for every range",()=>{
  const history=[gainPoint("2021-09-28","10000","9000","1000"),gainPoint("2021-09-29","11000","9000","2000"),
    gainPoint("2025-09-20","12000","9000","3000"),gainPoint("2026-08-30","13000","9000","4000"),
    gainPoint("2026-08-31","14000","9000","5000"),gainPoint("2026-09-22","15000","9000","6000"),
    gainPoint("2026-09-28","16000","9000","7000"),gainPoint("2026-09-29","17000","9000","8000")];
  const expected=new Map([[7,"3000"],[30,"4000"],[90,"6000"],[180,"6000"],[365,"6000"],[1826,"7000"],[0,"9000"]]);
  for(const [days,amount] of expected) assert.equal(portfolioPeriodGain({history,days,
    currentGainPhp:"9000",currentComplete:true,today:"2026-09-30"}),amount,`${days} day range`);
  assert.equal(portfolioPeriodGain({history,days:30,currentGainPhp:"9000",currentComplete:true,
    selected:history[5],today:"2026-09-30"}),"1000","hover uses the pre-month baseline");
  assert.equal(portfolioPeriodGain({history,days:30,currentGainPhp:"9000",currentComplete:true,
    selected:null,today:"2026-09-30"}),"4000","reset restores full-period gain");
});
test("period gain excludes contributions, handles losses and preserves decimal precision",()=>{
  const before=gainPoint("2026-09-21","100000.00","90000.00","10000.00");
  const afterContribution=gainPoint("2026-09-27","150000.00","140000.00","10000.00");
  const args={history:[before,afterContribution],days:7,currentComplete:true,today:"2026-09-28"};
  assert.equal(portfolioPeriodGain({...args,currentGainPhp:"10000.00"}),"0");
  assert.equal(portfolioPeriodGain({...args,currentGainPhp:"2000.00"}),"-8000");
  assert.equal(portfolioPeriodGain({...args,currentGainPhp:"10000.005"}),"0.005");
  assert.equal(portfolioPeriodGain({...args,currentGainPhp:"10000.00",selected:afterContribution}),"0");
});
test("correction and Delete update canonical period gain without using stale observations",()=>{
  const base=gainPoint("2026-08-31","10000","9000","1000");
  const incorrect=gainPoint("2026-09-20","16000","12000","4000");
  const corrected=gainPoint("2026-09-20","15000","12000","3000");
  const args={days:30,currentComplete:true,today:"2026-09-30"};
  assert.equal(portfolioPeriodGain({...args,history:[base,incorrect],currentGainPhp:"4000"}),"3000");
  assert.equal(portfolioPeriodGain({...args,history:[base,corrected],currentGainPhp:"3000"}),"2000");
  assert.equal(portfolioPeriodGain({...args,history:[base],currentGainPhp:"1000"}),"0","Delete removes the contribution and its gain from canonical context");
});
test("period gain fails closed when current, selected or baseline cost is incomplete",()=>{
  const unknown=gainPoint("2026-08-31","10000",null,null);
  const known=gainPoint("2026-09-20","12000","10000","2000");
  const args={history:[unknown,known],days:30,currentGainPhp:"2000",today:"2026-09-30"};
  assert.equal(portfolioPeriodGain({...args,currentComplete:true}),null);
  assert.equal(portfolioPeriodGain({...args,currentComplete:false}),null);
  assert.equal(portfolioPeriodGain({...args,currentComplete:true,selected:unknown}),null);
  assert.equal(portfolioPeriodGain({...args,currentComplete:true,days:0}),"2000","All uses cumulative gain, not first-point subtraction");
});
test("USD display retains the same PHP gain baseline even when baseline FX is missing",()=>{
  const old=gainPoint("2026-08-30","10000","9000","1000","200");
  const missing=gainPoint("2026-08-31","11000","9000","2000",null);
  const current=gainPoint("2026-09-05","13000","9000","4000","260");
  const args={history:[old,missing,current],days:30,currentGainPhp:"5000",currentComplete:true,today:"2026-09-30"};
  assert.equal(portfolioPeriodGain(args),"3000","the PHP-only Aug 31 point remains a valid PHP gain baseline");
  assert.deepEqual(supportedHistoryPoints(args.history,"USD"),[old,current],"the same point remains absent from USD plotting");
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
  const events=recentLedgerActivity([entry]);
  assert.match(events[0].title,/Corrected Bitcoin/);
  assert.match(events[0].detail,/0\.01 BTC · Actual cost not recorded/);
  assert.equal(investmentEntryUnits(entry),"0.01 BTC");
  assert.equal(investmentEntryAction(entry),"Corrected");
  assert.equal(events[0].product_id,"pdax_btc");
  assert.equal(events[0].provider,"pdax");
});
test("Home and full activity share dated order even after a backdated correction",()=>{
  const older={id:"old",holding_id:"h",product_id:"gotrade_vt",provider:"gotrade",investment_date:"2025-09-15",units:"0.5",amount_paid_php:null,recorded_at:"2026-09-28T10:00:00Z",updated_at:"2026-09-28T10:00:00Z",revision:1,voided_at:null} satisfies InvestmentEntry;
  const newerByInvestmentDate={...older,id:"newer-date",investment_date:"2026-09-27",recorded_at:"2026-09-27T10:00:00Z",updated_at:"2026-09-27T10:00:00Z"};
  const result=recentLedgerActivity([older,newerByInvestmentDate]);
  assert.deepEqual(result.map(row=>row.key),datedInvestmentEntries([older,newerByInvestmentDate]).map(row=>`entry:${row.id}`));
  assert.equal(result[0].key,"entry:newer-date");
  assert.equal(result[0].date,"2026-09-27");
});
test("Home recent activity omits soft-deleted investments",()=>{
  const entry={id:"deleted",holding_id:"h",product_id:"gotrade_vt",provider:"gotrade",investment_date:"2026-09-27",units:"1",amount_paid_php:"100",recorded_at:"2026-09-27T10:00:00Z",updated_at:"2026-09-28T10:00:00Z",revision:2,voided_at:"2026-09-28T10:00:00Z"} satisfies InvestmentEntry;
  assert.deepEqual(recentLedgerActivity([entry]),[]);
  assert.deepEqual(datedInvestmentEntries([entry]),[]);
});
test("compact Home matches the first four full entries across BTC, fund, ETF, corrections and deletion",()=>{
  const base={id:"etf",holding_id:"h",product_id:"gotrade_vt",provider:"gotrade",investment_date:"2026-09-27",units:"0.5",amount_paid_php:"6500",recorded_at:"2026-09-29T10:00:00Z",updated_at:"2026-09-29T10:00:00Z",revision:1,voided_at:null} satisfies InvestmentEntry;
  const rows:InvestmentEntry[]=[
    {...base,id:"old",investment_date:"2026-08-01",updated_at:"2026-09-30T10:00:00Z"},
    {...base,id:"fund",product_id:"gcash_global_equity",provider:"gcash",investment_date:"2026-09-28",units:"10",amount_paid_php:"900"},
    {...base,id:"btc",product_id:"pdax_btc",provider:"pdax",investment_date:"2026-09-29",units:"0.00015",amount_paid_php:"300",revision:2},
    {...base,id:"deleted",investment_date:"2026-09-30",voided_at:"2026-09-30T11:00:00Z"},
    base,{...base,id:"tie",recorded_at:base.recorded_at},
  ];
  const full=datedInvestmentEntries(rows);
  const home=recentLedgerActivity(rows);
  assert.deepEqual(home.map(row=>row.key),full.slice(0,4).map(row=>`entry:${row.id}`));
  assert.deepEqual(full.map(row=>row.id),["btc","fund","tie","etf","old"]);
  assert.match(home[0].title,/Corrected Bitcoin/);
  assert.match(home[0].detail,/0\.00015 BTC · ₱300\.00 · PDAX/);
  assert.match(home[1].title,/ATRAM Global Equity Opportunity/);
  assert.match(home[2].title,/VT/);
  assert.equal(investmentEntryCost(rows[0]),"₱6,500.00");
  assert.equal(full.length,5);
});
