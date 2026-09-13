import test from "node:test";
import assert from "node:assert/strict";
import type { Plan } from "./types/plan";
import { healthDependency, scenarioKey, createLatestRequest, type RequestState } from "./dashboardConsistency";

const plan = { profile: { risk_level: "Balanced", risk_tolerance: "Balanced", current_portfolio_value: 100, monthly_investment: 10, goal_target: 500, investment_horizon: 10, currency: "PHP" }, projection: { assumed_return: .08 } } as Plan;
test("risk change refreshes health; contribution and goal changes do not", () => {
  const changedRisk = { ...plan, profile: { ...plan.profile, risk_level: "Aggressive" } };
  assert.notEqual(healthDependency(plan), healthDependency(changedRisk));
  const changedGoal = { ...plan, profile: { ...plan.profile, goal_target: 1000, monthly_investment: 20 } };
  assert.equal(healthDependency(plan), healthDependency(changedGoal));
  assert.notEqual(scenarioKey(plan), scenarioKey(changedGoal));
  assert.equal(scenarioKey(plan), scenarioKey(changedRisk));
});
test("scenario identity includes starting amount, years, return and baseline response", () => {
  for (const edit of [
    { ...plan, profile: { ...plan.profile, current_portfolio_value: 200 } },
    { ...plan, profile: { ...plan.profile, investment_horizon: 20 } },
    { ...plan, projection: { ...plan.projection, assumed_return: 0 } },
    { ...plan, projection: { ...plan.projection, projected_value: 999 } },
  ]) assert.notEqual(scenarioKey(plan), scenarioKey(edit));
});

test("equivalent baseline JSON ordering does not reset the scenario", () => {
  const baseline = { ...plan, projection: { ...plan.projection, projected_value: 100, monthly_contribution: 10 } };
  const reordered = { ...baseline, projection: Object.fromEntries(Object.entries(baseline.projection).reverse()) } as Plan;
  assert.equal(scenarioKey(baseline), scenarioKey(reordered));
});
test("stale health response cannot overwrite newer health", async () => {
  const states: RequestState<number>[] = [];
  const request = createLatestRequest<number>(s => states.push(s));
  let finishOld!: (value: number) => void;
  const old = request.run(() => new Promise(resolve => { finishOld = resolve; }));
  await Promise.resolve();
  await request.run(async () => 9);
  finishOld(3); await old;
  assert.deepEqual(states.at(-1), { status: "ready", data: 9 });
});
test("health timeout terminates loading and Retry succeeds", async () => {
  const states: RequestState<number>[] = [];
  const request = createLatestRequest<number>(s => states.push(s), 5);
  await request.run(() => new Promise(() => {}));
  assert.equal(states.at(-1)?.status, "error");
  await request.run(async () => 8);
  assert.deepEqual(states.at(-1), { status: "ready", data: 8 });
});
test("disposed save-style request cannot publish obsolete success", async () => {
  const states: RequestState<number>[] = [];
  const request = createLatestRequest<number>(s => states.push(s));
  let finish!: (value: number) => void;
  const pending = request.run(() => new Promise(resolve => { finish = resolve; }));
  await Promise.resolve();
  request.dispose();
  const count = states.length;
  finish(1);
  assert.equal(await pending, undefined);
  assert.equal(states.length, count);
});
