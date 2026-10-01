import test from "node:test";
import assert from "node:assert/strict";
import { currentGainFxRate, historicalGainFxRate, usdEquivalentOfPhpGain } from "./gainDisplayFx";
import { portfolioPeriodGain } from "./portfolioHistory";
import type { GainDisplayFx, PortfolioHistory } from "./livePortfolio";
const now = Date.parse("2026-10-01T12:00:00Z");
const fx: GainDisplayFx = { rate: "50", source: "exchangerate_api", as_of: "2026-10-01T00:00:00Z", valued_at: "2026-10-01T12:00:00Z", valuation_date: "2026-10-01" };
test("current FX must be positive, fresh and aligned with the current valuation", () => {
  assert.equal(currentGainFxRate(fx, now), "50");
  for (const change of [{rate:"0"},{rate:"-50"},{rate:"NaN"},{as_of:"2026-09-26T00:00:00Z"},{as_of:"2026-10-02T00:00:00Z"},{valuation_date:"2026-09-30"},{valued_at:undefined},{source:"captured_snapshot" as const}])
    assert.equal(currentGainFxRate({...fx,...change},now),null);
  assert.equal(currentGainFxRate(undefined,now),null);
});
test("display conversion is decimal half-up, signed, zero-safe and fails closed", () => {
  for (const [gain,rate,expected] of [["1500","50","30.00"],["-1500","50","-30.00"],["0","50","0.00"],["-0","50","0.00"],["1.005","1","1.01"],["-1.005","1","-1.01"],["1e3","5e1","20.00"],["9999999999999999.99","1","9999999999999999.99"]])
    assert.equal(usdEquivalentOfPhpGain(gain,rate),expected);
  for(const rate of [null,"0","-1","bad"])assert.equal(usdEquivalentOfPhpGain("1500",rate),null);
  assert.equal(usdEquivalentOfPhpGain("bad","50"),null);
});
test("observed history uses its captured rate without inventing original quote date", () => {
  const p:PortfolioHistory={day:"2026-09-01",captured_at:"2026-09-01T12:00:00Z",value_php:"5000",value_usd:"100",origin:"observed",display_fx:{rate:"50",source:"captured_snapshot",valuation_date:"2026-09-01",captured_at:"2026-09-01T12:00:00Z",as_of:null}};
  assert.equal(historicalGainFxRate(p),"50");
  for(const change of [{valuation_date:"2026-09-02"},{captured_at:"2026-09-01T13:00:00Z"},{as_of:"2026-09-01T00:00:00Z"},{rate:"0"}])
    assert.equal(historicalGainFxRate({...p,display_fx:{...p.display_fx!,...change}}),null);
  assert.equal(historicalGainFxRate({...p,display_fx:undefined}),null);
});
test("reconstructed FX comes from the same endpoint's existing BSP provenance", () => {
  const p:PortfolioHistory={day:"2026-09-20",captured_at:null,value_php:"5000",value_usd:"100",origin:"reconstructed",source_dates:[{price_key:"usd_php",source:"bsp",observation_date:"2026-09-18",valuation_date:"2026-09-20",rate:"50"}]};
  assert.equal(historicalGainFxRate(p),"50");
  for(const change of [{valuation_date:"2026-09-19"},{observation_date:"2026-09-21"},{observation_date:"2026-09-15"},{rate:"0"}])
    assert.equal(historicalGainFxRate({...p,source_dates:[{...p.source_dates![0],...change}]}),null);
  assert.equal(historicalGainFxRate({...p,source_dates:[...p.source_dates!,...p.source_dates!]}),null);
});
test("selected period keeps PHP accounting baseline and converts only its endpoint", () => {
  const baseline:PortfolioHistory={day:"2026-08-31",value_php:"5000",captured_at:null,origin:"reconstructed",recorded_cost_php:"4000",recorded_gain_php:"1000",cost_complete:true};
  const selected:PortfolioHistory={...baseline,day:"2026-09-20",value_php:"8000",recorded_gain_php:"4000",value_usd:"160",source_dates:[{price_key:"usd_php",source:"bsp",observation_date:"2026-09-18",valuation_date:"2026-09-20",rate:"50"}]};
  const amount=portfolioPeriodGain({history:[baseline,selected],days:30,currentGainPhp:"5000",currentComplete:true,selected,today:"2026-09-30"});
  assert.equal(amount,"3000");
  assert.equal(usdEquivalentOfPhpGain(amount!,historicalGainFxRate(selected)),"60.00");
  assert.equal(portfolioPeriodGain({history:[baseline,selected],days:0,currentGainPhp:"5000",currentComplete:true,today:"2026-09-30"}),"5000");
});
