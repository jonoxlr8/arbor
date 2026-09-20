"use client";

import { useEffect, useRef, useState } from "react";
import Logo from "@/components/Logo";
import Card from "@/components/Card";
import PublicEntry from "@/components/entry/PublicEntry";
import { getAccountProfile } from "@/lib/profileV2Api";
import type { AccountPlan } from "@/lib/types/planV2";
import { isPlanV2 } from "@/lib/planV2";
import OnboardingV2 from "@/components/OnboardingV2";
import PlanV2View from "@/components/PlanV2View";
import { getCurrentUser, signOut } from "@/lib/auth";
import ResultsDashboard from "@/components/ResultsDashboard";
import { createAccountRecovery, type AccountState } from "@/lib/accountRecovery";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const [account, setAccount] = useState<AccountState<AccountPlan>>({ status: "checking" });
  const recovery = useRef<ReturnType<typeof createAccountRecovery<AccountPlan>> | null>(null);
  const [logoutError, setLogoutError] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const coordinator = createAccountRecovery<AccountPlan>({
      getUser: getCurrentUser,
      getProfile: getAccountProfile,
      onState: setAccount,
      onIdentityChange: () => {
        setLogoutError("");
      },
    });
    recovery.current = coordinator;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Do not return/await SDK work inside Supabase's notification callback.
      void coordinator.authChanged(event, session);
    });
    void coordinator.restore();
    return () => {
      subscription.unsubscribe();
      coordinator.dispose();
      recovery.current = null;
    };
  }, []);

  const handleSignOut = async () => {
    setSigningOut(true);
    setLogoutError("");
    try {
      await signOut();
      recovery.current?.signedOut();
    } catch {
      setLogoutError("We couldn’t sign you out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  };

  if (account.status === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6">
        <Card>
          <Logo />
          <h1 className="mt-8 text-2xl font-bold text-slate-900">Let’s reconnect your account</h1>
          <p role="alert" className="mt-4 text-slate-600">{account.message}</p>
          {logoutError && <p role="alert" className="mt-4 text-red-700">{logoutError}</p>}
          <div className="mt-6 flex gap-4">
            <button disabled={signingOut} onClick={() => void recovery.current?.restore()} className="rounded-xl bg-emerald-700 px-5 py-3 text-white">Retry</button>
            <button disabled={signingOut} onClick={handleSignOut} className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60">{signingOut ? "Signing out…" : "Sign out"}</button>
          </div>
        </Card>
      </main>
    );
  }

  if (account.status === "checking") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6">
        <Card>
          <Logo />

          <div className="mt-12 text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-green-200 border-t-green-600" />

            <p className="mt-6 text-slate-600">Loading Arbor...</p>
          </div>
        </Card>
      </main>
    );
  }

  if (account.status === "unauthenticated") {
    return <PublicEntry onAuthenticated={(session) => void recovery.current?.authenticated(session)} />;
  }

  if (account.status === "ready") {
    if (isPlanV2(account.plan)) return <PlanV2View value={account.plan} onSignOut={handleSignOut} signingOut={signingOut} logoutError={logoutError} />;
    return <ResultsDashboard key={account.userId} plan={account.plan} onSignOut={handleSignOut} signingOut={signingOut} logoutError={logoutError} />;
  }

  return <OnboardingV2 key={account.userId} userId={account.userId}
    onComplete={plan => recovery.current?.completeProfile(account.userId, plan)}
    onSignOut={handleSignOut} signingOut={signingOut} logoutError={logoutError} />;
}
