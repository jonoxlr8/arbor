import type { SupabaseClient } from "@supabase/supabase-js";
import { withDeadline } from "./accountRecovery";
import { passwordResetRedirectTo } from "./authConfig";

export const resetRequestMessage = "If an account exists for this email, we’ve sent password reset instructions. Check your inbox and spam folder.";
export const resetLinkMessage = "This reset link is missing, expired or already used. Request a new email to try again.";

export type RecoveryToken = { token_hash: string; type: "recovery" };

export function parseRecoveryToken(fragment: string): RecoveryToken | null {
  if (!fragment.startsWith("#") || fragment.length > 1024) return null;
  const params = new URLSearchParams(fragment.slice(1));
  if ([...params.keys()].some(key => !["token_hash", "type"].includes(key)) ||
      params.getAll("token_hash").length !== 1 || params.getAll("type").length !== 1 ||
      params.get("type") !== "recovery") return null;
  const token = params.get("token_hash") ?? "";
  return /^[a-zA-Z0-9_-]{20,512}$/.test(token) ? { token_hash: token, type: "recovery" } : null;
}

export function captureRecoveryToken(browser: Pick<Window, "location" | "history">): RecoveryToken | null {
  const fragment = browser.location.hash;
  browser.history.replaceState(null, "", browser.location.pathname);
  return parseRecoveryToken(fragment);
}

// Called only by the explicit verification action. Return identity, never tokens.
export async function verifyRecoveryToken(client: SupabaseClient, token: RecoveryToken, timeoutMs = 15000): Promise<string | null> {
  try {
    const { data, error } = await withDeadline(client.auth.verifyOtp(token), timeoutMs);
    return !error && data.session?.access_token && data.session.user?.id ? data.session.user.id : null;
  } catch { return null; }
}

// Identity only, in memory. An ordinary stored session is not a recovery link.
export function createRecoveryTracker() {
  let userId: string | null = null;
  const listeners = new Set<() => void>();
  return {
    getUserId: () => userId,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    authChanged(event: string, session: { user: { id: string } } | null) {
      if (event === "PASSWORD_RECOVERY") userId = session?.user.id ?? null;
      else if (event === "SIGNED_OUT" || event === "SIGNED_IN" || (session && session.user.id !== userId)) userId = null;
      else return;
      listeners.forEach(listener => listener());
    },
  };
}

export function passwordValidation(password: string, confirmation: string): string | null {
  if (password.length < 8) return "Use at least 8 characters for your new password.";
  if (password !== confirmation) return "Your passwords don’t match. Please check both fields.";
  return null;
}

export async function requestPasswordReset(client: SupabaseClient, email: string) {
  try {
    const { error } = await withDeadline(client.auth.resetPasswordForEmail(email.trim(), { redirectTo: passwordResetRedirectTo }));
    // Do not turn account-specific errors into an account-existence signal.
    if (error && !["user_not_found", "email_not_confirmed", "user_banned"].includes(error.code ?? "")) {
      if (["over_email_send_rate_limit", "over_request_rate_limit"].includes(error.code ?? "")) {
        return "Too many reset requests. Please wait a little and try again.";
      }
      return "We couldn’t request a reset email. Please try again later.";
    }
    return null;
  } catch { return "We couldn’t request a reset email. Check your connection and try again."; }
}

export async function updateRecoveryPassword(client: SupabaseClient, userId: string, password: string, confirmation: string) {
  const invalid = passwordValidation(password, confirmation);
  if (invalid) return invalid;
  try {
    return await withDeadline((async () => {
      const { data, error } = await client.auth.getUser();
      if (error || data.user?.id !== userId) return resetLinkMessage;
      const result = await client.auth.updateUser({ password });
      if (result.error) return "We couldn’t change your password. Use a new, stronger password or request another reset email.";
      return null;
    })());
  } catch { return "We couldn’t confirm the password change. Try logging in with your new password, or request another reset email."; }
}

export async function endRecoverySession(client: SupabaseClient): Promise<boolean> {
  try { return !(await withDeadline(client.auth.signOut({ scope: "local" }))).error; }
  catch { return false; }
}
