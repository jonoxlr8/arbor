import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync, statSync } from "node:fs";
import PublicWebsite from "../components/entry/PublicWebsite";
import { publicFaqs, publicSections, publicMetadata } from "./publicWebsite";
import { entryFromHash } from "./publicEntry";

const html = renderToStaticMarkup(createElement(PublicWebsite));
test("marketing has one h1, main landmark, real public sections and a skip link", () => {
  assert.equal((html.match(/<h1 /g) ?? []).length,1);
  assert.equal((html.match(/<main /g) ?? []).length,1);
  assert.match(html,/href="#public-content"/);
  for (const [id,label] of publicSections) {
    assert.ok(html.includes(`id="${id}"`)); assert.ok(html.includes(`>${label}</a>`));
    assert.equal(entryFromHash(`#${id}`),'landing');
  }
});
test("public navigation preserves real auth links without fake checkout or broker connection", () => {
  assert.match(html,/href="#signup"/); assert.match(html,/href="#login"/);
  assert.match(html,/Get started free/); assert.match(html,/Sign in/);
  assert.doesNotMatch(html,/href="(?:#checkout|\/checkout|\/privacy|\/terms)"/);
  assert.doesNotMatch(html,/Connect broker|Buy now|Subscribe now|Start your trial/);
});
test("gated previews are distinguished from available contribution planning", () => {
  assert.match(html,/Live Portfolio is not enabled in the current public beta/);
  assert.match(html,/Monthly check-in recording is a preview/);
  assert.match(html,/Available now with manual inputs/);
  assert.match(html,/Portfolio tracking and monthly check-ins are previews, not yet enabled/);
});
test("pricing is beta-free, future prices display only and Free explicitly at launch", () => {
  assert.match(html,/Arbor Free · At launch/); assert.match(html,/₱399\/month/); assert.match(html,/₱3,990\/year/);
  assert.match(html,/Payments are not available/); assert.match(html,/No credit card/);
  assert.match(html,/10 Ask Arbor questions per month/); assert.match(html,/under fair use/);
  assert.doesNotMatch(html,/Unlimited AI|limited time|countdown|discount|ACT NOW/i);
});
test("actual local product images are optimized, accessible and labeled illustrative", () => {
  assert.equal((html.match(/<img /g) ?? []).length,6);
  assert.match(html,/srcSet=/); assert.match(html,/loading="lazy"/); assert.match(html,/fetchPriority="high"/);
  assert.doesNotMatch(html,/<img[^>]+alt=""/);
  assert.match(html,/Actual Arbor interface · Illustrative data/);
  assert.doesNotMatch(html,/Codex|@example\.com|sb_secret_|service_role/);
  for (const name of ['home','holdings','allocation','ask','contribution','fund-value']) assert.ok(statSync(`public/product/${name}.webp`).size<100_000);
});
test("identity metadata is reused with clear provider names and non-endorsement", () => {
  for (const name of ['GFunds','Gotrade','DragonFi','GCrypto','Coins.ph','PDAX']) assert.ok(html.includes(name));
  assert.doesNotMatch(html,/GCash \/ GFunds|GCash \/ GCrypto/);
  assert.match(html,/not partnerships/); assert.match(html,/not official logos/);
});
test("FAQs explain choice, non-custody, no sync, AI limitations and Philippines scope", () => {
  assert.equal(publicFaqs.length,10);
  for (const [question] of publicFaqs) assert.ok(html.includes(question));
  for (const copy of ['does not hold money','explicitly choose','does not currently sync','AI explanations can be mistaken','Philippines-first']) assert.ok(html.includes(copy));
});
test("copy preserves the product boundary and avoids invented claims", () => {
  assert.match(html,/You choose. Arbor calculates, tracks, simulates and explains/);
  assert.doesNotMatch(html,/bank-grade|military-grade|SOC 2|SEC-approved|beat the market|perfect portfolio|best investments|trusted by|five.star/i);
  assert.match(html,/not a buy list/); assert.match(html,/returns are not guaranteed/);
});
test("mobile menu has disclosure semantics and Escape focus return", () => {
  assert.match(html,/aria-controls="public-navigation" aria-expanded="false"/);
  const source=readFileSync('components/entry/PublicWebsite.tsx','utf8');
  assert.match(source,/event.key === "Escape"/); assert.match(source,/menuButton.current\?\.focus/);
  assert.doesNotMatch(source,/fetch\(|localStorage|LIVE_PORTFOLIO_ENABLED|MONTHLY_CHECKIN_ENABLED/);
});
test("scoped CSS honors reduced motion and does not restyle authenticated screens", () => {
  const css=readFileSync('app/marketing.css','utf8');
  assert.match(css,/prefers-reduced-motion: reduce/); assert.match(css,/:focus-visible/);
  assert.doesNotMatch(css,/\.app-shell|\.arbor-sheet|\.app-destination/);
});
test("metadata is factual, includes social preview and public content renders before restore", () => {
  assert.match(publicMetadata.description,/Philippines-first/); assert.match(publicMetadata.description,/preview/);
  const layout=readFileSync('app/layout.tsx','utf8');
  assert.match(layout,/canonical: "https:\/\/arbor.ph"/); assert.match(layout,/summary_large_image/);
  assert.ok(readdirSync('app').includes('opengraph-image.tsx'));
  const page=readFileSync('app/page.tsx','utf8');
  assert.match(page,/account.status === "checking" \|\| account.status === "unauthenticated"/);
});
