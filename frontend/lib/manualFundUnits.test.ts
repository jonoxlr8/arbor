import {test} from "node:test";
import assert from "node:assert/strict";
import type {PortfolioHolding} from "./livePortfolio";
import {canCorrectManualFundUnits, validCorrectedFundUnits} from "./manualFundUnits";
const holding = {product_id:"gcash_global_equity", units:null, has_entries:false,
  opening_units:"0", opening_cost_php:"1234.56"} as PortfolioHolding;
test("manual-only correction requires actual opening metadata and no dated units",()=>{
  assert.equal(canCorrectManualFundUnits(holding),true);
  assert.equal(canCorrectManualFundUnits({...holding,opening_cost_php:null}),true);
  for(const patch of [{product_id:"gotrade_vt"},{units:"1"},{has_entries:true},
    {opening_units:undefined},{opening_units:"1"},{opening_cost_php:undefined}])
    assert.equal(canCorrectManualFundUnits({...holding,...patch}),false);
});
test("positive exact units only; do not round or turn missing units into zero",()=>{
  for(const value of ["1","12.345678901234","0.000000000001"])assert.equal(validCorrectedFundUnits(value),true);
  for(const value of ["","0","0.00","-1","1e3","NaN","1000000000000","1.1234567890123","1,000"])
    assert.equal(validCorrectedFundUnits(value),false);
});
