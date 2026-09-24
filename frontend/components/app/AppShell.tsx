"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Logo from "@/components/Logo";
import { destinations, type Destination } from "@/lib/appNavigation";

function NavIcon({ name }: { name: Destination }) {
  const paths: Record<Destination, ReactNode> = {
    home: <><path d="m3 10 9-7 9 7v10H3Z" /><path d="M9 20v-7h6v7" /></>,
    portfolio: <><rect x="3" y="7" width="18" height="14" rx="3" /><path d="M8 7V4h8v3M3 12h18m-11 0v3h4v-3" /></>,
    ask: <><path d="M20 15a3 3 0 0 1-3 3H9l-5 3V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3Z" /><path d="M8 8h8m-8 5h5" /></>,
    settings: <><path d="m9 3-.5 3-2 1.2-2.8-1-2 3.5L4 12l-2.3 2.3 2 3.5 2.8-1 2 1.2.5 3h6l.5-3 2-1.2 2.8 1 2-3.5L20 12l2.3-2.3-2-3.5-2.8 1-2-1.2L15 3Z" /><circle cx="12" cy="12" r="3" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">{paths[name]}</svg>;
}

type Props = {
  active: Destination;
  name: string;
  children?: ReactNode;
  onSignOut: () => void;
  signingOut: boolean;
  logoutError: string;
};

export default function AppShell({ active, name, children, onSignOut, signingOut, logoutError }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  const previous = useRef(active);
  const destination = destinations.find(item => item.id === active);
  useEffect(() => {
    if (previous.current !== active) {
      heading.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "instant" });
    }
    previous.current = active;
  }, [active]);
  const signOut = <button type="button" onClick={onSignOut} disabled={signingOut} className="min-h-11 w-full rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">{signingOut ? "Signing out…" : "Sign out"}</button>;
  return (
    <div className="app-shell min-h-screen bg-background text-foreground">
      <a href="#app-content" onClick={event => { event.preventDefault(); document.getElementById("app-content")?.focus(); }} className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:p-4">Skip to content</a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-slate-200/70 bg-white p-6 lg:flex">
        <a href="#home" aria-label="Arbor Home"><Logo /></a>
        <nav aria-label="Primary navigation" className="mt-12 space-y-2">
          {destinations.map(item => <a key={item.id} href={`#${item.id}`} aria-current={active === item.id ? "page" : undefined} className={`flex min-h-12 items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${active === item.id ? "bg-forest text-white" : "text-slate-600 hover:bg-slate-50 hover:text-forest"}`}><NavIcon name={item.id} />{item.label}</a>)}
        </nav>
        <div className="mt-auto space-y-3 pt-8">
          <a href="#settings" className="account-chip"><span aria-hidden="true">{name.trim().slice(0,1).toUpperCase()}</span><div>{name.trim().split(/\s+/)[0]}<small>Account &amp; preferences</small></div></a>
        </div>
      </aside>
      <div className="lg:pl-60">
        <header className="flex min-h-16 items-center justify-between border-b border-slate-200/70 bg-white px-4 sm:px-6 lg:hidden">
          <a href="#home" aria-label="Arbor Home"><Logo /></a>
        </header>
        <main id="app-content" tabIndex={-1} className="mx-auto w-full min-w-0 max-w-6xl px-4 pt-7 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-8 lg:px-10 lg:py-10">
          <header className="mb-7 flex min-w-0 flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 ref={heading} tabIndex={-1} className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 outline-none sm:text-4xl">{active === "home" ? `Hello, ${name.trim().split(/\s+/)[0] || "there"}.` : destination?.label ?? "Settings"}</h1>
              <p className="mt-2 text-sm text-slate-500">{{home:"A little clarity. A longer view.",portfolio:"Your investments, in perspective.",ask:"Your Arbor investment companion.",settings:"Make Arbor feel like yours."}[active]}</p>
            </div>
          </header>
          {logoutError && <p role="alert" className="mb-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">{logoutError}</p>}
          {children}
          {active === "settings" && <section className="mt-6 max-w-2xl"><h2 className="mb-3 text-lg font-semibold">Account &amp; security</h2>{signOut}</section>}
        </main>
      </div>
      <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-slate-200 bg-white/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-sm lg:hidden">
        {destinations.map(item => <a key={item.id} href={`#${item.id}`} aria-label={item.label} aria-current={active === item.id ? "page" : undefined} className={`flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-xs font-medium ${active === item.id ? "bg-sage-soft text-forest" : "text-slate-500"}`}><NavIcon name={item.id} />{item.mobileLabel}</a>)}
      </nav>
    </div>
  );
}
