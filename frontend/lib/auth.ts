import type { SupabaseClient } from "@supabase/supabase-js";
import { InvalidSessionError, withDeadline } from "./accountRecovery";

const defaultClient = async () => (await import("./supabase")).supabase;

export function createAuthHelpers(getClient: () => Promise<SupabaseClient> = defaultClient) {
  function check(error: { code?: string; message: string; name?: string } | null) {
    if (!error) return;
    if (error.name === "AuthSessionMissingError" ||
        ["session_not_found", "session_expired", "refresh_token_not_found", "refresh_token_already_used", "bad_jwt", "user_not_found", "user_banned"].includes(error.code ?? "")) {
      throw new InvalidSessionError("Your session has ended. Please sign in again.");
    }
    throw new Error(error.message);
  }
  return {
    signUp: (email: string, password: string) => withDeadline((async () => {
      const result = await (await getClient()).auth.signUp({ email, password });
      check(result.error);
      return result;
    })()),
    signIn: (email: string, password: string) => withDeadline((async () => {
      const result = await (await getClient()).auth.signInWithPassword({ email, password });
      check(result.error);
      return result;
    })()),
    signOut: () => withDeadline((async () => {
      const { error } = await (await getClient()).auth.signOut();
      check(error);
    })()),
    getCurrentUser: () => withDeadline((async () => {
      const client = await getClient();
      const session = await client.auth.getSession();
      check(session.error);
      if (!session.data.session) return null;
      const result = await client.auth.getUser();
      check(result.error);
      if (!result.data.user) throw new InvalidSessionError();
      return result.data.user;
    })()),
    getAccessToken: (userId: string, refresh = false) => withDeadline((async () => {
      const client = await getClient();
      const result = refresh ? await client.auth.refreshSession() : await client.auth.getSession();
      check(result.error);
      const session = result.data.session;
      if (!session || session.user.id !== userId) throw new InvalidSessionError();
      return session.access_token;
    })()),
  };
}

export const { signUp, signIn, signOut, getCurrentUser, getAccessToken } = createAuthHelpers();
