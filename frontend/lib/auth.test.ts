import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAuthHelpers } from "./auth";
import { InvalidSessionError } from "./accountRecovery";

function helpers(auth: Record<string, unknown>) {
  return createAuthHelpers(async () => ({ auth }) as unknown as SupabaseClient);
}
test("signup confirmation is a successful result without session", async () => {
  const result = { data: { session: null }, error: null };
  assert.deepEqual(await helpers({ signUp: async () => result }).signUp("a", "b"), result);
});
test("signup failure is surfaced separately", async () => {
  await assert.rejects(helpers({ signUp: async () => ({ error: { message: "Rejected" } }) }).signUp("a", "b"), /Rejected/);
});
test("returned signout error is surfaced", async () => {
  await assert.rejects(helpers({ signOut: async () => ({ error: { message: "offline" } }) }).signOut(), /offline/);
});
test("missing session returns null", async () => {
  assert.equal(await helpers({ getSession: async () => ({ data: { session: null }, error: null }) }).getCurrentUser(), null);
});
test("session lookup errors are not discarded", async () => {
  await assert.rejects(helpers({ getSession: async () => ({ error: { message: "offline" } }) }).getCurrentUser(), /offline/);
});
test("invalid refresh token is classified as invalid session", async () => {
  await assert.rejects(helpers({ refreshSession: async () => ({ error: { code: "refresh_token_not_found", message: "invalid" } }) }).getAccessToken("a", true), InvalidSessionError);
});
test("different account token cannot be used for old account", async () => {
  await assert.rejects(helpers({ getSession: async () => ({ data: { session: { user: { id: "b" }, access_token: "token" } }, error: null }) }).getAccessToken("a"), InvalidSessionError);
});

test("user verification errors are preserved", async () => {
  await assert.rejects(helpers({
    getSession: async () => ({ data: { session: {} }, error: null }),
    getUser: async () => ({ data: { user: null }, error: { message: "offline" } }),
  }).getCurrentUser(), /offline/);
});

test("successful refresh returns the new access token", async () => {
  assert.equal(await helpers({
    refreshSession: async () => ({ data: { session: { user: { id: "a" }, access_token: "new" } }, error: null }),
  }).getAccessToken("a", true), "new");
});
