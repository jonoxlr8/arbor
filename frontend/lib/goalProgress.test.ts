import assert from "node:assert/strict";
import test from "node:test";
import { goalProgress } from "./goalProgress";
import type { LivePortfolioData } from "./livePortfolio";
const portfolio = (known_value_php: string, complete = true) => ({known_value_php,complete}) as LivePortfolioData;
test("goal progress is exact and never treats missing holdings as zero", () => {
  assert.equal(goalProgress(null, null), null);
  assert.equal(goalProgress(500000, null), null);
  assert.equal(goalProgress(500000, portfolio("0"))?.percent, "0.0");
  assert.equal(goalProgress(500000, portfolio("106000"))?.percent, "21.2");
  assert.equal(goalProgress(500000, portfolio("550000"))?.percent, "110.0");
  assert.equal(goalProgress(500000, portfolio("550000"))?.barPercent, 100);
  assert.equal(goalProgress(500000, portfolio("106000", false))?.percent, null);
});
