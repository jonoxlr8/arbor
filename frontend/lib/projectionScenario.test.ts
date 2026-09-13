import test from "node:test";
import assert from "node:assert/strict";
import type { Plan } from "./types/plan";
import { createProjectionScenario, scenarioControls, type ProjectionResult } from "./projectionScenario";
import type { RequestState } from "./dashboardConsistency";

const plan = {
  profile: { current_portfolio_value: 100, monthly_investment: 10, investment_horizon: 1, goal_target: 500, currency: "PHP" },
  projection: { projected_value: 250, yearly_projection: [{ year: 0, value: 100 }, { year: 1, value: 250 }], assumed_return: .08, required_monthly_investment: 30.1 },
} as Plan;
const result = (value: number): ProjectionResult => ({ projected_value: value, yearly_projection: [{ year: 0, value: 100 }, { year: 1, value }] });
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
function setup() {
  const states: RequestState<ProjectionResult>[] = [];
  const pending: { resolve: (value: ProjectionResult) => void; reject: (error: Error) => void; signal: AbortSignal }[] = [];
  const scenario = createProjectionScenario(plan, (_input, signal) => new Promise((resolve, reject) => pending.push({ resolve, reject, signal })), state => states.push(state));
  return { scenario, states, pending };
}
test("Current restores baseline without any API call", async () => {
  const t = setup();
  await t.scenario.select(10);
  assert.equal(t.pending.length, 0);
  assert.deepEqual(t.states.at(-1), { status: "ready", data: plan.projection });
});
test("A then B completing B then A keeps B", async () => {
  const t = setup();
  const a = t.scenario.select(20); await tick();
  const b = t.scenario.select(30); await tick();
  assert.equal(t.pending[0].signal.aborted, true);
  t.pending[1].resolve(result(400)); await b;
  t.pending[0].resolve(result(300)); await a;
  assert.deepEqual(t.states.at(-1), { status: "ready", data: result(400) });
});
test("stale failure and finally cannot clear newer loading or success", async () => {
  const t = setup();
  const a = t.scenario.select(20); await tick();
  const b = t.scenario.select(30); await tick();
  t.pending[0].reject(Error("old")); await a;
  assert.equal(t.states.at(-1)?.status, "loading");
  t.pending[1].resolve(result(400)); await b;
  assert.deepEqual(t.states.at(-1), { status: "ready", data: result(400) });
});
test("returning to Current invalidates a pending request", async () => {
  const t = setup();
  const a = t.scenario.select(20); await tick();
  await t.scenario.select(10);
  t.pending[0].resolve(result(300)); await a;
  assert.deepEqual(t.states.at(-1), { status: "ready", data: plan.projection });
});
test("profile edit invalidates old scenario and uses new baseline", async () => {
  const t = setup();
  const a = t.scenario.select(20); await tick();
  const edited = { ...plan, profile: { ...plan.profile, monthly_investment: 50 }, projection: { ...plan.projection, ...result(700) } };
  assert.equal(t.scenario.updatePlan(edited), true);
  t.pending[0].resolve(result(300)); await a;
  await t.scenario.select(50);
  assert.deepEqual(t.states.at(-1), { status: "ready", data: edited.projection });
  assert.equal(t.pending.length, 1);
});
test("risk-only profile change preserves scenario", async () => {
  const t = setup();
  assert.equal(t.scenario.updatePlan({ ...plan, profile: { ...plan.profile, risk_tolerance: "Aggressive" } }), false);
  assert.equal(t.states.length, 0);
});
test("unmount aborts outstanding work and ignores completion", async () => {
  const t = setup();
  const a = t.scenario.select(20); await tick();
  t.scenario.dispose();
  const count = t.states.length;
  t.pending[0].resolve(result(300)); await a;
  assert.equal(t.states.length, count);
  assert.equal(t.pending[0].signal.aborted, true);
});
test("failure clears the previous result and Retry can succeed", async () => {
  const t = setup();
  const a = t.scenario.select(20); await tick();
  t.pending[0].reject(Error("offline")); await a;
  assert.deepEqual(t.states.at(-1), { status: "error", data: null, error: "offline" });
  const b = t.scenario.select(20); await tick();
  t.pending[1].resolve(result(300)); await b;
  assert.equal(t.states.at(-1)?.status, "ready");
});
test("scenario timeout terminates and no old figures remain", async () => {
  const states: RequestState<ProjectionResult>[] = [];
  const scenario = createProjectionScenario(plan, () => new Promise(() => {}), s => states.push(s), 5);
  await scenario.select(20);
  assert.equal(states.at(-1)?.status, "error");
  assert.equal(states.at(-1)?.data, null);
});
test("bounds cover high current contribution and match every enabled preset", () => {
  const controls = scenarioControls({ ...plan, profile: { ...plan.profile, monthly_investment: 10000 } });
  assert.equal(controls.min, 0);
  assert.equal(controls.max, 30000);
  assert.equal(controls.required, 31);
  for (const preset of controls.presets) assert.ok(preset.value >= controls.min && preset.value <= controls.max);
});
test("excessive presets are disabled rather than silently clamped", () => {
  const controls = scenarioControls({ ...plan, profile: { ...plan.profile, monthly_investment: 1e12 } });
  assert.equal(controls.presets[1].value, 2e12);
  assert.equal(controls.presets[1].disabled, true);
  assert.equal(controls.max, 1e12);
});
