"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import Logo from "@/components/Logo";
import AuthForm from "@/components/AuthForm";
import PublicWebsite from "./PublicWebsite";
import { AppearanceSelect } from "@/components/app/Appearance";
import type { AccountSession } from "@/lib/accountRecovery";
import { subscribeNavigation } from "@/lib/appNavigation";
import { entryLinks, entrySnapshot, serverEntrySnapshot, confirmationFailureSnapshot, type EntryScreen } from "@/lib/publicEntry";

type Props = { onAuthenticated: (session: AccountSession) => void };
export default function PublicEntry(props: Props) {
  const screen = useSyncExternalStore(subscribeNavigation, entrySnapshot, serverEntrySnapshot);
  const confirmationFailed = useSyncExternalStore(subscribeNavigation, confirmationFailureSnapshot, () => false);
  return <>{confirmationFailed && <p role="status" className="text-center text-sm text-slate-600">This confirmation link is invalid or has expired. Try logging in if you already confirmed, or request another confirmation email below.</p>}<EntryView screen={screen} {...props} /></>;
}

export function EntryView({ screen, onAuthenticated }: Props & { screen: EntryScreen }) {
  const main = useRef<HTMLElement>(null);
  const previous = useRef(screen);
  useEffect(() => {
    if (previous.current !== screen) {
      main.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "instant" });
    }
    previous.current = screen;
  }, [screen]);
  if (screen === "landing") return <PublicWebsite />;
  return <div className="public-entry public-auth min-h-dvh bg-background text-foreground">
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-5 sm:px-8 sm:py-7">
      <a href={entryLinks.landing} aria-label="Arbor welcome"><Logo /></a>
      <a href={entryLinks.landing} className="entry-link"><span aria-hidden="true">←</span> Back</a>
    </header>
    <main ref={main} tabIndex={-1} className="mx-auto w-full max-w-6xl px-5 py-5 pb-8 outline-none sm:px-8 sm:py-10">
      <AuthForm key={screen} mode={screen} onAuthenticated={onAuthenticated} />
    </main>
    <footer className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-xs leading-5 text-slate-500 sm:px-8"><p className="max-w-md">Arbor helps you plan and learn. It does not purchase, custody or execute investments.</p><AppearanceSelect /></footer>
  </div>;
}
