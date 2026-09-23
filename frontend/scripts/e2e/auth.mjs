// Local CLI / reusable Playwright fixture. No application imports or auth bypass.
import { readFile, mkdir, chmod, writeFile, rename, unlink, rmdir } from "node:fs/promises";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { configuration, authenticate, SetupError } from "./session.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const directory = path.join(root, "playwright/.auth");
const stateFile = path.join(directory, "test-user.json");
const lock = path.join(directory, "run.lock");

async function optionalFile(file) {
  try { return await readFile(file, "utf8"); }
  catch (error) { if (error.code === "ENOENT") return ""; throw error; }
}
export async function loadConfiguration() {
  // .env.e2e.local is not loaded by Next.js. Never use NEXT_PUBLIC_ test secrets.
  const env = {...parseEnv(await optionalFile(path.join(root, ".env.local"))),
    ...parseEnv(await optionalFile(path.join(root, ".env.e2e.local"))), ...process.env};
  return configuration(env);
}
async function save(state) {
  const temporary = `${stateFile}.tmp`;
  await writeFile(temporary, JSON.stringify(state), {mode:0o600});
  await chmod(temporary, 0o600);
  await rename(temporary, stateFile);
}
async function clear() { await unlink(stateFile).catch(error => { if (error.code !== "ENOENT") throw error; }); }

/** Callback receives an isolated test-account page/context, never a personal profile.
 * Do not enable traces, HAR, console/network logging or video around auth.
 */
export async function withAuthenticatedBrowser(check, {headed = false} = {}) {
  const config = await loadConfiguration(); // Fail before any browser/network call.
  if (process.env.DEBUG || process.env.PWDEBUG || process.env.NODE_DEBUG) {
    throw new SetupError("Unset DEBUG, PWDEBUG and NODE_DEBUG for authenticated E2E runs; diagnostic logs may expose session data.");
  }
  await mkdir(directory, {recursive:true, mode:0o700});
  await chmod(directory, 0o700);
  try { await mkdir(lock, {mode:0o700}); }
  catch { throw new SetupError("Another E2E session owns the cache. Finish it first. After a crashed run, remove playwright/.auth/run.lock only after confirming no E2E process remains."); }
  let browser, context;
  try {
    let state;
    try { state = JSON.parse(await optionalFile(stateFile) || "null"); }
    catch { throw new SetupError("The isolated session cache is unreadable. Remove playwright/.auth/test-user.json and retry."); }
    const authenticated = await authenticate(config, state);
    await save(authenticated.state);
    // Dynamic import after secrets/config validation; no tooling in production bundles.
    const { chromium } = await import("playwright");
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/ARBOR_E2E_|SUPABASE|DEBUG/.test(key)));
    browser = await chromium.launch({channel:"chrome", headless:!headed, env});
    context = await browser.newContext({storageState:authenticated.state, baseURL:config.baseURL});
    const page = await context.newPage();
    const profile = page.waitForResponse(response => new URL(response.url()).pathname === "/profiles/me", {timeout:20000}).catch(() => null);
    await page.goto(`${config.baseURL}/#home`);
    const response = await profile;
    if (!response || ![200,404].includes(response.status())) throw new SetupError("Arbor profile restoration failed. Check the local backend and JWT configuration.");
    // 404 is an authenticated account awaiting onboarding, not a fake saved plan.
    await check({page, context, browser, reused:authenticated.reused});
    const final = await authenticate(config, await context.storageState(), undefined, {allowLogin:false});
    if (final) await save(final.state); else await clear();
  } catch (error) {
    await clear(); // Never reuse an uncertain/wrong-account session on the next run.
    if (error instanceof SetupError) throw error;
    throw new SetupError("E2E browser validation failed. Confirm local frontend/backend and Google Chrome are available. Raw errors were withheld to protect credentials/session data.");
  } finally {
    await browser?.close().catch(() => {});
    await rmdir(lock);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await withAuthenticatedBrowser(async ({browser, reused}) => {
      console.log(reused ? "Dedicated test session verified and reused." : "Dedicated test account authenticated normally.");
      if (process.argv.includes("--headed")) {
        console.log("Isolated test browser ready. Press Ctrl+C here to save its current session and close it. Closing the browser directly discards the cache safely.");
        await new Promise(resolve => {
          const finish = () => { process.off("SIGINT", finish); browser.off("disconnected", finish); resolve(); };
          process.once("SIGINT", finish);
          browser.once("disconnected", finish);
        });
      }
    }, {headed:process.argv.includes("--headed")});
    console.log("E2E authentication check complete. No profile fixture was written.");
  } catch (error) {
    console.error(error instanceof SetupError ? error.message : "E2E setup failed; sensitive diagnostic details were withheld.");
    process.exitCode = 1;
  }
}
