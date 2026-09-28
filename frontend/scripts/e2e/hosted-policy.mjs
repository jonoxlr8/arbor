// Production-only QA policy. Keep the generic local configuration loopback-only.
import { qaAuthConfiguration, SetupError } from "./session.mjs";

export const HOSTED_ORIGIN = "https://arbor.ph";
export const HOSTED_API_ORIGIN = "https://arbor-api.onrender.com";
export const HOSTED_SUPABASE_ORIGIN = "https://gnjjtlswwhkpiabyayvi.supabase.co";

function exactOrigin(value) {
  let url;
  try { url = new URL(value); }
  catch { throw new SetupError("Hosted QA target must be the exact Arbor production origin."); }
  if (url.origin !== HOSTED_ORIGIN || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new SetupError("Hosted QA target must be the exact Arbor production origin.");
  }
  return url.origin;
}

/** Opt-ins must come from this process, never a persisted env file or a URL alone. */
export function hostedConfiguration(env, flags) {
  if (flags.ARBOR_HOSTED_QA !== "1") throw new SetupError("Set ARBOR_HOSTED_QA=1 explicitly for the separate hosted QA runner.");
  if (flags.ARBOR_HOSTED_QA_WRITE !== undefined && !["0", "1"].includes(flags.ARBOR_HOSTED_QA_WRITE)) {
    throw new SetupError("ARBOR_HOSTED_QA_WRITE must be 0 or 1.");
  }
  const baseURL = exactOrigin(env.ARBOR_HOSTED_QA_BASE_URL || HOSTED_ORIGIN);
  const auth = qaAuthConfiguration(env, baseURL);
  if (auth.supabaseURL !== HOSTED_SUPABASE_ORIGIN) throw new SetupError("Hosted QA requires the reviewed production Supabase project origin.");
  return { ...auth, apiOrigin:HOSTED_API_ORIGIN,
    writeEnabled:flags.ARBOR_HOSTED_QA_WRITE === "1" };
}

export function assertHostedPage(url) {
  let parsed;
  try { parsed = new URL(url); }
  catch { throw new SetupError("Hosted QA left the approved Arbor origin."); }
  if (parsed.origin !== HOSTED_ORIGIN) throw new SetupError("Hosted QA left the approved Arbor origin.");
}

/** The backend documents this exact POST as an ephemeral calculation with no saved state. */
export function isReadOnlyComputation(method, url) {
  let parsed;
  try { parsed = new URL(url); } catch { return false; }
  return method.toUpperCase() === "POST" && parsed.origin === HOSTED_API_ORIGIN &&
    parsed.pathname === "/v2/future-projection" && !parsed.search && !parsed.hash;
}

export class HostedWriteGate {
  #verified = false;
  #cleanup = false;
  #scope = null;
  constructor(config) { this.config = config; }
  verifyOwner(user) {
    if (!user || user.id !== this.config.userId || user.email?.toLowerCase() !== this.config.email.toLowerCase()) {
      throw new SetupError("Hosted QA account did not match the configured dedicated identity.");
    }
    this.#verified = true;
  }
  prepareCleanup() { this.#cleanup = true; }
  enter(scope) {
    if (!this.config.writeEnabled || !this.#verified || !this.#cleanup) throw new SetupError("Hosted QA writes require verified dedicated identity, explicit write opt-in, and cleanup.");
    if (this.#scope) throw new SetupError("A hosted QA write scope is already active.");
    if (!scope || !["entry", "pending", "checkin", "entry_cleanup", "pending_cleanup", "checkin_cleanup", "monthly_preview", "chat"].includes(scope)) {
      throw new SetupError("Hosted QA write scope is not approved.");
    }
    this.#scope = scope;
  }
  leave() { this.#scope = null; }
  assertRequest(method, url, pageUrl) {
    assertHostedPage(pageUrl);
    if (!this.config.writeEnabled || !this.#verified || !this.#cleanup) throw new SetupError("Hosted QA write gate is closed.");
    const request = new URL(url);
    if (request.origin !== this.config.apiOrigin) throw new SetupError("Hosted QA write target is not the approved API.");
    const route = `${method.toUpperCase()} ${request.pathname}`;
    const allowed = {
      entry: /^POST \/v2\/portfolio\/entries$/,
      pending: /^POST \/v2\/pending-recordings$/,
      entry_cleanup: /^POST \/v2\/portfolio\/entries\/[0-9a-f-]{36}\/void$/i,
      pending_cleanup: /^POST \/v2\/pending-recordings\/[0-9a-f-]{36}\/resolve$/i,
      checkin: /^POST \/v2\/monthly-checkin$/,
      checkin_cleanup: /^POST \/v2\/monthly-checkin\/undo$/,
      monthly_preview: /^POST \/v2\/monthly-plan$/,
      chat: /^POST \/chat$/,
    }[this.#scope];
    if (!allowed.test(route)) throw new SetupError("Hosted QA request is outside its approved write scope.");
  }
}
