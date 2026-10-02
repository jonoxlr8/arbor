import test from "node:test";
import assert from "node:assert/strict";
import {currentInvestmentMonth,currentBudgetProgress,currentBudgetMeter,recordedMonthTotal,readHomeMonth} from "./homeMonthlyProgress";
import {portfolioApi,type InvestmentEntry} from "./livePortfolio";
import {ComparePlans,accountPlanLabel} from "../components/AccountAccess";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import type {Entitlements} from "./entitlements";
const month="2026-10";
const entry=(id="one",amount_paid_php:string|null="100.01"):InvestmentEntry=>({id,holding_id:"holding",product_id:"gcash_technology",provider:"gcash",investment_date:"2026-10-01",units:"1",amount_paid_php,revision:1,voided_at:null,recorded_at:"2026-10-01T00:00:00Z",updated_at:"2026-10-01T00:00:00Z"});
const signal=()=>new AbortController().signal;
test("current month follows Philippine midnight, year boundary and leap day",()=>{
 for(const [stamp,expected] of [["2026-09-30T15:59:59Z","2026-09"],["2026-09-30T16:00:00Z","2026-10"],["2026-12-31T16:00:00Z","2027-01"],["2028-02-29T16:00:00Z","2028-03"]])assert.equal(currentInvestmentMonth(new Date(stamp)),expected);
});
test("dated purchases sum exact cents, use corrections and exclude voided entries",()=>{
 const total=recordedMonthTotal([entry(),entry("two","200.02"),{...entry("corrected","0.01"),revision:2},{...entry("deleted","9000"),voided_at:"2026-10-01T01:00:00Z"}],month);
 assert.deepEqual(total,{month,amount:"300.04",count:3,missing:0});
 assert.equal(recordedMonthTotal([entry("large","9999999999999999.99"),entry("cent","0.01")],month).amount,"10000000000000000.00");
 assert.throws(()=>recordedMonthTotal([entry("bad","0.001")],month));
});
test("zero/unset budget, no purchases and missing PHP amounts remain distinct",()=>{
 const empty=recordedMonthTotal([],month),unknown=recordedMonthTotal([entry("unknown",null)],month);
 assert.deepEqual(empty,{month,amount:"0.00",count:0,missing:0});assert.equal(unknown.missing,1);
 assert.equal(currentBudgetProgress(empty,null).status,"unset");assert.equal(currentBudgetProgress(empty,0).status,"reached");
 assert.deepEqual(currentBudgetProgress(empty,100),{status:"remaining",remaining:"100.00"});
 assert.equal(currentBudgetProgress(unknown,100).status,"incomplete");
 assert.equal(currentBudgetProgress(recordedMonthTotal([entry("one","101"),entry("unknown",null)],month),100).status,"reached");
 assert.deepEqual(currentBudgetProgress(recordedMonthTotal([entry("one","50.01")],month),100),{status:"remaining",remaining:"49.99"});
});
test("complete bounded matching pagination supplies a modest current-month summary",async()=>{
 const rows=Array.from({length:42},(_,i)=>entry(String(i),"0.01"));let calls=0;
 const read:typeof portfolioApi.activity=async(owner,holding,page=0,_signal,filter)=>{calls++;assert.equal(owner,"A");assert.equal(holding,undefined);assert.deepEqual(filter,{month});return {entries:rows.slice(page*20,page*20+20),page,has_more:rows.length>(page+1)*20};};
 assert.deepEqual(await readHomeMonth("A",month,signal(),read),{month,amount:"0.42",count:42,missing:0});assert.equal(calls,6);
});
for(const kind of ["revision","amount","date","insertion","void","duplicate","page","short-page","limit","network"] as const)test(`summary refuses inconsistent/incomplete ${kind} reads`,async()=>{
 let calls=0;const read:typeof portfolioApi.activity=async(_owner,_holding,page=0)=>{calls++;let rows=[entry()];let has_more=false;
 if(kind==="network")throw new Error("synthetic transport");
 if(kind==="revision"&&calls===2)rows=[{...entry(),revision:2}];
 if(kind==="amount"&&calls===2)rows=[entry("one","2")];
 if(kind==="date"&&calls===2)rows=[{...entry(),investment_date:"2026-09-30"}];
 if(kind==="insertion"&&calls===2)rows=[entry(),entry("two")];
 if(kind==="void"&&calls===2)rows=[{...entry(),voided_at:"2026-10-01T01:00:00Z"}];
 if(kind==="duplicate")rows=[entry(),entry()];
 if(kind==="page")page++;
 if(kind==="short-page")has_more=true;
 if(kind==="limit"){rows=Array.from({length:20},(_,i)=>entry(`${page}-${i}`));has_more=true;}
 return{entries:rows,page,has_more};};
 await assert.rejects(readHomeMonth("A",month,signal(),read));if(kind==="limit")assert.equal(calls,25);
});
test("aborted read makes no request, repeated fetch uses updated current records",async()=>{
 const controller=new AbortController();controller.abort();let amount="1",calls=0;
 const read:typeof portfolioApi.activity=async()=>{calls++;return{entries:[entry("one",amount)],page:0,has_more:false};};
 await assert.rejects(readHomeMonth("A",month,controller.signal,read));assert.equal(calls,0);
 assert.equal((await readHomeMonth("A",month,signal(),read)).amount,"1.00");amount="2";assert.equal((await readHomeMonth("A",month,signal(),read)).amount,"2.00");
});
for(const [effective_tier,status,private_beta,label] of [["free","active",true,"Arbor Free"],["plus","trial",true,"Arbor Plus Trial"],["plus","active",false,"Arbor Plus"],["free","expired",false,"Arbor Free"]] as const)test(`current plan ${effective_tier}/${status} stays truthful`,()=>{
 const value={effective_tier,status,private_beta} as Entitlements;assert.equal(accountPlanLabel(value),label);
 const html=renderToStaticMarkup(createElement(ComparePlans,{value}));assert.match(html,new RegExp(`Current plan: ${label}`));assert.equal((html.match(/current-plan-badge/g)??[]).length,1);
 if(status==="trial")assert.match(html,/No card|no credit card/);assert.doesNotMatch(html,/paid|payment received|checkout/i);
});

test("monthly visual ratio uses complete exact cents, caps exceeded target and avoids unset/zero/missing ratios",()=>{
 const total={month,amount:"3000.00",count:2,missing:0};
 assert.equal(currentBudgetMeter(total,15000),20);
 assert.equal(currentBudgetMeter(total,2000),100);
 assert.equal(currentBudgetMeter({...total,amount:"0.00",count:0},15000),0);
 assert.equal(currentBudgetMeter(total,null),null);
 assert.equal(currentBudgetMeter(total,0),null);
 assert.equal(currentBudgetMeter({...total,missing:1},15000),null);
 assert.equal(currentBudgetMeter({...total,amount:"0.01"},0.03),33.3);
});
