import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EntryView } from "../components/entry/PublicEntry";
import { entryFromHash, entryLinks, type EntryScreen } from "./publicEntry";
import { appearanceInitScript } from "./appearance";
import { runInNewContext } from "node:vm";
import { readFileSync } from "node:fs";
import Logo from "../components/Logo";
import { arborMarkPaths, arborMarkViewBox } from "./arborBrand";

const render = (screen: EntryScreen) => renderToStaticMarkup(createElement(EntryView, { screen, onAuthenticated() {} }));

test("public destinations survive refresh and unknown/authenticated hashes safely start at landing", () => {
  for (const screen of Object.keys(entryLinks) as EntryScreen[]) assert.equal(entryFromHash(entryLinks[screen]), screen);
  for (const hash of ["", "#plan", "#signup-nz", "#invalid"]) assert.equal(entryFromHash(hash), "landing");
});
test("landing has clear start/login paths without invented financial data or app navigation", () => {
  const html = render("landing");
  assert.match(html, /Invest with clarity/); assert.match(html, /Keep the longer view/);
  assert.match(html, /href="#signup"/); assert.match(html, /href="#login"/);
  assert.match(html, /Your investments stay right where they are/);
  assert.doesNotMatch(html, /Mobile navigation|Primary navigation|Sign out|Projected wealth/);
});
test("public entry has no country question", () => {
  for (const screen of ["landing", "signup", "login"] as const) assert.doesNotMatch(render(screen), /Where do you live|Other country/);
  assert.equal(entryFromHash("#country"), "landing");
});
test("dedicated auth screens retain semantic form submission, labels and correct footer paths", () => {
  const signup = render("signup"), login = render("login");
  assert.match(signup, /Create your Arbor account/); assert.match(signup, /Create account/);
  assert.match(signup, /Already have an account\? Log in/);
  assert.match(login, /Welcome back/); assert.match(login, /New to Arbor\? Get started/);
  assert.match(login, /href="#signup"/);
  for (const html of [signup, login]) {
    assert.match(html, /<form/); assert.match(html, /type="submit"/);
    assert.match(html, /for="auth-email"/); assert.match(html, /for="auth-password"/);
    assert.doesNotMatch(html, /Mobile navigation|Primary navigation/);
  }
});
test("pre-paint appearance respects saved overrides and leaves fresh/System visitors to CSS OS preference", () => {
  for (const saved of [null, "system", "light", "dark", "invalid"]) {
    const root = { dataset: {} as Record<string, string> };
    runInNewContext(appearanceInitScript, { localStorage: { getItem: () => saved }, document: { documentElement: root } });
    assert.equal(root.dataset.theme, saved === "light" || saved === "dark" ? saved : undefined);
  }
  assert.doesNotThrow(() => runInNewContext(appearanceInitScript, { localStorage: { getItem() { throw Error("Storage blocked"); } } }));
});

test("approved logo is horizontal, monochrome and contains no tagline or backdrop-dependent vein", () => {
  const html = renderToStaticMarkup(createElement(Logo));
  assert.match(html, /inline-flex items-center/);
  assert.ok(html.indexOf('<svg') < html.indexOf('>ARBOR<'));
  assert.match(html, /fill="currentColor"/);
  assert.doesNotMatch(html, /Build wealth|Grow with Arbor|stroke=|gradient|filter=/);
  const icon = readFileSync("app/icon.svg", "utf8");
  assert.ok(icon.includes(arborMarkViewBox));
  for (const path of arborMarkPaths) assert.ok(icon.includes(path));
  assert.doesNotMatch(icon, /ARBOR|<text|<image/);
});
