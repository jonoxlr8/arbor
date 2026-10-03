export const ASK_ACTIONS = {
  portfolio: { href: "#portfolio", label: "View portfolio" },
  monthly_plan: { href: "#home/monthly", label: "View monthly plan" },
  what_if: { href: "#portfolio/what-if", label: "Explore What If" },
  saved_plan: { href: "#home/plan", label: "View your plan" },
  goal: { href: "#settings/goal", label: "View your goal" },
  learn: { href: "/learn", label: "Learn more" },
  access: { href: "#settings/plus", label: "View Arbor access" },
  settings: { href: "#settings", label: "Open Settings" },
} as const;
export type AskAction = keyof typeof ASK_ACTIONS;
export const FEEDBACK_INTENTS = ["education","instrument_education","plan","actual_holdings","holdings_help","recorded_cost","goal_progress","monthly_plan","monthly_checkin","pending_recording","contribution","projection","assessment","readiness","preferences","risk","implementation","overlap","next_action","change_plan","assumptions","plus","help","out_of_scope","decision_boundary","clarification","legacy_plan"] as const;
export type FeedbackContext = { intent: typeof FEEDBACK_INTENTS[number]; answer_version: "deterministic-ask-1" };
export const FEEDBACK_REASONS = { unclear: "Hard to understand", not_my_question: "Didn’t answer my question", numbers_look_wrong: "Numbers look wrong", missing_detail: "Missing detail" } as const;
export type FeedbackReason = keyof typeof FEEDBACK_REASONS;
export type AskPresentation = { summary?: string; action?: AskAction; feedback_context?: FeedbackContext };
export const object = (v: unknown): v is Record<string,unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export const isFeedbackContext = (v: unknown): v is FeedbackContext => object(v) && Object.keys(v).length === 2 && v.answer_version === "deterministic-ask-1" && typeof v.intent === "string" && (FEEDBACK_INTENTS as readonly string[]).includes(v.intent);
export const isFeedbackReason = (v: unknown): v is FeedbackReason => typeof v === "string" && Object.hasOwn(FEEDBACK_REASONS,v);
export function parseAskPresentation(body: Record<string,unknown>, reply: string): AskPresentation {
  const value: AskPresentation = {};
  if (body.summary !== undefined) {
    if (typeof body.summary !== "string" || !body.summary.trim() || body.summary.length > 360 || !reply.replace(/\s+/g," ").startsWith(body.summary.replace(/\s+/g," "))) throw new Error("The explanation was incomplete. Please retry.");
    value.summary = body.summary;
  }
  if (body.action !== undefined) {
    if (typeof body.action !== "string" || !Object.hasOwn(ASK_ACTIONS,body.action)) throw new Error("The explanation was incomplete. Please retry.");
    value.action = body.action as AskAction;
  }
  if (body.feedback_context !== undefined) {
    if (!isFeedbackContext(body.feedback_context)) throw new Error("The explanation was incomplete. Please retry.");
    value.feedback_context = body.feedback_context;
  }
  return value;
}
