import { withDeadline } from "./accountRecovery";

export type SignupToken = { token_hash: string; type: "email" };

// Never accept verification actions, redirect destinations or nested URLs from a link.
export function parseSignupToken(fragment: string): SignupToken | null {
  if (!fragment.startsWith("#") || fragment.length > 1024) return null;
  const params = new URLSearchParams(fragment.slice(1));
  if ([...params.keys()].some(key => !["token_hash", "type"].includes(key)) ||
      params.getAll("token_hash").length !== 1 || params.getAll("type").length !== 1 ||
      params.get("type") !== "email") return null;
  const token = params.get("token_hash") ?? "";
  if (!/^[a-zA-Z0-9_-]{20,512}$/.test(token)) return null;
  return { token_hash: token, type: "email" };
}

type VerificationResult = { error: unknown; data: { session: { access_token: string } | null } };
type Verify = (token: SignupToken) => Promise<VerificationResult>;
export async function confirmSignupToken(token: SignupToken, verify: Verify, timeoutMs = 15000): Promise<boolean> {
  try {
    const result = await withDeadline(verify(token), timeoutMs);
    // Supabase verifyOtp saves the browser session before returning this result.
    return !result.error && !!result.data.session?.access_token;
  } catch {
    // Never expose SDK errors, request bodies, or the token.
    return false;
  }
}
