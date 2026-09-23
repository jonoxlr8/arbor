import { getAccessToken } from "./auth";
import { apiBaseUrl } from "./apiConfig";
import { boundedRequest } from "./dashboardConsistency";
import { InvalidSessionError } from "./accountRecovery";

export type NextAction = {
  key: "financial_foundation" | "complete_profile" | "review_short_term_path" | "review_historical_plan" | "review_monthly_contribution";
  title: string; explanation: string; button_label: string; blocking: boolean;
  destination: "investment_profile" | "onboarding" | "plan" | "portfolio";
};
export function isNextAction(value: unknown): value is NextAction {
  if (!value || typeof value !== "object") return false;
  const v = value as NextAction;
  return ["financial_foundation","complete_profile","review_short_term_path","review_historical_plan","review_monthly_contribution"].includes(v.key) &&
    ["investment_profile","onboarding","plan","portfolio"].includes(v.destination) &&
    [v.title,v.explanation,v.button_label].every(s=>typeof s === "string" && s.length>0) && typeof v.blocking === "boolean";
}
export function createNextActionReader(token=getAccessToken, request:typeof fetch=fetch) {
  return (userId:string, signal:AbortSignal):Promise<NextAction> => boundedRequest(async active=>{
    const accessToken=await token(userId); active.throwIfAborted();
    const response=await request(`${apiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL,process.env.NODE_ENV)}/v2/next-action`,{
      signal:active, cache:"no-store", headers:{Authorization:`Bearer ${accessToken}`},
    });
    if(response.status===401)throw new InvalidSessionError("Your session has expired. Sign in again to continue.");
    if(!response.ok)throw new Error("We couldn’t check your next step. Please retry.");
    const body:unknown=await response.json();
    if(!isNextAction(body))throw new Error("We couldn’t check your next step. Please retry.");
    return body;
  },signal);
}
export const readNextAction=createNextActionReader();
