"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import Logo, { ArborMark } from "@/components/Logo";
import AuthForm from "@/components/AuthForm";
import { AppearanceSelect } from "@/components/app/Appearance";
import type { AccountSession } from "@/lib/accountRecovery";
import { subscribeNavigation } from "@/lib/appNavigation";
import { entryLinks, entrySnapshot, serverEntrySnapshot, type EntryScreen } from "@/lib/publicEntry";

type Props = { onAuthenticated: (session: AccountSession) => void };
export default function PublicEntry(props: Props) {
  const screen = useSyncExternalStore(subscribeNavigation, entrySnapshot, serverEntrySnapshot);
  return <EntryView screen={screen} {...props} />;
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
  const landing = screen === "landing";
  const back = screen === "signup" || screen === "other-country" ? entryLinks.country : entryLinks.landing;
  return <div className="public-entry min-h-dvh bg-background text-foreground">
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-5 sm:px-8 sm:py-7">
      <a href={entryLinks.landing} aria-label="Arbor welcome"><Logo /></a>
      {landing ? <a href={entryLinks.login} className="entry-link">Log in <span aria-hidden="true">↗</span></a> : <a href={back} className="entry-link"><span aria-hidden="true">←</span> Back</a>}
    </header>
    <main ref={main} tabIndex={-1} className={`mx-auto w-full max-w-6xl px-5 pb-8 outline-none sm:px-8 ${landing ? "pt-5 sm:pt-10" : "py-5 sm:py-10"}`}>
      {landing ? <>
        <div className="entry-hero grid gap-8 rounded-[2rem] p-6 sm:p-10 lg:grid-cols-[1.2fr_1fr] lg:items-center lg:gap-12 lg:p-12">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-forest">A longer view. A clearer plan.</p>
            <h1 className="mt-5 text-[2.6rem] leading-[1.08] font-semibold tracking-tight text-slate-900 sm:text-6xl">Build wealth.<br />Grow with Arbor.</h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-slate-600 sm:text-lg">A simple investment companion that helps you build a long-term plan, understand what to invest in, and stay on track.</p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <a href={entryLinks.country} className="entry-primary">Get started <span aria-hidden="true">→</span></a>
              <a href={entryLinks.login} className="entry-secondary">Log in</a>
            </div>
            <p className="mt-5 max-w-sm text-xs leading-5 text-slate-500">Educational guidance. Your investments stay with your chosen provider.</p>
          </div>
          <div className="entry-garden relative flex min-h-44 items-center justify-center overflow-hidden rounded-[1.5rem] border border-emerald-200 p-6 lg:min-h-96" aria-hidden="true">
            <div className="entry-orbit absolute h-64 w-64 rounded-full border lg:h-80 lg:w-80" />
            <div className="entry-orbit absolute h-44 w-44 rounded-full border lg:h-60 lg:w-60" />
            <div className="relative flex h-24 w-32 items-center justify-center lg:h-32 lg:w-44"><ArborMark className="h-24 w-32 lg:h-32 lg:w-44" /></div>
            <span className="absolute right-5 bottom-4 text-xs font-medium text-forest">Rooted in the long term.</span>
          </div>
        </div>
        <div className="mt-7 grid gap-5 sm:mt-10 sm:grid-cols-3 sm:gap-8">
          {[['01', 'Make a plan', 'Turn your goals into a long-term starting point.'], ['02', 'Understand your targets', 'Get clear explanations of your Arbor plan.'], ['03', 'Keep perspective', 'Explore scenarios and review recorded holdings.']].map(([number, title, copy]) => <section key={number} className="flex gap-4 border-t border-slate-200 pt-4"><span className="pt-1 text-xs font-medium text-forest">{number}</span><div><h2 className="font-semibold text-slate-900">{title}</h2><p className="mt-1 text-sm leading-6 text-slate-500">{copy}</p></div></section>)}
        </div>
      </> : screen === "login" || screen === "signup" ? <AuthForm key={screen} mode={screen} onAuthenticated={onAuthenticated} /> : <section className="arbor-panel mx-auto max-w-lg">
        <p className="text-xs font-semibold uppercase tracking-wider text-forest">{screen === "country" ? "Let’s get acquainted" : "Growing thoughtfully"}</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">{screen === "country" ? "Where do you live?" : "Philippines first. More to come."}</h1>
        {screen === "country" ? <>
          <p className="mt-4 text-sm leading-6 text-slate-600">Your country sets your planning currency. Arbor is launching in the Philippines first; model investments are not country-specific.</p>
          <div className="mt-7 space-y-3">
            <a href={entryLinks.signup} className="entry-country"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sage-soft text-sm font-semibold text-forest" aria-hidden="true">PH</span><span className="min-w-0"><span className="block font-semibold text-slate-900">Philippines</span><span className="mt-1 block text-sm text-slate-500">PHP · Philippines launch</span></span><span className="ml-auto text-forest" aria-hidden="true">→</span></a>
            <a href={entryLinks['other-country']} className="entry-country"><span className="min-w-0"><span className="block font-semibold text-slate-900">Other country</span><span className="mt-1 block text-sm leading-5 text-slate-500">Arbor is currently launching in the Philippines.</span></span><span className="ml-auto text-forest" aria-hidden="true">→</span></a>
          </div>
          <p className="mt-6 text-xs leading-5 text-slate-500">Already have an Arbor account? <a href={entryLinks.login} className="entry-link inline-flex">Log in</a></p>
        </> : <>
          <p className="mt-4 text-base leading-7 text-slate-600">Arbor is launching in the Philippines first. Signup isn’t available for other countries yet. We look forward to growing with more communities over time.</p>
          <a href={entryLinks.country} className="entry-secondary mt-7">Back to country selection</a>
          <a href={entryLinks.login} className="entry-link mt-3 flex justify-center">Already have an account? Log in</a>
        </>}
      </section>}
    </main>
    <footer className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-xs leading-5 text-slate-500 sm:px-8"><p className="max-w-md">Arbor helps you plan and learn. It does not purchase, custody or execute investments.</p><AppearanceSelect /></footer>
  </div>;
}
