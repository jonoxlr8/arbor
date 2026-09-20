import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { onboardingEnter } from "./onboardingKeyboard";
import { answerError, type Answers } from "./onboardingV2";

function press(field: keyof Answers, value: string, options: { repeat?: boolean; pending?: boolean; tagName?: string; choice?: boolean; isComposing?: boolean } = {}) {
  let submitted = 0, prevented = 0;
  onboardingEnter({ key: "Enter", repeat: options.repeat ?? false, isComposing: options.isComposing ?? false,
    tagName: options.tagName ?? "INPUT", choice: options.choice ?? false, contentEditable: false,
    preventDefault: () => prevented++,
  }, () => { if (!answerError(field, value) && !options.pending) submitted++; });
  return { submitted, prevented };
}
test("Enter requests the shared submit action for valid text and amounts including zero", () => {
  for (const [field, value] of [["full_name", "Alex"], ["current_portfolio_value", "0"], ["monthly_investment", "0"], ["goal_target", "1000"]] as const) {
    assert.deepEqual(press(field, value), { submitted: 1, prevented: 1 });
  }
});
test("choice Enter advances only with a valid selection", () => {
  assert.equal(press("horizon", "ten_plus_years", { tagName: "BUTTON", choice: true }).submitted, 1);
  for (const value of ["", "unknown"]) assert.equal(press("horizon", value, { tagName: "BUTTON", choice: true }).submitted, 0);
});
test("invalid text and amounts cannot advance", () => {
  for (const [field, value] of [["full_name", " "], ["monthly_investment", "-1"], ["current_portfolio_value", ""], ["goal_target", "0"]] as const) assert.equal(press(field, value).submitted, 0);
});
test("pending request and held Enter do not resubmit", () => {
  assert.equal(press("full_name", "Alex", { pending: true }).submitted, 0);
  assert.deepEqual(press("full_name", "Alex", { repeat: true }), { submitted: 0, prevented: 1 });
});
test("multiline, secondary buttons and IME keep native behavior", () => {
  for (const options of [{ tagName: "TEXTAREA" }, { tagName: "BUTTON" }, { isComposing: true }]) assert.deepEqual(press("full_name", "Alex", options), { submitted: 0, prevented: 0 });
});
test("click and keyboard share form submit, validation and synchronous request lock", () => {
  const source = readFileSync("components/OnboardingV2.tsx", "utf8");
  assert.match(source, /onSubmit=\{e => \{ e.preventDefault\(\); void next\(\); \}\}/);
  assert.match(source, /type="submit" disabled=\{!valid \|\| sessionFailed\}/);
  assert.match(source, /e.currentTarget.requestSubmit\(\)/);
  assert.match(source, /if \(!valid \|\| request.current \|\| sessionFailed \|\| signingOut\) return/);
  assert.ok(source.indexOf("request.current = controller") < source.indexOf("await createV2Profile"));
  assert.doesNotMatch(source, /document.addEventListener/);
});
