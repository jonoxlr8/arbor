import test from "node:test";
import assert from "node:assert/strict";
import { createHoldingsRecovery, holdingsHealthKey, initialHoldingsState, parseHoldingsResponse, type HoldingsState } from "./holdingsRecovery";
import { calculatePortfolioSummary } from "./portfolio/calculations";
import type { Holding } from "./api";

const row: Holding = { id: 1, created_at: "2026-09-01T00:00:00Z", ticker: "VOO", asset_name: "Vanguard", asset_type: "ETF", quantity: 2, average_cost: 100, currency: "USD" };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness(read: (signal: AbortSignal) => Promise<Holding[]>, timeout = 50) {
  const states: HoldingsState[] = [initialHoldingsState];
  const recovery = createHoldingsRecovery(read, state => states.push(state), timeout);
  return { recovery, states, current: () => states.at(-1)! };
}

test("holdings parser accepts complete rows and a legitimate empty collection without repairing data", () => {
  const legacy = { ...row, ticker: " voo ", currency: " usd " };
  assert.deepEqual(parseHoldingsResponse({ holdings: [legacy] }), [legacy]);
  assert.deepEqual(parseHoldingsResponse({ holdings: [] }), []);
});

test("holdings parser rejects malformed envelopes and every incomplete row, never a partial collection", () => {
  for (const body of [null, [], {}, { holdings: null }, { holdings: {} }]) assert.throws(() => parseHoldingsResponse(body));
  for (const edit of [
    { id: undefined }, { id: -1 }, { id: 1.5 }, { ticker: " " }, { ticker: 123 },
    { created_at: undefined }, { created_at: "invalid" }, { asset_name: null }, { asset_type: undefined },
    { quantity: undefined }, { quantity: "2" }, { quantity: NaN }, { quantity: Infinity },
    { average_cost: -1 }, { average_cost: Infinity }, { currency: {} },
    { quantity: Number.MAX_VALUE, average_cost: Number.MAX_VALUE },
  ]) assert.throws(() => parseHoldingsResponse({ holdings: [row, { ...row, id: 2, ...edit }] }));
  assert.throws(() => parseHoldingsResponse({ holdings: [row, row] }));
});

test("legacy currency is readable but unavailable for aggregation; zero basis stays valid input", () => {
  for (const currency of [undefined, null, "", "unknown"]) {
    const rows = parseHoldingsResponse({ holdings: [{ ...row, currency }] });
    assert.equal(rows[0].currency, currency);
    assert.equal(calculatePortfolioSummary(rows).status, "invalid_currency");
  }
  const rows = parseHoldingsResponse({ holdings: [{ ...row, quantity: 0 }] });
  assert.equal(calculatePortfolioSummary(rows).status, "zero_basis");
});

test("initial successful complete load enables analysis and Health, including legitimate empty load", async () => {
  for (const rows of [[row], []]) {
    const h = harness(async () => rows);
    assert.equal(holdingsHealthKey(h.current(), "Balanced"), null);
    assert.equal(await h.recovery.load(), true);
    const state = h.current();
    assert.equal(state.status, "loaded");
    if (state.status !== "loaded") throw new Error("not loaded");
    assert.deepEqual(state.holdings, rows);
    assert.equal(calculatePortfolioSummary(state.holdings).status, rows.length ? "available" : "empty");
    assert.notEqual(holdingsHealthKey(state, "Balanced"), null);
  }
});

test("failed initial load is not an empty portfolio, prevents Add, and Retry restores the full collection", async () => {
  let failing = true;
  const rows = [row, { ...row, id: 2, ticker: "QQQM" }];
  const h = harness(async () => { if (failing) throw new Error("private database detail"); return rows; });
  let creates = 0;
  assert.equal(await h.recovery.mutate(async () => { creates++; }), false);
  await h.recovery.load();
  assert.equal(h.current().status, "error");
  assert.equal("holdings" in h.current(), false);
  assert.equal(holdingsHealthKey(h.current(), "Balanced"), null);
  assert.doesNotMatch(JSON.stringify(h.current()), /private database/);
  assert.equal(await h.recovery.mutate(async () => { creates++; }), false);
  assert.equal(creates, 0);
  failing = false;
  await h.recovery.load();
  assert.deepEqual(h.current(), { status: "loaded", revision: 2, holdings: rows });
});

test("never-settling initial load times out, then Retry succeeds", async () => {
  let hang = true;
  const h = harness(() => hang ? new Promise(() => {}) : Promise.resolve([row]), 5);
  await h.recovery.load();
  assert.equal(h.current().status, "error");
  hang = false;
  assert.equal(await h.recovery.load(), true);
});

test("stale first load cannot overwrite a successful Retry even if transport ignores abort", async () => {
  const old = deferred<Holding[]>();
  let count = 0;
  const h = harness(() => ++count === 1 ? old.promise : Promise.resolve([row]));
  const first = h.recovery.load();
  await Promise.resolve();
  await h.recovery.load();
  old.resolve([]);
  await first;
  assert.deepEqual(h.current(), { status: "loaded", revision: 2, holdings: [row] });
});

for (const action of ["Add", "Edit", "Delete"]) {
  test(`${action} prevents double submission and awaits authoritative reload before analytics/Health return`, async () => {
    const write = deferred<void>();
    const reload = deferred<Holding[]>();
    let reads = 0, writes = 0;
    const h = harness(() => ++reads === 1 ? Promise.resolve([row]) : reload.promise);
    await h.recovery.load();
    const oldKey = holdingsHealthKey(h.current(), "Balanced");
    const work = () => { writes++; return write.promise; };
    const saving = h.recovery.mutate(work);
    assert.equal(holdingsHealthKey(h.current(), "Balanced"), null);
    assert.equal(await h.recovery.mutate(work), false);
    assert.equal(await h.recovery.load(), false);
    assert.equal(writes, 1);
    write.resolve();
    // Until the canonical read settles, no locally patched array is published.
    await Promise.resolve();
    assert.equal(h.current().status, "loading");
    const authoritative = [{ ...row, id: 3, ticker: "SMH" }];
    reload.resolve(authoritative);
    assert.equal(await saving, true);
    assert.equal(reads, 2);
    assert.deepEqual(h.current(), { status: "loaded", revision: 2, holdings: authoritative });
    assert.notEqual(holdingsHealthKey(h.current(), "Balanced"), oldKey);
  });
}

test("mutation failure requires a reload because a timeout can hide a committed write; controls recover after Retry", async () => {
  const h = harness(async () => [row], 5);
  await h.recovery.load();
  await h.recovery.mutate(() => new Promise(() => {}));
  assert.equal(h.current().status, "error");
  assert.equal(holdingsHealthKey(h.current(), "Balanced"), null);
  assert.equal(await h.recovery.load(), true);
  assert.equal(await h.recovery.mutate(async () => {}), true);
});

test("successful write with failed synchronization invalidates both holdings analytics and Health", async () => {
  let reads = 0;
  const h = harness(async () => { if (++reads === 2) throw new Error("offline"); return [row]; });
  await h.recovery.load();
  assert.equal(await h.recovery.mutate(async () => {}), false);
  const state = h.current();
  assert.equal(state.status, "error");
  if (state.status === "error") assert.match(state.error, /change was saved/);
  assert.equal(holdingsHealthKey(state, "Balanced"), null);
  await h.recovery.load();
  assert.equal(h.current().status, "loaded");
});

test("unmount/account replacement cancels work and ignores late completions", async () => {
  const old = deferred<Holding[]>();
  let signal: AbortSignal | undefined;
  const h = harness(s => { signal = s; return old.promise; });
  const pending = h.recovery.load();
  await Promise.resolve();
  h.recovery.dispose();
  const count = h.states.length;
  assert.equal(signal?.aborted, true);
  old.resolve([row]);
  await pending;
  assert.equal(h.states.length, count);
  assert.equal(await h.recovery.load(), false);
  assert.equal(await h.recovery.mutate(async () => {}), false);
});

test("Health identity changes only with canonical revision or effective risk", () => {
  const state: HoldingsState = { status: "loaded", revision: 1, holdings: [row] };
  assert.equal(holdingsHealthKey(state, "Balanced"), holdingsHealthKey(state, "Balanced"));
  assert.notEqual(holdingsHealthKey(state, "Balanced"), holdingsHealthKey(state, "Aggressive"));
  assert.notEqual(holdingsHealthKey(state, "Balanced"), holdingsHealthKey({ ...state, revision: 2 }, "Balanced"));
});

test("timed-out post-mutation reload cannot overwrite a later successful recovery", async () => {
  const stale = deferred<Holding[]>();
  let reads = 0;
  const newer = [{ ...row, quantity: 5 }];
  const h = harness(() => ++reads === 2 ? stale.promise : Promise.resolve(reads === 1 ? [row] : newer), 5);
  await h.recovery.load();
  await h.recovery.mutate(async () => {});
  assert.equal(h.current().status, "error");
  await h.recovery.load();
  stale.resolve([row]);
  await Promise.resolve();
  assert.deepEqual(h.current(), { status: "loaded", revision: 3, holdings: newer });
});

test("unmount during mutation aborts and never launches an obsolete canonical reload", async () => {
  const write = deferred<void>();
  let reads = 0;
  const h = harness(async () => { reads++; return [row]; });
  await h.recovery.load();
  const pending = h.recovery.mutate(() => write.promise);
  await Promise.resolve();
  h.recovery.dispose();
  const count = h.states.length;
  write.resolve();
  assert.equal(await pending, false);
  assert.equal(reads, 1);
  assert.equal(h.states.length, count);
});
