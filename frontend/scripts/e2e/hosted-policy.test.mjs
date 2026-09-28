import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { configuration, SetupError } from "./session.mjs";
import { hostedConfiguration, assertHostedPage, isReadOnlyComputation, HostedWriteGate, HOSTED_ORIGIN, HOSTED_API_ORIGIN, HOSTED_SUPABASE_ORIGIN } from "./hosted-policy.mjs";

const env = {ARBOR_E2E_EMAIL:"fixture@example.test", ARBOR_E2E_PASSWORD:"synthetic-only",
  ARBOR_E2E_USER_ID:"00000000-0000-4000-8000-000000000001", ARBOR_E2E_ACCOUNT_IS_DISPOSABLE:"true",
  NEXT_PUBLIC_SUPABASE_URL:HOSTED_SUPABASE_ORIGIN, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"sb_publishable_fixture"};
const flags = {ARBOR_HOSTED_QA:"1", ARBOR_HOSTED_QA_WRITE:"0"};

test("generic local browser still refuses production", () => {
  assert.throws(() => configuration({...env,ARBOR_E2E_BASE_URL:HOSTED_ORIGIN}), /restricted to a loopback/);
});
test("production origin without explicit process opt-in fails closed", () => {
  assert.throws(() => hostedConfiguration({...env,ARBOR_HOSTED_QA:"1"}, {}), /ARBOR_HOSTED_QA=1/);
});
for (const target of ["http://arbor.ph", "https://www.arbor.ph", "https://evil-arbor.ph",
  "https://arbor.ph.evil.example", "http://localhost:3000", "https://vercel-preview.example",
  "https://arbor.ph/path", "https://arbor.ph/?x=1", "https://user:pass@arbor.ph"]) {
  test(`hosted target is rejected: ${target}`, () => {
    assert.throws(() => hostedConfiguration({...env,ARBOR_HOSTED_QA_BASE_URL:target},flags), /exact Arbor production origin/);
  });
}
test("exact production target and dedicated configuration produce read-only mode", () => {
  const config = hostedConfiguration(env,flags);
  assert.equal(config.baseURL,HOSTED_ORIGIN); assert.equal(config.apiOrigin,HOSTED_API_ORIGIN);
  assert.equal(config.writeEnabled,false);
  assertHostedPage(`${HOSTED_ORIGIN}/#portfolio`);
  assert.throws(() => assertHostedPage("https://arbor.ph.evil.example/"), SetupError);
});
test("missing disposable QA identity and secret keys are rejected", () => {
  assert.throws(() => hostedConfiguration({...env,ARBOR_E2E_ACCOUNT_IS_DISPOSABLE:"false"},flags), /disposable/);
  assert.throws(() => hostedConfiguration({...env,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"sb_secret_fixture"},flags), /forbidden/);
  assert.throws(() => hostedConfiguration({...env,NEXT_PUBLIC_SUPABASE_URL:"https://other.supabase.co"},flags), /production Supabase project origin/);
});
test("wrong identity is rejected before any write scope", () => {
  const gate = new HostedWriteGate(hostedConfiguration(env,{...flags,ARBOR_HOSTED_QA_WRITE:"1"}));
  gate.prepareCleanup();
  assert.throws(() => gate.verifyOwner({id:"00000000-0000-4000-8000-000000000002",email:env.ARBOR_E2E_EMAIL}), /dedicated identity/);
  assert.throws(() => gate.enter("entry"), /verified dedicated identity/);
});
test("read-only mode blocks writes even with verified owner and cleanup", () => {
  const gate = new HostedWriteGate(hostedConfiguration(env,flags));
  gate.verifyOwner({id:env.ARBOR_E2E_USER_ID,email:env.ARBOR_E2E_EMAIL});gate.prepareCleanup();
  assert.throws(() => gate.enter("entry"), /write opt-in/);
});
test("only the backend's exact ephemeral projection POST is read-only", () => {
  assert.equal(isReadOnlyComputation("POST",`${HOSTED_API_ORIGIN}/v2/future-projection`),true);
  for (const target of [`${HOSTED_API_ORIGIN}/v2/monthly-checkin`,`${HOSTED_API_ORIGIN}/v2/future-projection?save=1`,
    `${HOSTED_API_ORIGIN}/v2/future-projection/`,`https://arbor-api.onrender.com.evil.example/v2/future-projection`]) {
    assert.equal(isReadOnlyComputation("POST",target),false);
  }
  assert.equal(isReadOnlyComputation("PUT",`${HOSTED_API_ORIGIN}/v2/future-projection`),false);
});
test("write mode requires verified identity, prepared cleanup, exact action and origin", () => {
  const gate = new HostedWriteGate(hostedConfiguration(env,{...flags,ARBOR_HOSTED_QA_WRITE:"1"}));
  assert.throws(() => gate.enter("entry"), /verified dedicated identity/);
  gate.verifyOwner({id:env.ARBOR_E2E_USER_ID,email:env.ARBOR_E2E_EMAIL});
  assert.throws(() => gate.enter("entry"), /cleanup/);
  gate.prepareCleanup();gate.enter("entry");
  gate.assertRequest("POST",`${HOSTED_API_ORIGIN}/v2/portfolio/entries`,`${HOSTED_ORIGIN}/#portfolio`);
  assert.throws(() => gate.assertRequest("POST",`${HOSTED_API_ORIGIN}/v2/portfolio/snapshot`,HOSTED_ORIGIN), /outside its approved write scope/);
  assert.throws(() => gate.assertRequest("POST","https://evil.example/v2/portfolio/entries",HOSTED_ORIGIN), /not the approved API/);
  assert.throws(() => gate.assertRequest("POST",`${HOSTED_API_ORIGIN}/v2/portfolio/entries`,"http://arbor.ph"), /approved Arbor origin/);
  gate.leave();
  gate.enter("checkin");
  gate.assertRequest("POST",`${HOSTED_API_ORIGIN}/v2/monthly-checkin`,HOSTED_ORIGIN);
  assert.throws(() => gate.assertRequest("POST",`${HOSTED_API_ORIGIN}/v2/monthly-checkin/undo`,HOSTED_ORIGIN), /outside its approved write scope/);
  gate.leave();
  gate.enter("entry_cleanup");
  gate.assertRequest("POST",`${HOSTED_API_ORIGIN}/v2/portfolio/entries/00000000-0000-4000-8000-000000000001/void`,HOSTED_ORIGIN);
  assert.throws(() => gate.assertRequest("DELETE",`${HOSTED_API_ORIGIN}/v2/portfolio/entries/00000000-0000-4000-8000-000000000001`,HOSTED_ORIGIN), /outside its approved write scope/);
  gate.leave();
});
test("invalid write opt-in and unrelated hosted write scopes fail closed", () => {
  assert.throws(() => hostedConfiguration(env,{...flags,ARBOR_HOSTED_QA_WRITE:"true"}), /must be 0 or 1/);
  const gate = new HostedWriteGate(hostedConfiguration(env,{...flags,ARBOR_HOSTED_QA_WRITE:"1"}));
  gate.verifyOwner({id:env.ARBOR_E2E_USER_ID,email:env.ARBOR_E2E_EMAIL});gate.prepareCleanup();
  assert.throws(() => gate.enter("market_data"), /not approved/);
  gate.enter("pending");
  assert.throws(() => gate.assertRequest("PUT",`${HOSTED_API_ORIGIN}/v2/portfolio/holdings/00000000-0000-4000-8000-000000000001/manual-value`,HOSTED_ORIGIN), /outside its approved write scope/);
  gate.leave();
});
test("hosted runner has fresh context, no personal profile, no auth cache, no raw logging", () => {
  const source = readFileSync(new URL("./hosted-browser.mjs",import.meta.url),"utf8");
  assert.match(source,/authenticate\(config, null\)/);
  assert.match(source,/browser\.newContext/);
  assert.match(source,/finally \{/);
  assert.doesNotMatch(source,/launchPersistentContext|connectOverCDP|test-user\.json|recordVideo:|recordHar:|tracing\.start|console\.log\(.*token/);
});
