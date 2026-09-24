import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { V2Destination } from "../components/PlanV2View";
import { chatPlanKey, chatPrompts, chatErrorMessage, createChatSession } from "./chatSession";
import { createChatReader } from "./api";
import type { PlanV2 } from "./types/planV2";
import type { RequestState } from "./dashboardConsistency";

// Only the discriminant/key are consumed by the shared chat: context is server-loaded.
const plan = { strategy_engine_version:"2.0", profile:{selected_approach:"Growth"}, plan:{plan_basis:"user_selected"} } as unknown as PlanV2;
test("V2 Ask Arbor replaces unavailable state with the shared labelled composer and focused suggestions", () => {
  const html = renderToStaticMarkup(createElement(V2Destination, {value:plan, active:"ask", userId:"fixture"}));
  assert.match(html, /Your investing companion/);
  assert.match(html, /Your question about your Arbor plan/);
  assert.match(html, /Explain my investment plan/);
  assert.match(html, /How does the contribution planner work/);
  assert.match(html, /not actual holdings/);
  assert.doesNotMatch(html, /not available for this plan yet|recommended for you/);
  assert.match(html, /min-h-11/);
});
test("V1 prompts remain unchanged and V2 prompts do not presume a projection result", () => {
  assert.ok(chatPrompts(false).includes("Does my projection reach my goal?"));
  assert.ok(chatPrompts(true).includes("What should I do next?"));
  assert.ok(!chatPrompts(true).includes("What is my current portfolio worth?"));
  assert.ok(chatPrompts(true, true).includes("What is my current portfolio worth?"));
  assert.ok(!chatPrompts(true).includes("Does my projection reach my goal?"));
});
test("V2 context changes reset conversation and account mounting isolates sessions", () => {
  assert.notEqual(chatPlanKey(plan), chatPlanKey({...plan, profile:{...plan.profile,selected_approach:"Balanced"}}));
  assert.notEqual(chatPlanKey(plan), chatPlanKey({...plan, plan:{...plan.plan,plan_basis:"historical_assessment"}}));
  const source = readFileSync("components/PlanV2View.tsx", "utf8");
  assert.match(source, /ChatSection key=\{userId\}/);
  assert.match(readFileSync("app/page.tsx", "utf8"), /PlanV2View key=\{account.userId\}/);
});
test("authenticated question reaches shared endpoint, loading completes with a bounded out-of-scope reply", async () => {
  const states: RequestState<{question:string;reply:string}>[] = [];
  let calls = 0;
  const reader = createChatReader(async () => ({Authorization:"Bearer fixture"}), async (url, init) => {
    calls++;
    assert.match(String(url), /\/chat$/);
    assert.equal(init?.method, "POST");
    assert.equal((init?.headers as Record<string,string>).Authorization, "Bearer fixture");
    assert.deepEqual(JSON.parse(String(init?.body)), {message:"Write Python"});
    return Response.json({reply:"I’m here to help with your Arbor investment plan.",category:"out_of_scope",intent:"out_of_scope"});
  });
  const session = createChatSession(reader, state => states.push(state));
  await session.send("Write Python");
  assert.equal(calls, 1);
  assert.deepEqual(states.map(s => s.status), ["loading","ready"]);
  assert.match(states.at(-1)?.data?.reply ?? "", /Arbor investment plan/);
});
for (const [status, text] of [[401,"Sign in again"],[404,"Create your Arbor plan"],[503,"couldn’t explain"]] as const) {
  test(`chat ${status} displays safe recoverable copy without raw response text`, async () => {
    const states: RequestState<{question:string;reply:string}>[] = [];
    const reader = createChatReader(async () => ({}), async () => Response.json({detail:"private raw error"}, {status}));
    const session = createChatSession(reader, state => states.push(state));
    await session.send("Explain my plan");
    const state = states.at(-1);
    assert.equal(state?.status, "error");
    const message = chatErrorMessage(state?.status === "error" ? state.error : null);
    assert.ok(message.includes(text));
    assert.doesNotMatch(message, /private raw/);
  });
}
test("unknown errors remain generic and shared UI keeps duplicate, composition and accessible loading guards", () => {
  assert.doesNotMatch(chatErrorMessage("secret"), /secret/);
  const source = readFileSync("components/ArborChat.tsx", "utf8");
  assert.match(source, /!trimmedPrompt \|\| busy.current/);
  assert.match(source, /!e.nativeEvent.isComposing/);
  assert.match(source, /role="status"/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /disabled=\{loading \|\| limited \|\| !question.trim\(\)\}/);
});
