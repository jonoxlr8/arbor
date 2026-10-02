import {test} from "node:test";
import assert from "node:assert/strict";
import {isMonthlyReview,reviewAmountLabel,reviewMonthLabel} from "./monthlyReview";
const total={amount_php:null,record_count:0,missing_amount_count:0};
const review={...total,month:"2026-09",current_month:"2026-10",in_progress:false,currency:"PHP",available_months:["2026-10","2026-09"],breakdown:[],pattern:["04","05","06","07","08","09"].map(m=>({...total,month:"2026-"+m}))};
test("review contract rejects incomplete, invented currency and malformed totals",()=>{
 assert.ok(isMonthlyReview(review));
 for(const value of [{...review,currency:"USD"},{...review,pattern:[]},{...review,record_count:-1},{...review,in_progress:true},{...review,missing_amount_count:1},{...review,amount_php:"NaN"}])assert.equal(isMonthlyReview(value),false);
});
test("unknown periods and missing amounts do not imply zero real-world investing",()=>{
 assert.equal(reviewAmountLabel(total),"No investment recorded");assert.equal(reviewAmountLabel({...total,record_count:1,missing_amount_count:1}),"PHP amounts not recorded");
 assert.equal(reviewAmountLabel({amount_php:"0.00",record_count:1,missing_amount_count:0}),"Recorded additions");
 assert.equal(reviewAmountLabel({amount_php:"100.01",record_count:2,missing_amount_count:1}),"Recorded subtotal");
 assert.equal(reviewMonthLabel("2026-09"),"September 2026");
});
test("historical budget distinguishes unknown, unset, zero and reached",()=>{
 const absent={status:"unavailable",target_php:null,remaining_php:null,progress_pct:null};
 assert.ok(isMonthlyReview({...review,budget:absent}));assert.ok(isMonthlyReview({...review,budget:{...absent,status:"unset"}}));
 assert.ok(isMonthlyReview({...review,budget:{status:"reached",target_php:"0.00",remaining_php:"0.00",progress_pct:"100.00"}}));
 assert.equal(isMonthlyReview({...review,budget:{status:"reached",target_php:"1.00",remaining_php:"0.00",progress_pct:"101.00"}}),false);
 assert.equal(isMonthlyReview({...review,budget:{...absent,status:"remaining"}}),false);
});
