import assert from "node:assert/strict";
import test from "node:test";
import { portfolioGraphState } from "./portfolioGraphState";

const observation = (day: string, value_php: string) => ({ day, value_php, captured_at: `${day}T12:00:00Z` });
test("only genuine history can produce the historical state", () => {
  assert.equal(portfolioGraphState({ knownValue: "0", complete: true, holdingsCount: 0, history: [] }).kind, "empty_zero");
  const current = portfolioGraphState({ knownValue: "120", complete: true, holdingsCount: 1, history: [] });
  assert.equal(current.kind, "current_only");
  assert.equal(current.summary, "Current value · No history yet");
  assert.equal(portfolioGraphState({ knownValue: "120", complete: true, holdingsCount: 1, history: [observation("2026-09-25", "100")] }).kind, "single_recorded");
  assert.equal(portfolioGraphState({ knownValue: "120", complete: true, holdingsCount: 1, history: [observation("2026-09-25", "100"), observation("2026-09-26", "120")] }).kind, "historical");
  assert.equal(portfolioGraphState({ knownValue: "120", complete: false, holdingsCount: 2, history: [] }).kind, "incomplete");
});
test("an old investment date does not become a portfolio observation", () => {
  const state = portfolioGraphState({ knownValue: "120", complete: true, holdingsCount: 1, history: [observation("2026-09-26", "120")] });
  assert.deepEqual(state.history.map(row => row.day), ["2026-09-26"]);
});
