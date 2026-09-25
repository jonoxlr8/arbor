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
test("private beta copy reflects activated tracking without claiming broker sync", () => {
  assert.match(html,/Arbor Plus tracking is available in private beta/);
  assert.match(html,/Monthly check-ins are available in private beta/);
  assert.match(html,/Your saved implementation choices organize the result/);
  assert.doesNotMatch(html,/Live Portfolio is not enabled|upcoming customization|when tracking is released/i);
});
test("pricing is beta-free, future prices display only and Free explicitly at launch", () => {
  assert.match(html,/Arbor Free · At launch/); assert.match(html,/₱399\/month/); assert.match(html,/₱3,990\/year/);
  assert.match(html,/Payments are not available/); assert.match(html,/No credit card/);
  assert.match(html,/10 Ask Arbor questions per month/); assert.match(html,/under fair use/);
  assert.doesNotMatch(html,/Unlimited AI|limited time|countdown|discount|ACT NOW/i);
});
test("actual local product images are optimized, accessible and labeled illustrative", () => {
  assert.equal((html.match(/<picture>/g) ?? []).length,12);
  assert.match(html,/srcSet=/); assert.match(html,/loading="lazy"/); assert.match(html,/fetchPriority="high"/);
  assert.match(html,/loading="eager"/);
  assert.match(html,/<source media="\(max-width: 600px\)" srcSet="\/product\/premium\/home-mobile.webp"/);
  assert.doesNotMatch(html,/<img[^>]+alt=""/);
  assert.match(html,/Actual Arbor interface · Illustrative data/);
  assert.doesNotMatch(html,/Codex|@example\.com|sb_secret_|service_role/);
  assert.match(html,/product%2Fpremium%2Fhome/);
  for (const name of ['home','portfolio','ways','catalogue','holdings','allocation','ask','contribution','fund-value','settings','ask-desktop','customize','approaches','final-plan']) assert.ok(statSync(`public/product/premium/${name}.webp`).size<150_000);
});
test("public ways reuse canonical providers and the current recording journey",()=>{
  const source=readFileSync('components/entry/PublicWebsite.tsx','utf8');
  assert.match(source,/providerDestination\(option.provider\)/);
  assert.match(html,/Ways to invest &amp; official provider links/);
  assert.match(html,/when public quota support launches/);
  assert.match(html,/Invest through your provider. Record what you own in Arbor/);
  assert.match(html,/holding record—not a purchase/);
  assert.match(html,/target="_blank" rel="noopener noreferrer"/);
  for(const id of ['ways-to-invest','record-investment'])assert.ok(html.includes(`id="${id}"`));
});
test("final product story preserves explicit optional choices and exact monthly amount semantics",()=>{
  for(const text of ["Your core plan is complete as-is","None, 5% or 10%","Nothing is added for you","You review it, then confirm","exact amounts by provider","below a minimum visible","not that Arbor placed a trade or updated your holdings"])assert.ok(html.includes(text));
  assert.match(html,/Optional customization · Included in Free/);
  assert.match(html,/id="customize-plan"/);
  assert.doesNotMatch(html,/automatically add|recommended provider|Bitcoin is required|broker sync is available/i);
});
test("identity metadata is reused with clear provider names and non-endorsement", () => {
  for (const name of ['GFunds','Gotrade','DragonFi','GCrypto','Coins.ph','PDAX']) assert.ok(html.includes(name));
  assert.doesNotMatch(html,/GCash \/ GFunds|GCash \/ GCrypto/);
  assert.match(html,/not partnerships/); assert.match(html,/identification only/);
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
  assert.match(publicMetadata.description,/Philippines-first/); assert.match(publicMetadata.description,/recorded investments/);
  const layout=readFileSync('app/layout.tsx','utf8');
  assert.match(layout,/canonical: "https:\/\/arbor.ph"/); assert.match(layout,/summary_large_image/);
  assert.ok(readdirSync('app').includes('opengraph-image.tsx'));
  const page=readFileSync('app/page.tsx','utf8');
  assert.match(page,/account.status === "checking" \|\| account.status === "unauthenticated"/);
});
