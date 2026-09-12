import type { Plan } from "./types/plan";

export class InvalidSessionError extends Error {}

// Only the identity and access token are needed; never store tokens in UI state.
export type AccountSession = {
  user: { id: string };
  access_token: string;
};

export function withDeadline<T>(operation: Promise<T>, milliseconds = 15000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Account recovery timed out. Please retry.")), milliseconds);
    operation.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

export type AccountState =
  | { status: "checking" }
  | { status: "unauthenticated" }
  | { status: "ready"; userId: string; plan: Plan }
  | { status: "no-profile"; userId: string }
  | { status: "error"; message: string };

type Dependencies = {
  getUser: () => Promise<{ id: string } | null>;
  getProfile: (userId: string, accessToken?: string) => Promise<Plan | null>;
  onState: (state: AccountState) => void;
  onIdentityChange: () => void;
  timeoutMs?: number;
};

export function createAccountRecovery(deps: Dependencies) {
  // Every new attempt/account invalidates results still arriving from older work.
  let generation = 0;
  let identity: string | null | undefined;
  let restoringUserId: string | undefined;
  let state: AccountState = { status: "checking" };
  function publish(next: AccountState) {
    state = next;
    deps.onState(next);
  }
  function setIdentity(next: string | null) {
    if (identity !== next) {
      identity = next;
      deps.onIdentityChange();
    }
  }
  async function restore(knownSession?: AccountSession) {
    const attempt = ++generation;
    restoringUserId = knownSession?.user.id;
    publish({ status: "checking" });
    try {
      const result = await withDeadline((async (): Promise<AccountState> => {
        // A successful auth event already supplies the user. Do not replace that
        // newer evidence with another potentially stale initial session lookup.
        // Awaiting here also keeps profile/SDK work outside the auth callback.
        const user = await (knownSession?.user ?? deps.getUser());
        if (attempt !== generation) return { status: "checking" };
        setIdentity(user?.id ?? null);
        if (!user) return { status: "unauthenticated" };
        const plan = await deps.getProfile(user.id, knownSession?.access_token);
        return plan ? { status: "ready", userId: user.id, plan } : { status: "no-profile", userId: user.id };
      })(), deps.timeoutMs);
      if (attempt === generation) publish(result);
    } catch (error) {
      if (attempt !== generation) return;
      generation++;
      if (error instanceof InvalidSessionError) {
        setIdentity(null);
        publish({ status: "unauthenticated" });
      } else {
        publish({ status: "error", message: "We couldn’t restore your account. Please check your connection and try again." });
      }
    }
  }
  function authenticated(session: AccountSession) {
    const userId = session.user.id;
    if (identity === userId &&
        ((state.status === "checking" && restoringUserId === userId) ||
          state.status === "ready" || state.status === "no-profile")) {
      return Promise.resolve();
    }
    setIdentity(userId);
    return restore(session);
  }
  function signedOut() {
    generation++;
    setIdentity(null);
    publish({ status: "unauthenticated" });
  }
  return {
    restore,
    authenticated,
    authChanged(event: string, session: AccountSession | null) {
      // Startup owns the initial lookup. A delayed INITIAL_SESSION must never
      // replace a newer explicit sign-in or sign-out.
      if (event === "INITIAL_SESSION") return;
      if (event === "SIGNED_OUT") {
        signedOut();
      } else if (session) {
        return authenticated(session);
      }
    },
    guard() {
      const attempt = generation;
      return () => attempt === generation;
    },
    signedOut,
    identityChanged(userId: string | null) {
      if (identity === userId) return false;
      generation++;
      restoringUserId = undefined;
      setIdentity(userId);
      publish(userId ? { status: "checking" } : { status: "unauthenticated" });
      return true;
    },
    completeProfile(userId: string, plan: Plan) {
      if (identity === userId && state.status === "no-profile") publish({ status: "ready", userId, plan });
    },
    dispose() { generation++; },
  };
}
