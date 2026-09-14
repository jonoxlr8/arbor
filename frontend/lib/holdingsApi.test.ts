import test from "node:test";
import assert from "node:assert/strict";
import { createHoldingsApi, type HoldingInput } from "./api";

const input: HoldingInput = { ticker: "VOO", asset_name: "Vanguard", asset_type: "ETF", quantity: 1, average_cost: 100, currency: "USD" };
const row = { ...input, id: 1, created_at: "2026-09-01T00:00:00Z" };
const headers = async () => ({ Authorization: "Bearer test-only" });

test("holdings GET/create/edit/delete use authenticated bounded requests and validate envelopes", async () => {
  const methods: string[] = [];
  const api = createHoldingsApi(headers, async (_url, options) => {
    assert.equal(new Headers(options?.headers).get("Authorization"), "Bearer test-only");
    assert.ok(options?.signal);
    methods.push(options?.method ?? "");
    return Response.json(options?.method === "GET" ? { holdings: [row] } : options?.method === "DELETE" ? { message: "Holding deleted successfully" } : { holding: row });
  });
  assert.deepEqual(await api.read(), [row]);
  assert.deepEqual(await api.create(input), row);
  assert.deepEqual(await api.update(1, input), row);
  await api.remove(1);
  assert.deepEqual(methods, ["GET", "POST", "PUT", "DELETE"]);
});

test("empty GET is valid, malformed 200 and unreadable responses never become empty", async () => {
  assert.deepEqual(await createHoldingsApi(headers, async () => Response.json({ holdings: [] })).read(), []);
  for (const body of [{}, { holdings: [row, { id: 2 }] }, { holdings: null }]) {
    await assert.rejects(createHoldingsApi(headers, async () => Response.json(body)).read(), /incomplete/);
  }
  await assert.rejects(createHoldingsApi(headers, async () => new Response("private invalid JSON")).read(), error => !String(error).includes("private"));
});

test("all mutations reject malformed success envelopes", async () => {
  const api = createHoldingsApi(headers, async () => Response.json({}));
  await assert.rejects(api.create(input), /incomplete/);
  await assert.rejects(api.update(1, input), /incomplete/);
  await assert.rejects(api.remove(1), /incomplete/);
});

test("401 is explicit failure, 409 friendly, and internal response details never escape", async () => {
  for (const status of [401, 409, 500]) {
    const api = createHoldingsApi(headers, async () => new Response("secret database details", { status }));
    for (const work of [() => api.read(), () => api.create(input), () => api.update(1, input), () => api.remove(1)]) {
      await assert.rejects(work(), error => {
        assert.doesNotMatch(String(error), /secret database/);
        if (status === 401) assert.match(String(error), /sign in again/);
        if (status === 409) assert.match(String(error), /already exists/);
        return true;
      });
    }
  }
});

test("GET and each mutation time out even when fetch ignores abort", async () => {
  const api = createHoldingsApi(headers, () => new Promise(() => {}), 5);
  for (const work of [() => api.read(), () => api.create(input), () => api.update(1, input), () => api.remove(1)]) await assert.rejects(work(), /in time/);
});

test("session lookup also has a deadline, and cancellation prevents late network access", async () => {
  let requests = 0;
  const hung = createHoldingsApi(() => new Promise(() => {}), async () => { requests++; return Response.json({ holdings: [] }); }, 5);
  await assert.rejects(hung.read(), /in time/);
  assert.equal(requests, 0);
  const controller = new AbortController();
  controller.abort();
  const api = createHoldingsApi(headers, async () => { requests++; return Response.json({ holdings: [] }); });
  await assert.rejects(api.read(controller.signal));
  assert.equal(requests, 0);
});
