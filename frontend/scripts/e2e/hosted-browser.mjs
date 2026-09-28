// Separate production QA browser. Never import from the app or the generic local runner.
import { readFile, mkdir, open, unlink } from "node:fs/promises";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { authenticate, SetupError } from "./session.mjs";
import { hostedConfiguration, assertHostedPage, isReadOnlyComputation, HostedWriteGate } from "./hosted-policy.mjs";

const frontendRoot = fileURLToPath(new URL("../../", import.meta.url));
async function optionalEnv(filename) {
  try { return parseEnv(await readFile(path.join(frontendRoot, filename), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return {}; throw error; }
}
export async function loadHostedConfiguration() {
  const env = { ...await optionalEnv(".env.local"), ...await optionalEnv(".env.e2e.local"), ...process.env };
  // Deliberately read the two opt-ins only from this process, not from either file.
  return hostedConfiguration(env, process.env);
}

function tokenFrom(state, config) {
  const value = state.origins?.find(origin => origin.origin === config.baseURL)?.localStorage?.find(item => item.name === config.storageKey)?.value;
  let token;
  try { token = JSON.parse(value).access_token; } catch { /* Fail closed below. */ }
  if (typeof token !== "string" || !token) throw new SetupError("The isolated QA session did not contain a usable access token.");
  return token;
}

async function ownerRequest(config, token, requestPath, method = "GET", body, allowedStatuses = []) {
  const response = await fetch(`${config.apiOrigin}${requestPath}`, {method, signal:AbortSignal.timeout(20000),
    headers:{Authorization:`Bearer ${token}`, "Content-Type":"application/json"},
    ...(body === undefined ? {} : {body:JSON.stringify(body)})});
  if (!response.ok && !allowedStatuses.includes(response.status)) throw new SetupError("Dedicated QA state could not be verified or cleaned through the normal owner API.");
  return {status:response.status, body:response.ok ? await response.json() : null};
}

async function state(config, token) {
  const {body:portfolio} = await ownerRequest(config, token, "/v2/portfolio");
  let entries = [], page = 0, more = true;
  while (more && page < 10) {
    const {body:result} = await ownerRequest(config, token, `/v2/portfolio/entries?page=${page}`);
    if (!Array.isArray(result.entries) || typeof result.has_more !== "boolean") throw new SetupError("QA activity could not be verified.");
    entries = entries.concat(result.entries); more = result.has_more; page++;
  }
  if (more) throw new SetupError("QA activity exceeds the bounded cleanup audit; do not run writes.");
  const {body:pending} = await ownerRequest(config, token, "/v2/pending-recordings");
  if (!Array.isArray(pending.items)) throw new SetupError("QA pending state could not be verified.");
  const {body:checkin} = await ownerRequest(config, token, "/v2/monthly-checkin", "GET", undefined, [403,404]);
  return {holdings:portfolio.holdings.map(row => row.id).sort(),
    activeEntries:entries.filter(row => !row.voided_at).map(row => row.id).sort(),
    entries, pending:pending.items.map(row => row.id).sort(), pendingRows:pending.items,
    checkin:checkin?.current?.month ?? null, checkinState:checkin,
    portfolio, historyCount:portfolio.history.length};
}

function sameIds(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

async function cleanup(config, token, gate, journal, before) {
  const errors = [];
  for (const id of [...journal.entries].reverse()) {
    try {
      const current = await state(config, token);
      const entry = current.entries.find(row => row.id === id);
      if (entry && !entry.voided_at) {
        gate.enter("entry_cleanup");
        try {
          const url = `${config.apiOrigin}/v2/portfolio/entries/${id}/void`;
          gate.assertRequest("POST", url, config.baseURL);
          await ownerRequest(config, token, `/v2/portfolio/entries/${id}/void`, "POST", {expected_revision:entry.revision});
        } finally { gate.leave(); }
      }
    } catch { errors.push("A task-owned investment entry could not be voided."); }
  }
  for (const id of [...journal.pending].reverse()) {
    try {
      const current = await state(config, token);
      if (current.pending.includes(id)) {
        gate.enter("pending_cleanup");
        try {
          const url = `${config.apiOrigin}/v2/pending-recordings/${id}/resolve`;
          gate.assertRequest("POST", url, config.baseURL);
          await ownerRequest(config, token, `/v2/pending-recordings/${id}/resolve`, "POST", {resolution:"dismissed"});
        } finally { gate.leave(); }
      }
    } catch { errors.push("A task-owned pending item could not be dismissed."); }
  }
  if (journal.checkin && !before.checkin) {
    try {
      gate.enter("checkin_cleanup");
      try {
        gate.assertRequest("POST", `${config.apiOrigin}/v2/monthly-checkin/undo`, config.baseURL);
        await ownerRequest(config, token, "/v2/monthly-checkin/undo", "POST", {month:journal.checkin});
      } finally { gate.leave(); }
    } catch { errors.push("The task-owned monthly check-in could not be undone."); }
  }
  let after;
  try { after = await state(config, token); }
  catch { errors.push("Final dedicated QA state could not be verified."); }
  if (after && (!sameIds(before.holdings, after.holdings) || !sameIds(before.activeEntries, after.activeEntries) ||
      !sameIds(before.pending, after.pending) || before.checkin !== after.checkin)) {
    errors.push("Dedicated QA active state differs from its pre-run baseline.");
  }
  if (after && after.historyCount !== before.historyCount) errors.push("The genuine portfolio snapshot count changed during hosted QA.");
  return {before:before && {holdings:before.holdings.length, activeEntries:before.activeEntries.length,
    pending:before.pending.length, checkin:before.checkin !== null, historyCount:before.historyCount},
    after:after && {holdings:after.holdings.length, activeEntries:after.activeEntries.length,
      pending:after.pending.length, checkin:after.checkin !== null, historyCount:after.historyCount},
    taskOwnedVoided:journal.entries.size, taskOwnedPending:journal.pending.size,
    taskOwnedCheckinUndone:Boolean(journal.checkin), errors};
}

/** Fresh Chrome context, fresh Supabase sign-in, owner-only normal API cleanup. */
export async function withHostedQa(check) {
  const lockDirectory = path.join(frontendRoot, "playwright", ".auth");
  await mkdir(lockDirectory, {recursive:true, mode:0o700});
  const lockPath = path.join(lockDirectory, "hosted-qa.lock");
  let lock;
  try { lock = await open(lockPath, "wx", 0o600); }
  catch { throw new SetupError("Another hosted QA run may be active. Review the isolated lock before retrying."); }
  try { return await withHostedQaLocked(check); }
  finally { try { await lock.close(); } finally { await unlink(lockPath).catch(() => {}); } }
}

async function withHostedQaLocked(check) {
  const config = await loadHostedConfiguration();
  if (process.env.DEBUG || process.env.PWDEBUG || process.env.NODE_DEBUG) throw new SetupError("Disable diagnostic logging for authenticated hosted QA.");
  const authenticated = await authenticate(config, null); // Never load the local runner's session cache.
  const gate = new HostedWriteGate(config);
  gate.verifyOwner(authenticated.verifiedUser); // getUser() was checked by authenticate().
  const token = tokenFrom(authenticated.state, config);
  const { chromium } = await import("playwright");
  const browserEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/ARBOR_E2E_|ARBOR_HOSTED_QA|SUPABASE|DEBUG/.test(key)));
  let browser, context, page, before, result, failure, phase="setup";
  const journal = {entries:new Set(), pending:new Set(), checkin:null, captures:[], trackingError:false};
  const network = {blockedWrites:0, blockedOrigins:0, snapshotNoops:0, latestHistory:[], blockedRoutes:{}};
  try {
    browser = await chromium.launch({channel:"chrome", headless:true, env:browserEnv});
    context = await browser.newContext({storageState:authenticated.state, baseURL:config.baseURL});
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url()), method = request.method().toUpperCase();
      if (![config.baseURL, config.apiOrigin, config.supabaseURL].includes(url.origin)) {
        network.blockedOrigins++; return route.abort("blockedbyclient");
      }
      if (url.origin === config.apiOrigin && method === "GET" && url.pathname === "/v2/portfolio") {
        try {
          const response = await route.fetch();
          const body = await response.json();
          if (Array.isArray(body.history)) network.latestHistory = body.history;
          return route.fulfill({response});
        } catch { return route.continue(); }
      }
      if (url.origin === config.apiOrigin && method === "POST" && url.pathname === "/v2/portfolio/snapshot") {
        network.snapshotNoops++;
        return route.fulfill({status:200, contentType:"application/json", headers:{"access-control-allow-origin":config.baseURL},
          body:JSON.stringify({recorded:false,history:network.latestHistory})});
      }
      if (isReadOnlyComputation(method, url.href)) return route.continue();
      if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
        const blocked = () => {
          network.blockedWrites++;
          const label = `${method} ${url.pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi,":id")}`;
          network.blockedRoutes[label]=(network.blockedRoutes[label]??0)+1;
          return route.abort("blockedbyclient");
        };
        if (url.origin !== config.apiOrigin) return blocked();
        try { gate.assertRequest(method, url.href, page?.url() ?? ""); }
        catch { return blocked(); }
      }
      return route.continue();
    });
    page = await context.newPage();
    page.on("response", response => {
      const request = response.request(), url = new URL(response.url());
      if (url.origin !== config.apiOrigin || request.method() !== "POST" || !response.ok()) return;
      if (!["/v2/portfolio/entries", "/v2/pending-recordings", "/v2/monthly-checkin"].includes(url.pathname)) return;
      const capture = response.json().then(body => {
        if (url.pathname === "/v2/monthly-checkin") {
          if (!body.current?.month || before?.checkin) journal.trackingError = true;
          else journal.checkin = body.current.month;
          return;
        }
        const id = url.pathname.endsWith("/entries") ? body.entry_id : body.id;
        if (!/^[0-9a-f-]{36}$/i.test(id ?? "")) { journal.trackingError = true; return; }
        if (url.pathname.endsWith("/entries") && body.replayed) { journal.trackingError = true; return; }
        if (url.pathname.endsWith("/pending-recordings") && before?.pending.includes(id)) { journal.trackingError = true; return; }
        (url.pathname.endsWith("/entries") ? journal.entries : journal.pending).add(id);
      }).catch(() => { journal.trackingError = true; });
      journal.captures.push(capture);
    });
    const profile = page.waitForResponse(response => new URL(response.url()).pathname === "/profiles/me", {timeout:25000});
    await page.goto(`${config.baseURL}/#home`);
    const profileStatus = (await profile).status();
    if (![200,404].includes(profileStatus)) throw new SetupError("Dedicated QA profile restoration failed.");
    assertHostedPage(page.url());
    if (config.writeEnabled) {
      if (profileStatus !== 200) throw new SetupError("Hosted write QA requires an existing saved dedicated QA profile.");
      before = await state(config, token);
      gate.prepareCleanup();
    }
    result = await check({page, context, config, gate, network, profileStatus,
      before, journal, readState:()=>state(config,token), markStep:label=>{phase=label;},
      async scope(action, work) {
        assertHostedPage(page.url());
        gate.enter(action);
        try { return await work(); } finally { gate.leave(); }
      }});
  } catch (error) { failure = error; }
  finally {
    await Promise.allSettled(journal.captures);
    if (journal.trackingError) failure ??= new SetupError("A hosted QA write could not be tracked for cleanup.");
    if (before) {
      const report = await cleanup(config, token, gate, journal, before);
      result = {...result, cleanup:report};
      if (report.errors.length) failure ??= new SetupError("Hosted QA cleanup was incomplete; inspect the sanitized cleanup report.");
    }
    await browser?.close().catch(() => {});
  }
  if (failure) {
    // Never print raw browser, request, assertion, or provider errors (may contain PII).
    return {ok:false, reason:failure instanceof SetupError ? failure.message : "Hosted QA assertion failed; sensitive details withheld.",
      phase, cleanup:result?.cleanup, network:{blockedWrites:network.blockedWrites,blockedOrigins:network.blockedOrigins,snapshotNoops:network.snapshotNoops,blockedRoutes:network.blockedRoutes}};
  }
  return {ok:true, ...result, network:{blockedWrites:network.blockedWrites,blockedOrigins:network.blockedOrigins,snapshotNoops:network.snapshotNoops,blockedRoutes:network.blockedRoutes}};
}
