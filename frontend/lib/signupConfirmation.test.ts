import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SignupConfirmation from "../app/confirm-signup/SignupConfirmation";
import { parseSignupToken, confirmSignupToken } from "./signupConfirmation";

const token_hash = "a".repeat(64);
const token = { token_hash, type: "email" as const };
test("parses the documented email TokenHash fragment only", () => {
  assert.deepEqual(parseSignupToken(`#token_hash=${token_hash}&type=email`), token);
  assert.deepEqual(parseSignupToken(`#type=email&token_hash=${token_hash}`), token);
});
test("rejects missing, malformed, duplicate and unsupported confirmation data", () => {
  for (const fragment of ["", "?token_hash=x&type=email", "#confirmation_url=https://example.com",
    `#token_hash=${token_hash}`, "#token_hash=bad&type=email",
    `#token_hash=${token_hash}&type=signup`, `#token_hash=${token_hash}&type=recovery`,
    `#token_hash=${token_hash}&type=email&type=email`,
    `#token_hash=${token_hash}&token_hash=${token_hash}&type=email`,
    `#token_hash=${token_hash}&type=email&redirect_to=https://evil.example`]) {
    assert.equal(parseSignupToken(fragment), null);
  }
});
test("explicit confirmation calls verifyOtp-compatible operation with email type and requires session", async () => {
  let calls = 0;
  const verify = async (input: typeof token) => {
    calls++; assert.deepEqual(input, token);
    return {error: null, data: {session: {access_token: "test-session"}}};
  };
  parseSignupToken(`#token_hash=${token_hash}&type=email`);
  assert.equal(calls, 0);
  assert.equal(await confirmSignupToken(token, verify), true);
  assert.equal(calls, 1);
  assert.equal(await confirmSignupToken(token, async () => ({error:null, data:{session:null}})), false);
});
test("expired, used, network and never-settling responses fail safely without retries", async () => {
  let calls = 0;
  assert.equal(await confirmSignupToken(token, async () => { calls++; return {error:{message:"private provider details"},data:{session:null}}; }), false);
  assert.equal(calls, 1);
  assert.equal(await confirmSignupToken(token, async () => {throw Error("private details");}), false);
  assert.equal(await confirmSignupToken(token, () => new Promise(() => {}), 5), false);
});
test("server render is inert; UI clears fragment and only verifies in click handler", () => {
  const html = renderToStaticMarkup(createElement(SignupConfirmation));
  assert.match(html, /Checking your confirmation link/);
  assert.match(html, /href="\/#login"/);
  assert.doesNotMatch(html, /token_hash=|auth\/v1\/verify/);
  const source = readFileSync("app/confirm-signup/SignupConfirmation.tsx", "utf8");
  assert.match(source, /onClick=\{confirm\}/);
  assert.ok(source.indexOf("history.replaceState") < source.indexOf("token.current = parseSignupToken"));
  assert.ok(source.indexOf("async function confirm") < source.indexOf("supabase.auth.verifyOtp"));
  assert.match(source, /if \(!token.current \|\| busy.current\) return/);
  assert.match(source, /if \(!mounted.current\) return/);
  assert.doesNotMatch(source, /console\.|localStorage|sessionStorage/);
});
