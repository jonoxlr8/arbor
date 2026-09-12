import test from "node:test";
import assert from "node:assert/strict";
import { createAccountRecovery, InvalidSessionError, type AccountState } from "./accountRecovery";
import type { Plan } from "./types/plan";

const session = (id: string) => ({ user: { id }, access_token: "test-access-token" });
const plan = { profile: { full_name: "Saved" } } as Plan;
function setup(getUser = async () => ({ id: "a" } as { id: string } | null), getProfile = async (): Promise<Plan | null> => plan, timeoutMs = 100) {
  const states: AccountState[] = [];
  let clears = 0;
  const recovery = createAccountRecovery({ getUser, getProfile, timeoutMs, onState: s => states.push(s), onIdentityChange: () => clears++ });
  return { recovery, states, clears: () => clears };
}
test("no session becomes unauthenticated", async () => {
  const t = setup(async () => null); await t.recovery.restore();
  assert.equal(t.states.at(-1)?.status, "unauthenticated");
});
test("saved profile becomes ready", async () => {
  const t = setup(); await t.recovery.restore(); assert.equal(t.states.at(-1)?.status, "ready");
});
test("confirmed missing profile becomes onboarding", async () => {
  const t = setup(undefined, async () => null); await t.recovery.restore(); assert.equal(t.states.at(-1)?.status, "no-profile");
});
test("retry succeeds after failure", async () => {
  let fail = true;
  const t = setup(undefined, async () => { if (fail) throw Error("offline"); return plan; });
  await t.recovery.restore(); assert.equal(t.states.at(-1)?.status, "error");
  fail = false; await t.recovery.restore(); assert.equal(t.states.at(-1)?.status, "ready");
});
test("invalid credentials return to auth", async () => {
  const t = setup(undefined, async () => { throw new InvalidSessionError(); });
  await t.recovery.restore(); assert.equal(t.states.at(-1)?.status, "unauthenticated");
});
test("never-settling request terminates", async () => {
  const t = setup(async () => new Promise(() => {}), undefined, 5);
  await t.recovery.restore(); assert.equal(t.states.at(-1)?.status, "error");
});
test("account switch clears state and ignores old response", async () => {
  let finish!: (p: Plan) => void;
  const t = setup(undefined, () => new Promise(resolve => { finish = resolve; }));
  const pending = t.recovery.restore(); await Promise.resolve(); await Promise.resolve();
  const isCurrent = t.recovery.guard();
  assert.equal(isCurrent(), true);
  t.recovery.identityChanged("b"); const clears = t.clears();
  assert.equal(isCurrent(), false);
  finish(plan); await pending;
  assert.equal(t.states.at(-1)?.status, "checking"); assert.equal(clears, 2);
  assert.equal(t.recovery.identityChanged("b"), false);
  t.recovery.completeProfile("a", plan); assert.equal(t.states.at(-1)?.status, "checking");
});
test("signout invalidates in-flight restoration", async () => {
  let finish!: (p: Plan) => void;
  const t = setup(undefined, () => new Promise(resolve => { finish = resolve; }));
  const pending = t.recovery.restore(); await Promise.resolve(); await Promise.resolve();
  t.recovery.identityChanged(null); finish(plan); await pending;
  assert.equal(t.states.at(-1)?.status, "unauthenticated");
});
test("late session response after timeout cannot change identity", async () => {
  let finish!: (u: { id: string }) => void;
  const t = setup(() => new Promise(resolve => { finish = resolve; }), undefined, 5);
  await t.recovery.restore(); finish({ id: "old" }); await Promise.resolve();
  assert.equal(t.clears(), 0); assert.equal(t.states.at(-1)?.status, "error");
});

test("signout exits a recovery error even when identity was already null", async () => {
  let fail = false;
  const t = setup(async () => { if (fail) throw Error("offline"); return null; });
  await t.recovery.restore();
  fail = true;
  await t.recovery.restore();
  t.recovery.signedOut();
  assert.equal(t.states.at(-1)?.status, "unauthenticated");
});

test("an earlier request cannot overwrite a successful retry", async () => {
  let finish!: (p: Plan) => void;
  let calls = 0;
  const t = setup(undefined, async () => ++calls === 1 ? new Promise(resolve => { finish = resolve; }) : plan);
  const pending = t.recovery.restore();
  await Promise.resolve(); await Promise.resolve();
  await t.recovery.restore();
  finish({ profile: { full_name: "Old" } } as Plan);
  await pending;
  assert.deepEqual(t.states.at(-1), { status: "ready", userId: "a", plan });
});

test("same-user token events leave the ready dashboard alone", async () => {
  const t = setup();
  await t.recovery.restore();
  const count = t.states.length;
  assert.equal(t.recovery.identityChanged("a"), false);
  assert.equal(t.states.length, count);
});

test("disposed coordinator cannot publish a late result", async () => {
  let finish!: (p: Plan) => void;
  const t = setup(undefined, () => new Promise(resolve => { finish = resolve; }));
  const pending = t.recovery.restore();
  await Promise.resolve(); await Promise.resolve();
  t.recovery.dispose();
  const count = t.states.length;
  finish(plan); await pending;
  assert.equal(t.states.length, count);
});

test("SIGNED_IN wins over an older unauthenticated lookup without another event", async () => {
  let finishInitial!: (user: null) => void;
  let lookups = 0;
  let profileReads = 0;
  const t = setup(
    () => { lookups++; return new Promise(resolve => { finishInitial = resolve; }); },
    async () => { profileReads++; return plan; },
  );
  const initial = t.recovery.restore();
  const signedIn = t.recovery.authChanged("SIGNED_IN", session("a"));
  const afterSignIn = t.states.length;
  // Supabase notifies SIGNED_IN before signInWithPassword returns to the form.
  await t.recovery.authenticated(session("a"));
  t.recovery.authChanged("INITIAL_SESSION", null);
  finishInitial(null);
  await Promise.all([initial, signedIn]);
  assert.deepEqual(t.states.at(-1), { status: "ready", userId: "a", plan });
  assert.ok(t.states.slice(afterSignIn).every(s => s.status !== "unauthenticated"));
  assert.equal(lookups, 1);
  assert.equal(profileReads, 1);
});

test("form success uses its session immediately even if a new lookup would return null", async () => {
  let profileReads = 0;
  const t = setup(async () => null, async () => { profileReads++; return plan; });
  await t.recovery.restore();
  const success = t.recovery.authenticated(session("a"));
  assert.equal(t.states.at(-1)?.status, "checking");
  await t.recovery.authChanged("SIGNED_IN", session("a"));
  await success;
  assert.deepEqual(t.states.at(-1), { status: "ready", userId: "a", plan });
  assert.equal(profileReads, 1);
});

test("successful sign-in without a saved profile goes directly to onboarding", async () => {
  const t = setup(async () => null, async () => null);
  await t.recovery.authenticated(session("a"));
  assert.deepEqual(t.states.at(-1), { status: "no-profile", userId: "a" });
});

test("same-user SIGNED_IN and TOKEN_REFRESHED do not reload a restored dashboard", async () => {
  let reads = 0;
  const t = setup(undefined, async () => { reads++; return plan; });
  await t.recovery.authenticated(session("a"));
  const count = t.states.length;
  await t.recovery.authChanged("TOKEN_REFRESHED", session("a"));
  await t.recovery.authChanged("SIGNED_IN", session("a"));
  t.recovery.authChanged("INITIAL_SESSION", null);
  assert.equal(t.states.length, count);
  assert.equal(reads, 1);
});

test("cross-tab SIGNED_OUT wins over a pending signed-in profile response", async () => {
  let finish!: (p: Plan) => void;
  const t = setup(undefined, () => new Promise(resolve => { finish = resolve; }));
  const pending = t.recovery.authChanged("SIGNED_IN", session("a"));
  await Promise.resolve();
  t.recovery.authChanged("SIGNED_OUT", null);
  finish(plan);
  await pending;
  assert.equal(t.states.at(-1)?.status, "unauthenticated");
});

test("switching accounts during signed-in restoration only publishes the new plan", async () => {
  let finishOld!: (p: Plan) => void;
  let reads = 0;
  const t = setup(undefined, async () => ++reads === 1 ? new Promise(resolve => { finishOld = resolve; }) : plan);
  const old = t.recovery.authChanged("SIGNED_IN", session("a"));
  await Promise.resolve();
  await t.recovery.authChanged("SIGNED_IN", session("b"));
  finishOld({ profile: { full_name: "Old" } } as Plan);
  await old;
  assert.deepEqual(t.states.at(-1), { status: "ready", userId: "b", plan });
  assert.equal(t.clears(), 2);
});

test("same-user sign-in supersedes a pending generic session recheck", async () => {
  let finishLookup!: (user: null) => void;
  const t = setup(() => new Promise(resolve => { finishLookup = resolve; }));
  await t.recovery.authenticated(session("a"));
  const recheck = t.recovery.restore();
  await t.recovery.authChanged("SIGNED_IN", session("a"));
  finishLookup(null);
  await recheck;
  assert.deepEqual(t.states.at(-1), { status: "ready", userId: "a", plan });
});
