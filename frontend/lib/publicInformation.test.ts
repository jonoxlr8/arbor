import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PublicInformation from "../components/entry/PublicInformation";
import { publicInformation, type PublicInformationPage } from "./publicInformation";

test("information destinations contain substantive beta information and navigation", () => {
  for (const page of Object.keys(publicInformation) as PublicInformationPage[]) {
    const html = renderToStaticMarkup(createElement(PublicInformation, { page }));
    assert.equal((html.match(/<h1/g) ?? []).length, 1);
    assert.ok(publicInformation[page].sections.length >= 5);
    for (const destination of ["/privacy", "/terms", "/investment-disclosures"]) assert.ok(html.includes(`href="${destination}"`));
    assert.ok(html.includes('mailto:support@arbor.ph'));
    assert.doesNotMatch(html, /certified|free forever|no credit card|permanent erasure guaranteed/i);
  }
});
test("privacy and beta pages preserve known account and availability boundaries", () => {
  const privacy = renderToStaticMarkup(createElement(PublicInformation, { page: "privacy" }));
  assert.match(privacy, /retains an audit record/);
  assert.match(privacy, /Missing-investment requests/);
  assert.match(privacy, /account ID.*received date.*two identifiers for receipts and retries/);
  assert.match(privacy, /other customers cannot read them/);
  assert.match(privacy, /after 90 days through reviewed manual cleanup, so removal may occur later/);
  assert.match(privacy, /Reviewed account erasure can remove them earlier/);
  assert.match(privacy, /no self-service whole-account deletion/);
  assert.match(privacy, /not currently implemented automatic purges/);
  assert.doesNotMatch(privacy, /founder-review draft/);
  const terms = renderToStaticMarkup(createElement(PublicInformation, { page: "terms" }));
  assert.match(terms, /Subscription checkout and public Free access are not active/);
  assert.match(terms, /Philippine law governs/);
  assert.match(terms, /Acceptance is recorded only after an explicit action/);
});
