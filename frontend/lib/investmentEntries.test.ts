import test from "node:test";
import assert from "node:assert/strict";
import { addUnitTexts, manilaInvestmentToday } from "./investmentEntries";

test("investment today uses Manila rather than the previous UTC date", () => {
  assert.equal(manilaInvestmentToday(new Date("2026-09-26T16:05:00Z")), "2026-09-27");
  assert.equal(manilaInvestmentToday(new Date("2026-09-26T15:55:00Z")), "2026-09-26");
});

test("exact unit preview, without floating-point drift", () => {
  assert.equal(addUnitTexts("2.40000", "0.52314"), "2.92314");
  assert.equal(addUnitTexts("10", "10"), "20");
  assert.equal(addUnitTexts("0.000000000001", "0.000000000001"), "0.000000000002");
  assert.throws(() => addUnitTexts("1.0000000000001", "1"));
});
