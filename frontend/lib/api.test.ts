import test from "node:test";
import assert from "node:assert/strict";
import { createProfileReader, ProfileApiError } from "./api";
import { createAccountRecovery, InvalidSessionError, type AccountState } from "./accountRecovery";
import { createAuthHelpers } from "./auth";
import type { SupabaseClient } from "@supabase/supabase-js";

const plan = {
  profile: { full_name: "A", country: "Philippines", currency: "PHP", risk_tolerance: "Balanced", goal_target: 100, investment_horizon: 5, monthly_investment: 10, current_portfolio_value: 20 },
  portfolio: [{ ticker: "VOO", asset_name: "VOO", allocation: 100 }],
  projection: { starting_value: 20, projected_value: 100, investment_period_years: 5, assumed_return: 8, monthly_contribution: 10, required_monthly_investment: 10, yearly_projection: [] },
  explanation: { summary: "Example", reasons: [] },
};
const token = async () => "token";
const reply = (body: unknown, status = 200): typeof fetch => async () => new Response(JSON.stringify(body), { status });
test("valid plan is restored", async () => assert.deepEqual(await createProfileReader(token, reply(plan))("a"), plan));
test("exact 404 contract means missing profile", async () => assert.equal(await createProfileReader(token, reply({ detail: "Profile not found" }, 404))("a"), null));
for (const status of [404, 500]) test(`unexpected ${status} remains API error`, async () => {
  await assert.rejects(createProfileReader(token, reply({ detail: "Not Found" }, status))("a"), ProfileApiError);
});
test("network error is preserved", async () => {
  await assert.rejects(createProfileReader(token, async () => { throw Error("offline"); })("a"), /offline/);
});
for (const body of [null, {}, { ...plan, projection: {} }]) test("malformed success is rejected " + JSON.stringify(body).slice(0, 20), async () => {
  await assert.rejects(createProfileReader(token, reply(body))("a"), /incomplete/);
});
test("401 refreshes once and restores profile", async () => {
  const refreshes: boolean[] = []; let calls = 0;
  const reader = createProfileReader(async (_id, refresh) => { refreshes.push(refresh ?? false); return "token"; },
    async () => ++calls === 1 ? new Response("", { status: 401 }) : new Response(JSON.stringify(plan)));
  assert.deepEqual(await reader("a"), plan); assert.deepEqual(refreshes, [false, true]); assert.equal(calls, 2);
});
test("repeated 401 stops after one retry", async () => {
  let calls = 0;
  await assert.rejects(createProfileReader(token, async () => { calls++; return new Response("", { status: 401 }); })("a"), InvalidSessionError);
  assert.equal(calls, 2);
});
test("temporary refresh failure is not invalid credentials", async () => {
  await assert.rejects(createProfileReader(async (_id, refresh) => { if (refresh) throw Error("offline"); return "token"; }, reply({}, 401))("a"), /offline/);
});
test("timeout aborts a never-settling fetch", async () => {
  let signal: AbortSignal | null | undefined;
  await assert.rejects(createProfileReader(token, async (_url, options) => {
    signal = options?.signal; return new Promise(() => {});
  }, 5)("a"), /timed out/);
  assert.equal(signal?.aborted, true);
});

test("invalid refresh stops without another profile request", async () => {
  let calls = 0;
  await assert.rejects(createProfileReader(async (_id, refresh) => {
    if (refresh) throw new InvalidSessionError();
    return "token";
  }, async () => { calls++; return new Response("", { status: 401 }); })("a"), InvalidSessionError);
  assert.equal(calls, 1);
});

test("non-JSON API errors retain HTTP status", async () => {
  await assert.rejects(createProfileReader(token, async () => new Response("Unavailable", { status: 503 }))("a"),
    (error: unknown) => error instanceof ProfileApiError && error.status === 503);
});

test("a stalled response body is bounded too", async () => {
  await assert.rejects(createProfileReader(token, async () => new Response(new ReadableStream({ start() {} })), 5)("a"), /timed out/);
});

for (const stored of [null, { user: { id: "a" }, access_token: "stale-token" }]) {
  test("sign-in token reaches profile request despite " + (stored ? "stale" : "missing") + " stored session", async () => {
    let lookups = 0;
    const fresh = { user: { id: "a" }, access_token: "fresh-sign-in-token" };
    const auth = createAuthHelpers(async () => ({
      auth: {
        signInWithPassword: async () => ({ data: { session: fresh }, error: null }),
        getSession: async () => { lookups++; return { data: { session: stored }, error: null }; },
      },
    }) as unknown as SupabaseClient);
    const states: AccountState[] = [];
    const reader = createProfileReader(auth.getAccessToken, async (_url, options) => {
      assert.equal(new Headers(options?.headers).get("Authorization"), "Bearer fresh-sign-in-token");
      return new Response(JSON.stringify(plan));
    });
    const coordinator = createAccountRecovery({
      getUser: auth.getCurrentUser, getProfile: reader,
      onState: state => states.push(state), onIdentityChange: () => {},
    });
    const result = await auth.signIn("test@example.com", "test-password");
    assert.ok(result.data.session);
    await coordinator.authenticated(result.data.session);
    assert.equal(lookups, 0);
    assert.deepEqual(states.at(-1), { status: "ready", userId: "a", plan });
  });
}

test("startup restoration still reads a persisted session", async () => {
  let sessionReads = 0;
  const auth = createAuthHelpers(async () => ({
    auth: {
      getSession: async () => { sessionReads++; return { data: { session: { user: { id: "a" }, access_token: "persisted" } }, error: null }; },
      getUser: async () => ({ data: { user: { id: "a" } }, error: null }),
    },
  }) as unknown as SupabaseClient);
  const states: AccountState[] = [];
  const coordinator = createAccountRecovery({
    getUser: auth.getCurrentUser,
    getProfile: createProfileReader(auth.getAccessToken, async (_url, options) => {
      assert.equal(new Headers(options?.headers).get("Authorization"), "Bearer persisted");
      return new Response(JSON.stringify(plan));
    }),
    onState: state => states.push(state), onIdentityChange: () => {},
  });
  await coordinator.restore();
  assert.equal(states.at(-1)?.status, "ready");
  assert.equal(sessionReads, 2);
});

test("a rejected known token is refreshed once and replaced in the retry header", async () => {
  const refreshes: boolean[] = [];
  const headers: (string | null)[] = [];
  const reader = createProfileReader(async (_id, refresh) => {
    refreshes.push(refresh ?? false);
    return "refreshed";
  }, async (_url, options) => {
    headers.push(new Headers(options?.headers).get("Authorization"));
    return headers.length === 1 ? new Response("", { status: 401 }) : new Response(JSON.stringify(plan));
  });
  assert.deepEqual(await reader("a", "expired"), plan);
  assert.deepEqual(headers, ["Bearer expired", "Bearer refreshed"]);
  assert.deepEqual(refreshes, [true]);
});

test("a known token still stops after two rejected requests", async () => {
  let refreshes = 0;
  let requests = 0;
  const reader = createProfileReader(async () => { refreshes++; return "refreshed"; },
    async () => { requests++; return new Response("", { status: 401 }); });
  await assert.rejects(reader("a", "rejected"), InvalidSessionError);
  assert.equal(refreshes, 1);
  assert.equal(requests, 2);
});

for (const [status, expected] of [[404, "no-profile"], [500, "error"]] as const) {
  test("auth event token preserves " + expected + " routing", async () => {
    const states: AccountState[] = [];
    const coordinator = createAccountRecovery({
      getUser: async () => { throw Error("Must not re-query the user"); },
      getProfile: createProfileReader(async () => { throw Error("Must not re-query the token"); },
        async (_url, options) => {
          assert.equal(new Headers(options?.headers).get("Authorization"), "Bearer event-token");
          return new Response(JSON.stringify({ detail: "Profile not found" }), { status });
        }),
      onState: state => states.push(state), onIdentityChange: () => {},
    });
    await coordinator.authChanged("SIGNED_IN", { user: { id: "a" }, access_token: "event-token" });
    assert.equal(states.at(-1)?.status, expected);
  });
}
