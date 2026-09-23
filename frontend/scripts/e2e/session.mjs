// Node-only QA support. Never import this module from application code.
import { createClient } from "@supabase/supabase-js";

export class SetupError extends Error {}

export function configuration(env) {
  if (env.NODE_ENV === "production") throw new SetupError("E2E authentication is developer-only; do not run it with NODE_ENV=production.");
  const required = ["ARBOR_E2E_EMAIL", "ARBOR_E2E_PASSWORD", "ARBOR_E2E_USER_ID"];
  if (required.some(key => !env[key]?.trim())) {
    throw new SetupError("Set ARBOR_E2E_EMAIL, ARBOR_E2E_PASSWORD and ARBOR_E2E_USER_ID in .env.e2e.local. Use only a dedicated test account.");
  }
  if (env.ARBOR_E2E_ACCOUNT_IS_DISPOSABLE !== "true") {
    throw new SetupError("Set ARBOR_E2E_ACCOUNT_IS_DISPOSABLE=true only for an account reserved for disposable test data.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.ARBOR_E2E_EMAIL.trim()) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(env.ARBOR_E2E_USER_ID)) {
    throw new SetupError("Check the dedicated test email and Supabase user ID in .env.e2e.local.");
  }
  let base, supabase;
  try {
    base = new URL(env.ARBOR_E2E_BASE_URL || "http://localhost:3000");
    supabase = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
  } catch { throw new SetupError("Configure a local ARBOR_E2E_BASE_URL and the existing public Supabase URL."); }
  const local = url => ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const originOnly = url => !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash;
  if (!local(base) || !["http:", "https:"].includes(base.protocol) || !originOnly(base)) {
    throw new SetupError("E2E browser authentication is restricted to a loopback origin, not the deployed Arbor site.");
  }
  if (!originOnly(supabase) || (supabase.protocol !== "https:" && !(local(supabase) && supabase.protocol === "http:"))) {
    throw new SetupError("Use the Supabase project root URL; HTTPS is required except for a local Supabase instance.");
  }
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
  let anon = false;
  try { anon = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()).role === "anon"; } catch { /* Not a legacy public JWT. */ }
  if (!key.startsWith("sb_publishable_") && !anon) {
    throw new SetupError("A Supabase publishable/anon key is required. Secret and service-role keys are forbidden.");
  }
  return { baseURL:base.origin, supabaseURL:supabase.origin, key,
    email:env.ARBOR_E2E_EMAIL.trim(), password:env.ARBOR_E2E_PASSWORD,
    userId:env.ARBOR_E2E_USER_ID,
    // Supabase JS's default project-specific localStorage key (same browser SDK).
    storageKey:`sb-${supabase.hostname.split(".")[0]}-auth-token` };
}

export function sessionStorage(config, state) {
  // Do not restore other sites, cookies, financial form inputs or arbitrary keys.
  const entries = state?.origins?.find(origin => origin.origin === config.baseURL)?.localStorage || [];
  const values = new Map(entries.filter(entry => entry.name === config.storageKey && typeof entry.value === "string").map(entry => [entry.name, entry.value]));
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: key => { values.delete(key); },
    snapshot: () => ({cookies:[], origins:[{origin:config.baseURL, localStorage:
      [...values].filter(([name]) => name === config.storageKey).map(([name,value]) => ({name,value}))}]}),
  };
}

function checkOwner(user, config) {
  if (!user || user.id !== config.userId || user.email?.toLowerCase() !== config.email.toLowerCase()) {
    throw new SetupError("Account identity did not match the configured dedicated test account. No browser was authorized. Check the configuration and remove the isolated session cache.");
  }
}

export async function authenticate(config, state, factory = createClient, { allowLogin = true } = {}) {
  const storage = sessionStorage(config, state);
  const client = factory(config.supabaseURL, config.key, {
    auth:{storage, persistSession:true, autoRefreshToken:false, detectSessionInUrl:false, debug:false},
    global:{fetch:(url, init) => fetch(url, {...init, signal:AbortSignal.timeout(15000)})},
  });
  try {
    // getUser contacts Supabase; cached identity/JWT payload alone is not trusted.
    // The SDK handles refresh tokens normally when loading an expired session.
    let result = await client.auth.getUser();
    let reused = true;
    if (result.error || !result.data.user) {
      const error = result.error;
      const ended = !error || error.name === "AuthSessionMissingError" ||
        ["session_not_found", "session_expired", "refresh_token_not_found", "refresh_token_already_used", "bad_jwt", "user_not_found"].includes(error.code) ||
        [400,401,403].includes(error.status);
      if (!ended) throw new SetupError("Supabase could not verify the test session. Check connectivity/configuration and retry; no automatic login loop was started.");
      if (!allowLogin) return null; // A browser logout stays logged out until the next run.
      const signedIn = await client.auth.signInWithPassword({email:config.email, password:config.password});
      if (signedIn.error || !signedIn.data.session) throw new SetupError("Dedicated test sign-in failed. Check the local credentials, email confirmation and Supabase rate limits. No account was created or changed.");
      result = await client.auth.getUser();
      reused = false;
    }
    if (result.error) throw new SetupError("Supabase could not verify the signed-in test account. Retry after checking the local setup.");
    checkOwner(result.data.user, config);
    return {state:storage.snapshot(), reused};
  } catch (error) {
    if (error instanceof SetupError) throw error;
    throw new SetupError("Test authentication could not complete. Check the local setup and connectivity; provider details were withheld.");
  } finally { client.auth.stopAutoRefresh(); }
}
