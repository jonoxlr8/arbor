import {test} from "node:test";
import assert from "node:assert/strict";
import {gainInfo} from "./gainInfo";
test("PHP and USD semantics stay available without persistent fine print",()=>{
 assert.match(gainInfo("PHP").join(" "),/PHP cost/);assert.match(gainInfo("PHP").join(" "),/contributions aren’t investment profit/);
 assert.match(gainInfo("USD").join(" "),/not a separately calculated USD/);assert.match(gainInfo("USD").join(" "),/unavailable/);
 const now=new Date().toISOString();const fx={rate:"62.596181",source:"exchangerate_api" as const,as_of:now,valued_at:now,valuation_date:now.slice(0,10)};
 assert.match(gainInfo("USD",fx).join(" "),/62.596181 PHP/);assert.match(gainInfo("USD",fx).join(" "),/ExchangeRate-API/);
 assert.match(gainInfo("USD",fx).join(" "),/not a live brokerage rate/);
 const point={day:"2026-09-12",value_php:"100",value_usd:"2",captured_at:"2026-09-12T12:00:00Z",origin:"observed" as const,display_fx:{rate:"50",source:"captured_snapshot" as const,as_of:null,valuation_date:"2026-09-12",captured_at:"2026-09-12T12:00:00Z"}};
 assert.match(gainInfo("USD",fx,point).join(" "),/50 PHP/);assert.match(gainInfo("USD",fx,point).join(" "),/original quote timestamp and provider aren’t stored/);
});
