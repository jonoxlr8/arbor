import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import AuthForm from "../components/AuthForm";
import PasswordResetRequest from "../components/PasswordResetRequest";
import ResetPassword from "../app/reset-password/ResetPassword";
import { passwordRecoveryRedirect, passwordResetRedirectTo } from "./authConfig";
import { captureRecoveryToken, parseRecoveryToken, verifyRecoveryToken, createRecoveryTracker, endRecoverySession, passwordValidation, requestPasswordReset, resetRequestMessage, updateRecoveryPassword } from "./passwordRecovery";

const tokenHash = "a".repeat(64);
test("recovery fragment requires one valid hash and recovery type only", () => {
  assert.deepEqual(parseRecoveryToken(`#token_hash=${tokenHash}&type=recovery`), { token_hash: tokenHash, type: "recovery" });
  for (const fragment of ["", "#", "#type=recovery", "#token_hash=short&type=recovery", `#token_hash=${tokenHash}&type=email`, `#token_hash=${tokenHash}&type=recovery&type=recovery`, `#token_hash=${tokenHash}&token_hash=${tokenHash}&type=recovery`, `#token_hash=${tokenHash}&type=recovery&next=https://evil.example`, "#token_hash=%3Cscript%3E&type=recovery", `#token_hash=${"a".repeat(513)}&type=recovery`]) {
    assert.equal(parseRecoveryToken(fragment), null);
  }
});
test("capture removes fragment and query immediately, with no verification", () => {
  const calls: unknown[] = [];
  const browser = { location: { hash: `#token_hash=${tokenHash}&type=recovery`, pathname: "/reset-password" }, history: { replaceState: (...args: unknown[]) => calls.push(args) } };
  const token = captureRecoveryToken(browser as unknown as Window);
  assert.deepEqual(calls, [[null, "", "/reset-password"]]);
  assert.equal(token?.token_hash, tokenHash);
  browser.location.hash = "#invalid";
  assert.equal(captureRecoveryToken(browser as unknown as Window), null);
  assert.equal(calls.length, 2);
});
test("explicit verification uses recovery OTP type and returns only verified identity", async () => {
  const calls: unknown[] = [];
  const sdk = client({ verifyOtp: async (input: unknown) => {
    calls.push(input);
    return { error: null, data: { session: { access_token: "test-session", user: { id: "owner" } } } };
  } });
  const token = parseRecoveryToken(`#token_hash=${tokenHash}&type=recovery`)!;
  assert.equal(calls.length, 0);
  assert.equal(await verifyRecoveryToken(sdk, token), "owner");
  assert.deepEqual(calls, [{ token_hash: tokenHash, type: "recovery" }]);
});
test("failed, expired, missing-session and timed-out verification cannot authorize reset", async () => {
  const token = { token_hash: tokenHash, type: "recovery" as const };
  for (const result of [
    { error: { message: "private", code: "otp_expired" }, data: { session: null } },
    { error: null, data: { session: null } },
    { error: null, data: { session: { user: { id: "owner" } } } },
  ]) assert.equal(await verifyRecoveryToken(client({ verifyOtp: async () => result }), token), null);
  assert.equal(await verifyRecoveryToken(client({ verifyOtp: async () => { throw new Error("private"); } }), token), null);
  assert.equal(await verifyRecoveryToken(client({ verifyOtp: () => new Promise(() => {}) }), token, 1), null);
});
test("page only opens password form after explicit verification; token is not persisted or logged", () => {
  const source = readFileSync("app/reset-password/ResetPassword.tsx", "utf8");
  const loadEffect = source.slice(source.indexOf("useEffect(() =>"), source.indexOf("async function verify()"));
  assert.match(loadEffect, /captureRecoveryToken\(window\)/);
  assert.doesNotMatch(loadEffect, /verifyRecoveryToken|verifyOtp|getSession|import\(/);
  assert.match(source, /onClick=\{\(\) => void verify\(\)\}/);
  assert.match(source, /setStatus\(owner.current \? "ready" : "invalid"\)/);
  assert.match(source, /status === "ready" \|\| status === "saving"/);
  assert.match(source, /token.current = null/);
  assert.doesNotMatch(source + readFileSync("lib/passwordRecovery.ts", "utf8"), /localStorage|sessionStorage|console\.|analytics/);
});

const client = (auth: Record<string, unknown>) => ({ auth }) as unknown as SupabaseClient;
test("forgot password belongs to login, not signup", () => {
  for (const mode of ["login", "signup"] as const) {
    const html = renderToStaticMarkup(createElement(AuthForm, { mode, onAuthenticated: () => {} }));
    assert.equal(html.includes('href="/forgot-password"'), mode === "login");
  }
});
test("request page collects email only and calls recovery helper", () => {
  const html = renderToStaticMarkup(createElement(PasswordResetRequest));
  assert.match(html, /type="email"/);
  assert.doesNotMatch(html, /type="password"/);
});
test("production reset redirect is validated and normalized", () => {
  assert.equal(passwordRecoveryRedirect(" https://arbor.ph/ ", "production"), "https://arbor.ph/reset-password");
  for (const url of [undefined, "http://arbor.ph", "https://localhost", "https://arbor.ph/evil", "https://arbor.ph?next=x"]) {
    assert.throws(() => passwordRecoveryRedirect(url, "production"));
  }
});
test("reset request uses the supported API and fixed redirect", async () => {
  const calls: unknown[] = [];
  assert.equal(await requestPasswordReset(client({ resetPasswordForEmail: async (...args: unknown[]) => { calls.push(args); return { error: null }; } }), " user@example.com "), null);
  assert.deepEqual(calls, [["user@example.com", { redirectTo: passwordResetRedirectTo }]]);
  assert.match(resetRequestMessage, /^If an account exists/);
});
for (const code of ["user_not_found", "email_not_confirmed", "user_banned"]) {
  test(`account-specific ${code} has the same neutral result`, async () => {
    assert.equal(await requestPasswordReset(client({ resetPasswordForEmail: async () => ({ error: { code, message: "private" } }) }), "x@y.com"), null);
  });
}
test("operational and rate errors are sanitized without retry", async () => {
  let calls = 0;
  const result = await requestPasswordReset(client({ resetPasswordForEmail: async () => { calls++; return { error: { code: "over_email_send_rate_limit", message: "private" } }; } }), "x@y.com");
  assert.match(result!, /Too many reset requests/);
  assert.equal(calls, 1);
  const failed = await requestPasswordReset(client({ resetPasswordForEmail: async () => { throw new Error("private"); } }), "x@y.com");
  assert.doesNotMatch(failed!, /private/);
});
test("ordinary session cannot authorize password recovery; account switch clears it", () => {
  const tracker = createRecoveryTracker();
  const session = { user: { id: "a" } };
  tracker.authChanged("INITIAL_SESSION", session);
  assert.equal(tracker.getUserId(), null);
  tracker.authChanged("PASSWORD_RECOVERY", session);
  assert.equal(tracker.getUserId(), "a");
  tracker.authChanged("USER_UPDATED", session);
  assert.equal(tracker.getUserId(), "a");
  tracker.authChanged("SIGNED_IN", { user: { id: "b" } });
  assert.equal(tracker.getUserId(), null);
});
test("recovery event survives a late UI subscription; signout clears it", () => {
  const tracker = createRecoveryTracker();
  tracker.authChanged("PASSWORD_RECOVERY", { user: { id: "a" } });
  let calls = 0;
  const unsubscribe = tracker.subscribe(() => calls++);
  assert.equal(tracker.getUserId(), "a");
  tracker.authChanged("SIGNED_OUT", null);
  assert.equal(tracker.getUserId(), null);
  assert.equal(calls, 1);
  unsubscribe();
});
test("mismatched or short passwords never reach Supabase", async () => {
  assert.match(passwordValidation("short", "short")!, /8 characters/);
  assert.match(await updateRecoveryPassword(client({}), "a", "long-password", "different-password") ?? "", /don’t match/);
});
test("valid recovery user updates password and local signout is explicit", async () => {
  const calls: unknown[] = [];
  const sdk = client({
    getUser: async () => ({ data: { user: { id: "a" } }, error: null }),
    updateUser: async (args: unknown) => { calls.push(args); return { error: null }; },
    signOut: async (args: unknown) => { calls.push(args); return { error: null }; },
  });
  assert.equal(await updateRecoveryPassword(sdk, "a", "long-password", "long-password"), null);
  assert.equal(await endRecoverySession(sdk), true);
  assert.deepEqual(calls, [{ password: "long-password" }, { scope: "local" }]);
});
test("expired or different user cannot update password", async () => {
  const result = await updateRecoveryPassword(client({ getUser: async () => ({ data: { user: { id: "b" } }, error: null }) }), "a", "long-password", "long-password");
  assert.match(result!, /expired or already used/);
});
test("update and signout failures fail safely", async () => {
  const result = await updateRecoveryPassword(client({
    getUser: async () => ({ data: { user: { id: "a" } }, error: null }),
    updateUser: async () => ({ error: { message: "private" } }),
  }), "a", "long-password", "long-password");
  assert.match(result!, /couldn’t change/);
  assert.doesNotMatch(result!, /private/);
  assert.equal(await endRecoverySession(client({ signOut: async () => ({ error: {} }) })), false);
});
test("reset route offers login and a new email without assuming stored session is valid", () => {
  const html = renderToStaticMarkup(createElement(ResetPassword));
  assert.match(html, /Checking your reset link/);
  assert.match(html, /href="\/#login"/);
  assert.match(html, /href="\/forgot-password"/);
  assert.doesNotMatch(html, /type="password"/);
});
