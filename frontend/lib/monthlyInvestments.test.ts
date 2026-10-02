import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { recordingRows, investmentAction, plannedRecordingProducts } from "./monthlyInvestments";
import { monthlyPlanFixture } from "./monthlyPlan.test";
import { portfolioFixture } from "./livePortfolio.test";
import { createPortfolioApi, type InvestmentEntry } from "./livePortfolio";

const entry: InvestmentEntry = { id: "entry", holding_id: "holding", product_id: "gotrade_vt", provider: "gotrade",
  investment_date: "2026-08-15", units: "0.5", amount_paid_php: null,
  recorded_at: "2026-09-28T01:00:00Z", updated_at: "2026-09-28T01:00:00Z", revision: 1, voided_at: null };

test("monthly preview chooses only exact supported product/provider and never constructs cost or units", () => {
  const plan = structuredClone(monthlyPlanFixture);
  plan.rows = [{ ...plan.rows[0], product_id: "gotrade_vt", provider_id: "gotrade", amount: "8000" },
    { ...plan.rows[0], sleeve: "crypto", product_id: null, provider_id: null, amount: "2000" },
    { ...plan.rows[0], sleeve: "technology_tilt", amount: "0" }];
  const rows = recordingRows(plan, portfolioFixture.catalog);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { sleeve: "global_equity", plannedAmount: "8000", product: portfolioFixture.catalog[0] });
  assert.equal(rows[1].product, null);
  assert.equal(Object.hasOwn(rows[0], "units"), false);
  assert.equal(Object.hasOwn(rows[0], "amount_paid_php"), false);
  assert.deepEqual(recordingRows(null, portfolioFixture.catalog), []);
});

test("month and recent ledger requests are read-only, owner-token scoped and distinct", async () => {
  const calls: { url: string; options: RequestInit }[] = [];
  const api = createPortfolioApi(async owner => { assert.equal(owner, "owner-A"); return "local-token"; }, async (url, options) => {
    calls.push({ url: String(url), options: options! });
    return Response.json({ entries: [], page: 0, has_more: false });
  });
  await api.activity("owner-A", undefined, 0, undefined, { month: "2026-08" });
  await api.activity("owner-A", undefined, 0, undefined, { recent: true });
  assert.match(calls[0].url, /month=2026-08/);
  assert.match(calls[1].url, /recent=true/);
  for (const call of calls) {
    assert.equal(call.options.method, "GET");
    assert.equal(call.options.body, undefined);
    assert.equal((call.options.headers as Record<string, string>).Authorization, "Bearer local-token");
    assert.doesNotMatch(call.url, /owner-A/);
  }
});

test("uncertain save retries the same idempotency key and malformed success is never confirmed", async () => {
  const requests: unknown[] = [];
  let attempt = 0;
  const api = createPortfolioApi(async () => "local-token", async (_url, options) => {
    requests.push(JSON.parse(String(options?.body)));
    attempt++;
    if (attempt === 1) throw new TypeError("network interruption");
    return Response.json({ entry_id: "entry", holding_id: "holding", replayed: true });
  });
  const draft = { product_id: "gotrade_vt", provider: "gotrade", investment_date: "2026-09-15", units: "0.4",
    amount_paid_php: null, idempotency_key: "one-intended-addition" };
  await assert.rejects(api.recordEntry("owner-A", draft));
  assert.equal((await api.recordEntry("owner-A", draft)).replayed, true);
  assert.deepEqual(requests, [draft, draft]);
  await assert.rejects(createPortfolioApi(async () => "local-token", async () => Response.json({})).recordEntry("owner-A", draft),
    /load your portfolio correctly/);
});

test("correction and deletion are not presented as another purchase or a sale", () => {
  assert.equal(investmentAction(entry), "Recorded");
  assert.equal(investmentAction({ ...entry, revision: 2 }), "Corrected");
  assert.equal(investmentAction({ ...entry, voided_at: "2026-09-28T02:00:00Z" }), "Deleted");
});

test("monthly flow uses one existing ledger save and never copies planned PHP into actual cost", () => {
  const followup = readFileSync("components/contributions/MonthlyInvestmentFollowup.tsx", "utf8");
  const form = readFileSync("components/portfolio/DatedInvestmentFlow.tsx", "utf8");
  assert.match(followup, /DatedInvestmentFlow/);
  assert.doesNotMatch(followup, /portfolioApi\.(recordEntry|save|capture)/);
  assert.match(form, /portfolioApi\.recordEntry\(userId, draft\)/);
  assert.match(form, /idempotency_key: crypto\.randomUUID\(\)/);
  assert.match(form, /plannedAmount.*context only/);
  assert.match(form, /amount_paid_php: null/);
  assert.doesNotMatch(form, /amount_paid_php: plannedAmount|units: plannedAmount/);
});

test("planned picker scopes only positive recordable exact pairs and clears invalid plans", () => {
 const catalog=portfolioFixture.catalog; const plan=structuredClone(monthlyPlanFixture);
 plan.rows=[{...plan.rows[0],product_id:catalog[0].product_id,provider_id:catalog[0].provider,amount:"100",status:"ready"},
 {...plan.rows[0],sleeve:"technology_tilt",product_id:catalog[0].product_id,provider_id:"wrong",amount:"100",status:"ready"},
 {...plan.rows[0],sleeve:"defensive",product_id:catalog[0].product_id,provider_id:catalog[0].provider,amount:"99",status:"below_minimum"}];
 assert.deepEqual(plannedRecordingProducts(plan,catalog),[catalog[0]]);
 assert.deepEqual(plannedRecordingProducts(null,catalog),[]);
 plan.rows[0].sleeve="crypto";assert.deepEqual(plannedRecordingProducts(plan,catalog),[]);
 plan.rows[0].sleeve="global_equity";plan.rows[0].amount="0";assert.deepEqual(plannedRecordingProducts(plan,catalog),[]);
});
