import { getAccessToken } from "./auth";
import { apiBaseUrl } from "./apiConfig";
import { boundedRequest } from "./dashboardConsistency";

export type CheckinRecord = { month: string; amount_php: string; completed_at: string; undone_at: string | null };
export type MonthlyState = { month: string; current: CheckinRecord | null; history: CheckinRecord[] };
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
// Form boundary only: preserve the API's two meaningful decimal-place policy.
// Extra trailing zeros are lossless; sub-cent amounts require user confirmation,
// not a newly invented rounding rule or a change to planner precision.
export function checkinAmountInput(value: string): string {
  if (!/^\d+(?:\.\d+)?$/.test(value)) return "";
  const [integer, fraction = ""] = value.split(".");
  const whole = integer.replace(/^0+(?=\d)/, "");
  if (whole.length > 12 || /[1-9]/.test(fraction.slice(2))) return "";
  const cents = fraction.slice(0, 2).padEnd(2, "0");
  return whole === "0" && cents === "00" ? "" : `${whole}.${cents}`;
}
export function validMonthly(value: unknown): value is MonthlyState {
  if (!value || typeof value !== "object") return false;
  const s = value as MonthlyState;
  const record = (v: CheckinRecord) => v && monthPattern.test(v.month) && typeof v.amount_php === "string" && /^\d+(\.\d{1,2})?$/.test(v.amount_php) && Number(v.amount_php) > 0 && Number(v.amount_php) < 1e12 && typeof v.completed_at === "string" && Number.isFinite(Date.parse(v.completed_at)) && (v.undone_at === null || (typeof v.undone_at === "string" && Number.isFinite(Date.parse(v.undone_at))));
  return monthPattern.test(s.month) && (s.current === null || (record(s.current) && s.current.month === s.month && s.current.undone_at === null)) && Array.isArray(s.history) && s.history.length <= 12 && s.history.every(record);
}
export const monthLabel = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-PH", {month:"long",year:"numeric",timeZone:"UTC"});
export const checkinDate = (stamp: string) => new Date(stamp).toLocaleDateString("en-PH", {month:"short",day:"numeric",timeZone:"UTC"});
export function createMonthlyApi(token=getAccessToken, request:typeof fetch=fetch) {
  return (userId:string, signal:AbortSignal, action:"read"|"complete"|"undo"="read", body?:{month:string;amount_php?:string}):Promise<MonthlyState> => boundedRequest(async active=>{
    const credential=await token(userId);active.throwIfAborted();
    const response=await request(`${apiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL,process.env.NODE_ENV)}/v2/monthly-checkin${action==="undo"?"/undo":""}`,{
      method:action==="read"?"GET":"POST",signal:active,cache:"no-store",
      headers:{Authorization:`Bearer ${credential}`,"Content-Type":"application/json"},
      ...(action==="read"?{}:{body:JSON.stringify(body)}),
    });
    if(!response.ok)throw new Error(response.status===409?"The month or your profile changed. Reload before recording your check-in.":"We couldn’t load or save your check-in. Please retry. Nothing is traded through Arbor.");
    const data:unknown=await response.json();if(!validMonthly(data))throw new Error("We couldn’t confirm your check-in. Reload before continuing.");return data;
  },signal);
}
export const monthlyApi=createMonthlyApi();
