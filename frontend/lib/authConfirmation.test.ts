import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AuthForm from "../components/AuthForm";
import { confirmationContext, showConfirmationResend, canResendConfirmation, neutralResendMessage } from "./authConfirmation";

for (const mode of ["login", "signup"] as const) {
  test(`fresh ${mode} hides resend; forgot password is login-only`, () => {
    const html = renderToStaticMarkup(createElement(AuthForm, { mode, onAuthenticated: () => {} }));
    assert.doesNotMatch(html, /Resend confirmation/);
    assert.equal(html.includes("Forgot password?"), mode === "login");
  });
}
test("successful signup awaiting confirmation reveals resend only for that address and mode", () => {
  const context = confirmationContext("signup", " person@example.com ", { awaitingConfirmation: true });
  assert.equal(showConfirmationResend(context, "signup", "person@example.com"), true);
  assert.equal(showConfirmationResend(context, "signup", "another@example.com"), false);
  assert.equal(showConfirmationResend(context, "login", "person@example.com"), false);
  assert.equal(confirmationContext("signup", "person@example.com", {}), null);
});
test("only email_not_confirmed login error enables resend", () => {
  const context = confirmationContext("login", "person@example.com", { error: { code: "email_not_confirmed" } });
  assert.equal(showConfirmationResend(context, "login", "person@example.com"), true);
  assert.equal(confirmationContext("signup", "person@example.com", { error: { code: "email_not_confirmed" } }), null);
});
for (const error of [{ code: "invalid_credentials" }, { code: "user_not_found" }, new Error("Network error")]) {
  test(`error ${"code" in error ? error.code : error.message} does not reveal resend`, () => {
    assert.equal(confirmationContext("login", "person@example.com", { error }), null);
  });
}
test("cooldown and pending request prevent repeated resend", () => {
  const context = confirmationContext("signup", "person@example.com", { awaitingConfirmation: true });
  for (const seconds of [60, 30, 1]) assert.equal(canResendConfirmation(context, "signup", context!.email, false, seconds), false);
  assert.equal(canResendConfirmation(context, "signup", context!.email, true, 0), false);
  assert.equal(canResendConfirmation(context, "signup", context!.email, false, 0), true);
  assert.equal(canResendConfirmation(null, "signup", context!.email, false, 0), false);
});
test("resend message remains neutral and unchanged", () => {
  assert.equal(neutralResendMessage, "If this address has an account awaiting confirmation, a new email has been requested. Check your inbox and spam folder.");
});
