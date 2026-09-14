import test from "node:test";
import assert from "node:assert/strict";
import { createProfileCreator } from "./api";
import type { Plan } from "./types/plan";

const input = { full_name: "A", country: "Philippines", currency: "PHP", risk_tolerance: "Balanced", goal_target: 100, investment_horizon: 5, monthly_investment: 10, current_portfolio_value: 20 };
const plan = { profile: input, portfolio: [{ ticker: "VOO", asset_name: "VOO", allocation: 100 }], explanation: { summary: "Plan", reasons: [] }, projection: { starting_value: 20, projected_value: 100, investment_period_years: 5, assumed_return: .08, monthly_contribution: 10, required_monthly_investment: 10, yearly_projection: [] } } as Plan;
test("normal creation accepts saved plan without another read", async () => {
  const create = createProfileCreator(async () => ({}), async () => Response.json(plan), async () => { throw new Error("unnecessary read"); });
  assert.deepEqual(await create(input, "a"), plan);
});
test("lost creation response aborts POST and restores canonical saved profile without posting twice", async () => {
  let posts = 0;
  let signal: AbortSignal | undefined;
  const create = createProfileCreator(async () => ({}), async (_url, options) => {
    posts++; signal = options?.signal ?? undefined;
    return new Promise(() => {});
  }, async user => { assert.equal(user, "a"); return plan; }, 5);
  const result = await create(input, "a");
  assert.deepEqual(result.profile, input);
  assert.match(result.profile_warning ?? "", /restored/);
  assert.equal(signal?.aborted, true);
  assert.equal(posts, 1);
});
test("retry/conflicting input accepts existing canonical profile, never substitutes onboarding values", async () => {
  const create = createProfileCreator(async () => ({}), async () => Response.json({ ...plan, profile_warning: "Existing saved profile restored" }));
  assert.equal((await create({ ...input, goal_target: 999 }, "a")).profile.goal_target, 100);
});
test("unresolved creation and recovery failures are sanitized and bounded", async () => {
  for (const recover of [async () => null, async () => { throw new Error("private DB detail"); }, () => new Promise<Plan | null>(() => {})]) {
    const create = createProfileCreator(async () => ({}), async () => { throw new Error("private DB detail"); }, recover, 5);
    await assert.rejects(create(input, "a"), error => /confirm your saved profile/.test(String(error)) && !String(error).includes("private"));
  }
});
test("account change/unmount abort does not trigger recovery or publish an old plan", async () => {
  const controller = new AbortController();
  let reads = 0;
  const create = createProfileCreator(async () => ({}), () => new Promise(() => {}), async () => { reads++; return plan; });
  const pending = create(input, "a", controller.signal);
  controller.abort();
  await assert.rejects(pending, /cancelled/);
  assert.equal(reads, 0);
});

test("malformed creation success is reconciled rather than accepted as a plan", async () => {
  let reads = 0;
  const create = createProfileCreator(async () => ({}), async () => Response.json({}), async () => { reads++; return plan; });
  assert.deepEqual((await create(input, "a")).profile, input);
  assert.equal(reads, 1);
});

test("canonical recovery receives cancellation when account changes during the read", async () => {
  let started!: () => void;
  const entered = new Promise<void>(resolve => { started = resolve; });
  let signal: AbortSignal | undefined;
  const controller = new AbortController();
  const create = createProfileCreator(async () => ({}), async () => { throw new Error("offline"); }, async (_user, activeSignal) => {
    signal = activeSignal;
    started();
    return new Promise(() => {});
  });
  const pending = create(input, "a", controller.signal);
  await entered;
  controller.abort();
  await assert.rejects(pending);
  assert.equal(signal?.aborted, true);
});
