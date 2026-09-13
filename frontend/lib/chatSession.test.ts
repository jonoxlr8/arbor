import test from "node:test";
import assert from "node:assert/strict";
import { createChatSession, chatPlanKey } from "./chatSession";
import { createChatReader } from "./api";
import type { Plan } from "./types/plan";
import type { RequestState } from "./dashboardConsistency";

type Reply = { question: string; reply: string };
test("chat timeout ends loading and another request can succeed", async () => {
  const states: RequestState<Reply>[] = [];
  let fail = true;
  const session = createChatSession(async () => fail ? new Promise(() => {}) : { reply: "Ready" }, s => states.push(s), 5);
  await session.send("Explain my plan");
  assert.equal(states.at(-1)?.status, "error");
  fail = false;
  await session.send("Explain my plan");
  assert.equal(states.at(-1)?.status, "ready");
});

test("superseded replies cannot append an old answer", async () => {
  const states: RequestState<Reply>[] = [];
  let resolveOld!: (value: {reply: string}) => void;
  const session = createChatSession(async question => question === "old" ? new Promise(resolve => { resolveOld = resolve; }) : {reply: "new"}, s => states.push(s));
  const old = session.send("old");
  await Promise.resolve(); await Promise.resolve();
  await session.send("new");
  resolveOld({reply:"old"});
  await old;
  assert.deepEqual(states.filter(s => s.status === "ready").map(s => s.data?.reply), ["new"]);
});

test("context change uses a new chat key and unmount aborts old replies", async () => {
  const plan = {profile:{currency:"PHP"}, portfolio:[], projection:{projected_value:1}} as unknown as Plan;
  assert.notEqual(chatPlanKey(plan), chatPlanKey({...plan, projection:{...plan.projection, projected_value:2}}));
  const states: RequestState<Reply>[] = [];
  let signal!: AbortSignal;
  const session = createChatSession(async (_q, active) => {signal = active; return new Promise(() => {});}, s => states.push(s));
  const pending = session.send("old context");
  await Promise.resolve(); await Promise.resolve();
  session.dispose();
  await pending;
  assert.equal(signal.aborted, true);
  assert.deepEqual(states.map(s => s.status), ["loading"]);
});

test("chat API validates replies and only sends a question, not client plan data", async () => {
  const reader = createChatReader(async () => ({Authorization:"Bearer fixture"}), async (_url, init) => {
    assert.deepEqual(JSON.parse(init?.body as string), {message:"Explain my plan"});
    return Response.json({reply:"Target explanation"});
  });
  assert.equal((await reader("Explain my plan")).reply, "Target explanation");
  for (const body of [null, {}, {reply:3}, {reply:" "}]) {
    await assert.rejects(createChatReader(async () => ({}), async () => Response.json(body))("Question"), /incomplete/);
  }
});

test("chat API deadline includes a never-settling request", async () => {
  const reader = createChatReader(async () => ({}), async () => new Promise(() => {}), 5);
  await assert.rejects(reader("Question"), /timed out/);
});
