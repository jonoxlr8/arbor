import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, statSync } from "node:fs";
import PublicWebsite from "../components/entry/PublicWebsite";
import { publicFaqs, publicSections, publicMetadata } from "./publicWebsite";
import { entryFromHash } from "./publicEntry";

const html = renderToStaticMarkup(createElement(PublicWebsite));

test("public page has a focused navigation, one h1, and real section links", () => {
  assert.equal((html.match(/<h1 /g) ?? []).length, 1);
  assert.equal((html.match(/<main /g) ?? []).length, 1);
  assert.match(html, /href="#public-content"/);
  for (const [id, label] of publicSections) {
    assert.ok(html.includes(`id="${id}"`));
    assert.ok(html.includes(`>${label}</a>`));
    assert.equal(entryFromHash(`#${id}`), "landing");
  }
  assert.match(html, /href="#signup"/);
  assert.match(html, /href="#login"/);
  assert.match(html, /Get started/);
});

test("public story matches V3 product and preserves financial authority", () => {
  for (const copy of [
    "Invest with a plan", "Choose your approach", "Record what you actually invested",
    "1W · 1M · 3M · 6M · 1Y · 5Y · All", "Contributions stay separate from investment gain",
    "choose whether to follow it", "Learn lives inside Ask Arbor", "Arbor calculates, tracks and explains",
  ]) assert.ok(html.includes(copy), copy);
  assert.match(html, /Gain\/loss for the selected period/i);
  assert.match(html, /does not hold your money or place trades/i);
  assert.doesNotMatch(html, /1D|Buy now|Subscribe now|href="#checkout"|best provider|guaranteed return|brokerage sync/i);
});

test("beta presentation has no active-looking pricing or invented social proof", () => {
  assert.match(html, /Subscription checkout and public Free access are not active/);
  assert.doesNotMatch(html, /₱399|₱3,990|₱0|10 Ask Arbor questions|Trusted by|testimonials/i);
  for (const name of ["GFunds", "Gotrade", "DragonFi", "GCrypto", "Coins.ph", "PDAX"]) assert.ok(html.includes(name));
});

test("V3 demo images are local and explicitly synthetic", () => {
  for (const name of ["home-desktop", "home-mobile", "portfolio-history", "portfolio-mobile", "ways-detail", "monthly-desktop", "monthly-mobile"]) {
    assert.ok(statSync(`public/product/v3-demo/${name}.png`).size < 250_000);
    assert.ok(html.includes(name));
  }
  assert.match(html, /Illustrative demo—not actual investment performance/);
  assert.match(html, /Illustrative lesson preview/);
  assert.doesNotMatch(html, /@example\.com|sb_secret_|service_role|Codex/i);
});

test("FAQ and metadata explain scope and limitations", () => {
  assert.equal(publicFaqs.length, 10);
  for (const [question] of publicFaqs) assert.ok(html.includes(question));
  for (const copy of ["curated set", "not profit", "reference data are incomplete", "not active"]) assert.ok(html.includes(copy));
  assert.match(publicMetadata.description, /Philippines-first/);
  assert.match(publicMetadata.description, /private beta/);
});

test("mobile menu and scoped presentation preserve accessibility", () => {
  assert.match(html, /aria-controls="public-navigation" aria-expanded="false"/);
  const source = readFileSync("components/entry/PublicWebsite.tsx", "utf8");
  assert.match(source, /event.key === "Escape"/);
  assert.match(source, /menuButton.current\?\.focus/);
  assert.match(source, /querySelector<HTMLAnchorElement>\("#public-navigation a"\)\?\.focus/);
  const css = readFileSync("app/marketing.css", "utf8");
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /:focus-visible/);
  assert.doesNotMatch(css, /\.app-shell|\.arbor-sheet|\.app-destination/);
});
