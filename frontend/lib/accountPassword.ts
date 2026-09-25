import type { SupabaseClient } from "@supabase/supabase-js";
import { withDeadline } from "./accountRecovery";
import { passwordValidation } from "./passwordRecovery";

export async function changeAccountPassword(client: SupabaseClient, owner: string, password: string, confirmation: string) {
  const invalid = passwordValidation(password, confirmation);
  if (invalid) return invalid;
  try {
    return await withDeadline((async () => {
      const verified = await client.auth.getUser();
      if (verified.error || verified.data.user?.id !== owner) return "Sign in again before changing your password.";
      const result = await client.auth.updateUser({password});
      if (result.error) return "We couldn’t update your password. Try a stronger password, or use a secure reset link to verify your account again.";
      return null;
    })());
  } catch { return "We couldn’t confirm the change. Try signing in with your new password, or request a reset link."; }
}
