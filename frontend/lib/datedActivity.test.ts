import test from "node:test";
import assert from "node:assert/strict";
import { datedActivity } from "./datedActivity";
import type { InvestmentEntry } from "./livePortfolio";
const entry = (id: string, day: string, amount: string | null): InvestmentEntry => ({ id, investment_date:day, amount_paid_php:amount, holding_id:"holding", product_id:"gotrade_vt", provider:"gotrade", units:"1", recorded_at:"2026-09-28T00:00:00Z", updated_at:"2026-09-28T00:00:00Z", revision:1, voided_at:null });
test("activity uses investment dates, preserves unknown costs and sums money exactly", () => {
  assert.deepEqual(datedActivity([entry("a","2026-09-01","0.10"), entry("b","2026-08-01",null), entry("c","2026-09-01","0.20"), entry("d","2026-09-01",null)]), [
    {day:"2026-08-01",count:1,knownCost:"0.00",unknownCount:1},
    {day:"2026-09-01",count:3,knownCost:"0.30",unknownCount:1},
  ]);
});
test("voids disappear and corrected entries replace the earlier date without duplicating", () => {
  const original = entry("a","2026-08-01","100");
  const corrected = {...original, investment_date:"2026-07-01", revision:2};
  assert.deepEqual(datedActivity([original, corrected, {...entry("b","2026-09-01","900"), voided_at:"2026-09-28T00:00:00Z"}]), [{day:"2026-07-01",count:1,knownCost:"100.00",unknownCount:0}]);
  assert.deepEqual(datedActivity([]), []);
});
test("large PHP amounts do not lose cents and zero paid is distinct from unknown", () => {
  assert.deepEqual(datedActivity([entry("a","2026-09-01","9999999999999999.99"),entry("b","2026-09-01","0.01"),entry("c","2026-08-01","0")]), [
    {day:"2026-08-01",count:1,knownCost:"0.00",unknownCount:0},
    {day:"2026-09-01",count:2,knownCost:"10000000000000000.00",unknownCount:0},
  ]);
});
