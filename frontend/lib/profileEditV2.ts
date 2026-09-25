import type { ExplicitCustomization, PlanV2, ProfileV2Input, Strategy } from "./types/planV2";
import { ONBOARDING_STEPS, EMPTY_ANSWERS, onboardingRequest, SAVINGS_OPTIONS, DEBT_OPTIONS, HORIZON_OPTIONS, RISK_OPTIONS, type Answers } from "./onboardingV2";
import { getAccessToken } from "./auth";
import { apiBaseUrl } from "./apiConfig";
import { boundedRequest } from "./dashboardConsistency";
import { InvalidSessionError } from "./accountRecovery";
import { isPlanV2 } from "./planV2";

export type EditInputs = Omit<ProfileV2Input, "selected_approach" | "saved_preferences" | "explicit_customization" | "implementation_choices">;
export type EditRequest = {inputs: EditInputs; proposed_approach: Strategy | "short_term" | null; expected_revision: string; explicit_customization?: ExplicitCustomization};
export type EditPreview = {current: PlanV2; proposed: PlanV2};
export const EDIT_LABELS: Record<typeof ONBOARDING_STEPS[number], string> = {
  full_name:"Name", country:"Country", emergency_savings:"Emergency savings", high_interest_debt:"High-interest debt",
  goal_target:"Goal amount", current_portfolio_value:"Planning starting value", monthly_investment:"Monthly contribution",
  horizon:"Time horizon", risk_response:"Market-drop reaction",
};
export function editAnswers(profile: ProfileV2Input): Answers {
  const answers = {...EMPTY_ANSWERS};
  for (const field of ONBOARDING_STEPS) answers[field] = profile[field] == null ? "" : String(profile[field]);
  return answers;
}
export function editInputs(answers: Answers): EditInputs {
  const input = onboardingRequest(answers);
  return Object.fromEntries(["strategy_engine_version", "currency", ...ONBOARDING_STEPS].map(key=>[key,input[key as keyof ProfileV2Input]])) as EditInputs;
}
export function displayAnswer(field: string, value: unknown): string {
  if (value == null || value === "") return "Not set";
  const option = [...SAVINGS_OPTIONS,...DEBT_OPTIONS,...HORIZON_OPTIONS,...RISK_OPTIONS].find(([key])=>key===value);
  if (option) return option[1];
  if (["goal_target","current_portfolio_value","monthly_investment"].includes(field)) return `₱${Number(value).toLocaleString("en-PH",{maximumFractionDigits:2})}`;
  return String(value);
}
export function planChoiceLabel(value: PlanV2): string {
  return value.profile.selected_approach === "short_term" ? "Short-term path" : value.profile.selected_approach ?? value.plan.selected_strategy ?? "Short-term path";
}
export function editSaveLabel(preview: EditPreview) {
  const before = preview.current.profile.selected_approach;
  const after = preview.proposed.profile.selected_approach;
  const customized = JSON.stringify(preview.current.profile.explicit_customization ?? null) !== JSON.stringify(preview.proposed.profile.explicit_customization ?? null);
  return after && (after !== before || customized) ? `Save changes and use ${after === "short_term" ? "the short-term path" : after} as my plan` : "Save profile changes";
}
export function createProfileEditRequester(token = getAccessToken, request: typeof fetch = fetch) {
  return async (save: boolean, payload: EditRequest, userId: string, signal: AbortSignal): Promise<EditPreview | PlanV2> => boundedRequest(async active=>{
    const accessToken = await token(userId); active.throwIfAborted();
    const response = await request(`${apiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL,process.env.NODE_ENV)}/v2/profiles/${save ? "me" : "preview"}`, {
      method:save ? "PUT" : "POST", signal:active, headers:{Authorization:`Bearer ${accessToken}`,"Content-Type":"application/json"},body:JSON.stringify(payload),
    });
    if(response.status===401)throw new InvalidSessionError("Your session has expired. Sign in again to continue.");
    if(response.status===409)throw new Error("Your saved profile changed. Reload it and review your edits again.");
    if(response.status===422)throw new Error("Check your answers and choose an approach for this horizon.");
    if(!response.ok)throw new Error("We couldn’t confirm these changes. Your edits are still here. Reload your saved profile before retrying a save.");
    const body=await response.json();
    if(save ? !isPlanV2(body) : !isPlanV2(body?.current)||!isPlanV2(body?.proposed))throw new Error("The profile response was incomplete. Reload your saved profile.");
    return body;
  },signal);
}
export const profileEditRequest=createProfileEditRequester();
