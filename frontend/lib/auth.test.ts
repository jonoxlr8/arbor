import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAuthHelpers } from "./auth";
import { InvalidSessionError } from "./accountRecovery";
import { confirmationRedirect, emailRedirectTo } from "./authConfig";
import { authErrorMessage } from "./authErrorMessage";
import { confirmationLinkFailed, entryFromHash } from "./publicEntry";

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
test("signup and resend both use the configured confirmation destination", async () => {
  const calls: unknown[] = [];
  const client = helpers({
    signUp: async (args: unknown) => { calls.push(args); return { data: { session: null }, error: null }; },
    resend: async (args: unknown) => { calls.push(args); return { data: {}, error: null }; },
  });
  await client.signUp("person@example.com", "test-password");
  await client.resendConfirmation("person@example.com");
  assert.deepEqual(calls, [
    { email: "person@example.com", password: "test-password", options: { emailRedirectTo } },
    { type: "signup", email: "person@example.com", options: { emailRedirectTo } },
  ]);
});
test("resend preserves rate-limit code for friendly copy without retrying", async () => {
  let calls = 0;
  try {
    await helpers({ resend: async () => { calls++; return { error: { code: "over_email_send_rate_limit", message: "Provider message" } }; } }).resendConfirmation("person@example.com");
    assert.fail("must reject");
  } catch (error) { assert.match(authErrorMessage(error), /Too many confirmation emails/); }
  assert.equal(calls, 1);
});
test("resend network failure is surfaced", async () => {
  await assert.rejects(helpers({resend: async () => { throw new Error("offline"); }}).resendConfirmation("a@b.com"), /offline/);
});
test("production confirmation URL is explicit HTTPS with no redirect injection", () => {
  assert.equal(confirmationRedirect(undefined, "development"), "http://localhost:3000/");
  assert.equal(confirmationRedirect(" https://arbor.example.com/ ", "production"), "https://arbor.example.com/");
  for (const value of [undefined, "", "http://arbor.example.com", "https://localhost", "https://127.0.0.1", "https://arbor.example.com/callback", "https://arbor.example.com?next=evil", "https://arbor.example.com/#login", "https://user:pass@arbor.example.com", "javascript:alert(1)"]) {
    assert.throws(() => confirmationRedirect(value, "production"));
  }
});
test("failed confirmation links open login without displaying provider detail", () => {
  const hash = "#error=access_denied&error_code=otp_expired&error_description=private-detail";
  assert.equal(confirmationLinkFailed(hash), true);
  assert.equal(entryFromHash(hash), "login");
  assert.equal(confirmationLinkFailed("#access_token=example&type=signup"), false);
});
