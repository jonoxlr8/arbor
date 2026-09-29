import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPendingApi } from "./pendingRecordings";

const item = { id: "00000000-0000-4000-8000-000000000001", product_id: "gotrade_vt", provider: "gotrade",
  source: "monthly", status: "pending", started_at: "2026-09-28T00:00:00Z", resolved_at: null };

test("viewing pending state is read-only and does not create intent", async () => {
  const calls: { url: string; options: RequestInit }[] = [];
  const api = createPendingApi(async owner => { assert.equal(owner, "owner-A"); return "fixture-token"; }, async (url, options) => {
    calls.push({ url: String(url), options: options! }); return Response.json({ items: [item] });
  });
  assert.equal((await api.list("owner-A")).length, 1);
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.body, undefined);
  assert.equal((calls[0].options.headers as Record<string, string>).Authorization, "Bearer fixture-token");
  assert.doesNotMatch(calls[0].url, /owner-A|fixture-token/);
});

test("repeated explicit provider continuation reuses unresolved intent", async () => {
  let calls = 0;
  const api = createPendingApi(async () => "fixture-token", async (_url, options) => {
    calls++; assert.deepEqual(JSON.parse(String(options?.body)), { product_id: "gotrade_vt", provider: "gotrade" });
    return Response.json(item);
  });
  assert.equal((await api.start("owner-A", "gotrade_vt", "gotrade")).id, item.id);
  assert.equal((await api.start("owner-A", "gotrade_vt", "gotrade")).id, item.id);
  assert.equal(calls, 2);
});

test("dismissal and already-recorded clear only reminder state", async () => {
  const seen: string[] = [];
  const api = createPendingApi(async () => "fixture-token", async (url, options) => {
    seen.push(String(url));
    assert.equal(options?.method, "POST");
    assert.deepEqual(JSON.parse(String(options?.body)), { resolution: "dismissed" });
    return Response.json({ ...item, status: "dismissed", resolved_at: "2026-09-28T01:00:00Z" });
  });
  assert.equal((await api.resolve("owner-A", item.id, "dismissed")).status, "dismissed");
  assert.match(seen[0], /pending-recordings\/00000000-0000-4000-8000-000000000001\/resolve/);
  assert.doesNotMatch(seen[0], /portfolio\/entries/);
});

test("invalid response cannot confirm provider exit or resolution", async () => {
  const api = createPendingApi(async () => "fixture-token", async () => Response.json({}));
  await assert.rejects(api.start("owner-A", "gotrade_vt", "gotrade"), /could not be verified/);
  await assert.rejects(api.list("owner-A"), /could not be verified/);
  await assert.rejects(api.resolve("owner-A", item.id, "recorded"), /could not be verified/);
});

test("provider navigation follows persisted start; ledger save precedes pending resolution", () => {
  const monthly = readFileSync("components/contributions/MonthlyInvesting.tsx", "utf8");
  const providerContinue = readFileSync("components/contributions/ProviderContinue.tsx", "utf8");
  const ways = readFileSync("components/portfolio/PlanImplementation.tsx", "utf8");
  const pending = readFileSync("components/contributions/MonthlyPendingRecording.tsx", "utf8");
  assert.ok(providerContinue.indexOf("await pendingApi.start") < providerContinue.indexOf("window.location.assign(destination!)"));
  assert.match(monthly, /ProviderContinue/);
  assert.match(ways, /ProviderContinue/);
  assert.ok(pending.indexOf('onSaved={() =>') < pending.indexOf('pendingApi.resolve(userId, id, "recorded")'));
  assert.doesNotMatch(providerContinue, /pendingApi\.start.*checkin|pendingApi\.start.*calculate/);
  assert.match(pending, /Do not record it again/);
});
