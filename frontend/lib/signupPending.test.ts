import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SignupPending from "../components/SignupPending";
import { confirmationContext, neutralResendMessage } from "./authConfirmation";

const props = { email: "alex@example.com", loading: false, cooldown: 0, resendDisabled: false, confirmation: "", error: "", onResend: () => {}, onDifferentEmail: () => {} };
test("pending screen preserves auth card styling without duplicating the shell logo", () => {
  const html = renderToStaticMarkup(createElement(SignupPending, props));
  assert.doesNotMatch(html, /arbor-logo-color|ARBOR|<svg/);
  assert.match(html, /max-w-md/);
  assert.match(html, /mt-7 text-2xl/);
  assert.match(html, /break-all/);
  assert.doesNotMatch(html, /<img/);
});
test("pending signup has dedicated email instructions and no auth inputs", () => {
  const html = renderToStaticMarkup(createElement(SignupPending, props));
  assert.match(html, /Check your email/);
  assert.match(html, /alex@example.com/);
  assert.match(html, /Continue to email confirmation/);
  assert.match(html, /Resend confirmation email/);
  assert.match(html, /Use a different email/);
  assert.doesNotMatch(html, /<form|<input|Forgot password/);
});
test("pending screen preserves disabled cooldown and neutral resend feedback", () => {
  const html = renderToStaticMarkup(createElement(SignupPending, { ...props, cooldown: 60, resendDisabled: true, confirmation: neutralResendMessage }));
  assert.match(html, /Resend confirmation in 60s/);
  assert.match(html, /disabled=""/);
  assert.match(html, /If this address has an account awaiting confirmation/);
});
test("only successful pending signup selects the dedicated state", () => {
  assert.equal(confirmationContext("signup", props.email, { awaitingConfirmation: true })?.mode, "signup");
  assert.equal(confirmationContext("signup", props.email, { error: new Error("failed") }), null);
  assert.equal(confirmationContext("login", props.email, { error: { code: "email_not_confirmed" } })?.mode, "login");
  const source = readFileSync("components/AuthForm.tsx", "utf8");
  assert.match(source, /if \(isSignUp && pendingConfirmation\?\.mode === "signup"\) return <SignupPending/);
  const success = source.slice(source.indexOf("if (isSignUp && !result.data.session)"), source.indexOf("if (!result.data.session)"));
  assert.match(success, /setPassword\(""\)/);
  assert.match(success, /setCooldown\(60\)/);
});
test("different email only resets component state and reuses existing resend handler", () => {
  const source = readFileSync("components/AuthForm.tsx", "utf8");
  const reset = source.slice(source.indexOf("function useDifferentEmail()"), source.indexOf('if (isSignUp && pendingConfirmation?.mode'));
  assert.match(reset, /if \(submitting.current\) return/);
  for (const setter of ["setEmail", "setPassword", "setConfirmation", "setError"]) assert.ok(reset.includes(`${setter}("")`));
  assert.match(reset, /setPendingConfirmation\(null\)/);
  assert.doesNotMatch(reset, /signUp\(|resendConfirmation\(|setCooldown\(/);
  assert.match(source, /onResend=\{\(\) => void handleResend\(\)\} onDifferentEmail=\{useDifferentEmail\}/);
});
