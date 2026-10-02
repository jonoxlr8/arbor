import test from "node:test";
import assert from "node:assert/strict";
import { historicalEstimateSources } from "./historyEstimate";
import type { PortfolioHistory } from "./livePortfolio";
test("estimates show actual older source dates without relabelling observations", () => {
 const point: PortfolioHistory = {day:"2026-06-10",value_php:"5000",captured_at:null,origin:"reconstructed",source_dates:[
  {price_key:"gotrade_vgt",source:"marketstack",observation_date:"2026-06-08",valuation_date:"2026-06-10"},
  {price_key:"usd_php",source:"bsp",observation_date:"2026-06-09",valuation_date:"2026-06-10"}]};
 assert.deepEqual(historicalEstimateSources(point),["VGT · 2026-06-08","FX · 2026-06-09"]);
 assert.deepEqual(historicalEstimateSources({...point,origin:"observed"}),[]);
 assert.deepEqual(historicalEstimateSources({...point,source_dates:point.source_dates!.map(s=>({...s,observation_date:point.day}))}),[]);
 assert.deepEqual(historicalEstimateSources({...point,source_dates:undefined}),[]);
});
