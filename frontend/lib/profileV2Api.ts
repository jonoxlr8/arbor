import { createProfileReader, isPlan, ProfileApiError } from "./api";
import { getAccessToken } from "./auth";
import { InvalidSessionError } from "./accountRecovery";
import { boundedRequest } from "./dashboardConsistency";
import { apiBaseUrl } from "./apiConfig";
import { isPlanV2 } from "./planV2";
import type { AccountPlan, ProfileV2Input } from "./types/planV2";

export function isAccountPlan(body: unknown): body is AccountPlan {
  // Tagged data must never fall back to the legacy contract on a malformed v2 response.
  if (body && typeof body === "object" && "strategy_engine_version" in body) {
    if (body.strategy_engine_version === "2.0") return isPlanV2(body);
    if (body.strategy_engine_version !== "1.0" && body.strategy_engine_version != null) return false;
  }
  return isPlan(body);
}
export const getAccountProfile = createProfileReader<AccountPlan>(getAccessToken, fetch, 12000, isAccountPlan);

export function createV2ProfileCreator(
  token = getAccessToken, request: typeof fetch = fetch,
  recover = getAccountProfile, timeoutMs = 12000,
) {
  const base = apiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL, process.env.NODE_ENV);
  return async (input: ProfileV2Input, userId: string, signal?: AbortSignal): Promise<AccountPlan> => {
    try {
      return await boundedRequest(async activeSignal => {
        const accessToken = await token(userId);
        activeSignal.throwIfAborted();
        const response = await request(`${base}/v2/profiles`, {
          method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(input), signal: activeSignal,
        });
        if (response.status === 401) throw new InvalidSessionError("Your session could not be verified. Sign in again to continue.");
        if (response.status === 422) throw new ProfileApiError(422, "Please check your onboarding answers and try again.");
        if (!response.ok) throw new Error("Unable to save your plan.");
        const body: unknown = await response.json();
        if (!isAccountPlan(body)) throw new Error("The saved plan response was incomplete.");
        return body;
      }, signal, timeoutMs);
    } catch (error) {
      if (signal?.aborted) throw new Error("Profile creation was cancelled.");
      if (error instanceof InvalidSessionError || error instanceof ProfileApiError) throw error;
      // POST may have saved despite a lost response. Reconcile once; never repost automatically.
      try {
        const saved = await boundedRequest(s => recover(userId, undefined, s), signal, timeoutMs);
        if (saved && isAccountPlan(saved)) return { ...saved, profile_warning: "Your saved profile was restored after an interrupted request. New answers were not applied." };
      } catch (recoveryError) {
        if (recoveryError instanceof InvalidSessionError) throw recoveryError;
      }
      throw new Error("We couldn’t confirm your saved plan. Please retry; an existing profile will be restored without overwriting it.");
    }
  };
}
export const createV2Profile = createV2ProfileCreator();
