import test from "node:test";
import assert from "node:assert/strict";
import { createAppearanceController, parseAppearance, resolveAppearance, appearanceKey } from "./appearance";

function fixture(saved: string | null = null, blocked = false) {
  const browser = new EventTarget();
  const media = Object.assign(new EventTarget(), { matches: false });
  const root = { dataset: {} as Record<string, string> };
  let stored = saved;
  Object.assign(browser, {
    matchMedia: () => media,
    localStorage: { getItem: () => { if (blocked) throw Error(); return stored; }, setItem: (_: string, value: string) => { if (blocked) throw Error(); stored = value; } },
  });
  return { browser, media, root, stored: () => stored, controller: createAppearanceController(browser as Window, root as HTMLElement) };
}

test("appearance defaults to System and validates persisted values", () => {
  for (const value of [null, "invalid", "SYSTEM"]) assert.equal(parseAppearance(value), "system");
  assert.equal(resolveAppearance("system", true), "dark");
  assert.equal(resolveAppearance("light", true), "light");
  assert.equal(resolveAppearance("dark", false), "dark");
});
test("System follows changing device theme, explicit preferences do not", () => {
  const f = fixture();
  assert.equal(f.root.dataset.theme, "light");
  f.media.matches = true; f.media.dispatchEvent(new Event("change"));
  assert.equal(f.root.dataset.theme, "dark");
  f.controller.set("light");
  f.media.dispatchEvent(new Event("change"));
  assert.equal(f.root.dataset.theme, "light");
  f.controller.set("system");
  assert.equal(f.root.dataset.theme, "dark");
  f.controller.dispose();
});
test("preference persists, restores and synchronizes across tabs", () => {
  const f = fixture("dark");
  assert.equal(f.controller.getSnapshot(), "dark");
  f.controller.set("light"); assert.equal(f.stored(), "light");
  f.browser.dispatchEvent(Object.assign(new Event("storage"), { key: appearanceKey, newValue: "dark" }));
  assert.equal(f.root.dataset.theme, "dark");
  f.controller.dispose();
});
test("blocked storage still permits local appearance changes and cleanup stops notifications", () => {
  const f = fixture(null, true);
  let calls = 0;
  const unsubscribe = f.controller.subscribe(() => calls++);
  f.controller.set("dark"); assert.equal(f.root.dataset.theme, "dark");
  assert.equal(calls, 1);
  unsubscribe(); f.controller.dispose();
  f.media.dispatchEvent(new Event("change"));
  assert.equal(calls, 1);
});
