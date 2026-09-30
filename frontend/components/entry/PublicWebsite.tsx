"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Logo, { ArborMark } from "@/components/Logo";
import ArborIdentityIcon from "@/components/ArborIdentityIcon";
import { AppearanceSelect } from "@/components/app/Appearance";
import { entryLinks } from "@/lib/publicEntry";
import { publicFaqs, publicSections } from "@/lib/publicWebsite";

function StartLink() {
  return <a className="m-button" href={entryLinks.signup}>Get started <span aria-hidden="true">↗</span></a>;
}
function DemoImage({ name, width, height, alt, priority = false, sizes = "(max-width: 768px) 90vw, 1120px" }: {
  name: string; width: number; height: number; alt: string; priority?: boolean; sizes?: string;
}) {
  // Small local PNGs stay crisp; the release key refreshes updated public captures.
  return <Image unoptimized src={`/product/v3-demo/${name}.png?v=3a28f3c`} width={width} height={height} alt={alt} sizes={sizes}
    loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : undefined} />;
}
export default function PublicWebsite() {
  const [menu, setMenu] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const header = useRef<HTMLElement>(null);
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (publicSections.some(([section]) => section === id) || id === "disclosures") document.getElementById(id)?.scrollIntoView();
  }, []);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!header.current?.contains(event.target as Node)) setMenu(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  useEffect(() => {
    if (menu) header.current?.querySelector<HTMLAnchorElement>("#public-navigation a")?.focus();
  }, [menu]);
  return <div className="marketing-site" onKeyDown={event => {
    if (event.key === "Escape" && menu) { setMenu(false); menuButton.current?.focus(); }
  }}>
    <a className="m-skip" href="#public-content">Skip to content</a>
    <header ref={header} className="m-header"><div className="m-nav-wrap">
      <a className="m-logo" href={entryLinks.landing} aria-label="Arbor welcome"><Logo /></a>
      <nav id="public-navigation" className="m-navigation" data-open={menu} aria-label="Public navigation">
        {publicSections.map(([id, label]) => <a key={id} href={`#${id}`} onClick={() => setMenu(false)}>{label}</a>)}
        <a className="m-mobile-signin" href={entryLinks.login} onClick={() => setMenu(false)}>Sign in</a>
      </nav>
      <div className="m-nav-actions"><a className="m-signin" href={entryLinks.login}>Sign in</a><StartLink />
        <button ref={menuButton} type="button" className="m-menu" aria-label={menu ? "Close menu" : "Open menu"} aria-controls="public-navigation" aria-expanded={menu} onClick={() => setMenu(!menu)}><span /><span /></button>
      </div>
    </div></header>
    <main id="public-content" tabIndex={-1}>
      <section className="m-hero" aria-labelledby="hero-title"><div className="m-container m-hero-copy">
        <p className="m-eyebrow"><span className="m-leaf-dot" /> Your investment companion</p>
        <h1 id="hero-title">Invest with a plan<br /><span>you understand.</span></h1>
        <p className="m-lead">Choose your investment approach, track what you own, and plan your next contribution—all in one clear view.</p>
        <div className="m-actions"><StartLink /><a className="m-text-link" href="#how-it-works">See how Arbor works <span aria-hidden="true">↓</span></a></div>
        <p className="m-fine">Philippines-first · Private beta · Plus trial included</p>
      </div><figure className="m-hero-product m-container">
        <div className="m-browser m-hero-desktop"><DemoImage name="home-desktop" width={1440} height={1000} priority alt="Arbor Home: a portfolio chart, goal, monthly contribution and selected investment plan. Illustrative demo." /></div>
        <div className="m-hero-phone"><DemoImage name="home-mobile" width={390} height={850} priority sizes="(max-width: 600px) 84vw, 250px" alt="Arbor Home on mobile with illustrative portfolio history and goal progress." /></div>
        <figcaption>Illustrative demo—not actual investment performance.</figcaption>
      </figure></section>
      <section id="how-it-works" className="m-container m-section" aria-labelledby="works-title">
        <div className="m-heading-row"><div><p className="m-eyebrow">From wondering to knowing</p><h2 id="works-title">A little clarity.<br />A way forward.</h2></div><p className="m-section-lead">You invest through your provider. Arbor helps you plan, track, and understand.</p></div>
        <ol className="m-journey"><li><span className="m-step-number">01</span><h3>Choose your approach</h3><p>Start with your goal, timeline and preferences. Compare simple approaches and choose the plan that fits you.</p></li><li><span className="m-step-number">02</span><h3>Invest with your provider</h3><p>Explore supported Ways to invest, then continue with the provider you choose. Your money stays with them.</p></li><li><span className="m-step-number">03</span><h3>Track and keep going</h3><p>Record what you actually invested. Follow your progress, understand the numbers and plan your next contribution.</p></li></ol>
      </section>
      <section id="features" className="m-history m-section" aria-labelledby="features-title"><div className="m-container">
        <div className="m-heading-row"><div><p className="m-eyebrow">Your portfolio, in perspective</p><h2 id="features-title">See your journey.<br />Understand your progress.</h2></div><div><p className="m-section-lead">Follow how your recorded portfolio has changed over time. Explore a week, a month or the whole journey in PHP or USD.</p><p className="m-history-note">Contributions stay separate from investment gain.</p></div></div>
        <figure className="m-history-visual"><div className="m-history-desktop"><DemoImage name="portfolio-history" width={1176} height={459} alt="The current Arbor Portfolio chart with rounded steps, PHP and USD views, and 1W, 1M, 3M, 6M, 1Y, 5Y and All ranges. Illustrative values." /></div><div className="m-history-mobile"><DemoImage name="portfolio-mobile" width={390} height={850} alt="Arbor Portfolio on mobile showing selected-period gain and the seven current history ranges, with illustrative data." /></div><figcaption>Illustrative demo—not actual investment performance.</figcaption></figure>
        <ul className="m-history-details"><li><span>01</span><strong>Your timeframe</strong><p>1W · 1M · 3M · 6M · 1Y · 5Y · All</p></li><li><span>02</span><strong>Your perspective</strong><p>PHP or USD portfolio view</p></li><li><span>03</span><strong>Your actual progress</strong><p>Gain/loss for the selected period</p></li></ul>
      </div></section>
      <section id="arbor-plus" className="m-container m-section m-next" aria-labelledby="next-title">
        <div className="m-next-copy"><p className="m-eyebrow">Arbor Plus · Monthly planning</p><h2 id="next-title">Make the next<br />contribution easier.</h2><p className="m-section-lead">See how your next contribution fits the plan you chose.</p><p>Arbor can calculate a contribution breakdown based on the plan you chose. Review it, choose whether to follow it, and invest through your provider.</p><div className="m-next-flow"><span>Plan</span><span aria-hidden="true">→</span><span>Invest</span><span aria-hidden="true">→</span><span>Record</span></div><p className="m-fine">Invest with your provider, then return to Arbor to record what you bought.</p></div>
        <div className="m-monthly-visuals"><figure className="m-monthly-primary"><div className="m-monthly-desktop"><DemoImage name="monthly-desktop" width={760} height={773} sizes="(max-width: 900px) 90vw, 650px" alt="Actual Arbor Monthly planning result: a PHP 15,000 contribution calculated from the illustrative portfolio and chosen 80/10/10 plan." /></div><div className="m-monthly-mobile"><DemoImage name="monthly-mobile" width={358} height={905} alt="Arbor Monthly breakdown showing the calculated amounts for the illustrative PHP 15,000 contribution." /></div><figcaption>Illustrative demo—not actual investment performance.</figcaption></figure><figure className="m-ways-visual"><DemoImage name="ways-detail" width={326} height={144} alt="Ways to invest continuation: the chosen VGT investment through Gotrade. Provider eligibility and terms apply." /><figcaption>Then choose your provider path.</figcaption></figure></div>
        <div className="m-plus-details"><p><strong>A plan that stays understandable.</strong> Compare your portfolio with your selected targets through Plan Alignment.</p><p><strong>A longer view.</strong> Explore Projection &amp; What If illustrations using your assumptions.</p><p className="m-fine">Private-beta members currently receive an Arbor Plus trial. Subscription checkout is not available yet.</p></div>
      </section>
      <section id="learn" className="m-learning m-section" aria-labelledby="learn-title"><div className="m-container m-learning-layout"><div><p className="m-eyebrow">Learn + Ask Arbor</p><h2 id="learn-title">Build confidence.<br />One question at a time.</h2><p className="m-section-lead">Short lessons and plain-language explanations, right alongside your plan.</p><p>Learn lives inside Ask Arbor. Explore a lesson or ask what a number in your plan means.</p><p className="m-fine">AI explanations can be mistaken. Your investment decisions stay yours.</p></div><div className="m-learning-panel"><p className="m-learning-label">Illustrative lesson preview</p><ul className="m-learning-categories">{([
        ["Basics", "facets"], ["ETFs", "globe"], ["Funds", "layers"], ["Crypto", "coin"], ["Arbor", null],
      ] as const).map(([name, glyph]) => <li key={name}><span className={`m-category-mark m-category-${name.toLowerCase()}`} aria-hidden="true">{glyph ? <ArborIdentityIcon glyph={glyph} /> : <ArborMark />}</span><span>{name}</span></li>)}</ul><p className="m-question">“What’s the difference between<br />portfolio value and investment gain?”</p><p className="m-answer">Portfolio value is what your recorded investments are worth, using available reference values. Adding money can increase that value without creating investment profit.</p><p className="m-fine">Based on Learn: Recorded cost and gain/loss.</p></div></div></section>
      <section className="m-container m-section m-trust" aria-labelledby="trust-title"><p className="m-eyebrow">Clarity, without giving up control</p><h2 id="trust-title">Your choices. Your money.</h2><div className="m-trust-points"><article><ArborIdentityIcon glyph="facets" /><h3>You stay in control</h3><p>Arbor does not hold your money or place trades. You choose your plan and where to invest.</p></article><article><ArborIdentityIcon glyph="layers" /><h3>Your records matter</h3><p>What you paid stays separate from reference market values. Missing information is shown honestly.</p></article><article><ArborIdentityIcon glyph="globe" /><h3>Built for the long term</h3><p>Keep perspective over years. No trading signals, rankings or promises of returns.</p></article></div><div className="m-supported"><p className="m-fine">A curated set of US ETFs, ATRAM and BPI funds, and Bitcoin through</p><p>GFunds <span>·</span> Gotrade <span>·</span> DragonFi <span>·</span> GCrypto <span>·</span> Coins.ph <span>·</span> PDAX</p><p className="m-fine">Provider names identify supported paths. No partnership or endorsement is implied.</p></div></section>
      <section id="faq" className="m-container m-section m-faq" aria-labelledby="faq-title"><div><p className="m-eyebrow">Before you begin</p><h2 id="faq-title">A few good<br />questions.</h2><p>Something else on your mind?<br /><a href="mailto:support@arbor.ph">Talk to us ↗</a></p></div><div>{publicFaqs.map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div></section>
      <section className="m-final m-section"><div className="m-container"><ArborMark /><p className="m-eyebrow">A clearer next step</p><h2>Start with understanding.<br /><span>Keep going with a plan.</span></h2><p>Join the private beta. Keep the decisions yours.</p><StartLink /><a className="m-final-signin" href={entryLinks.login}>Already a member? Sign in</a></div></section>
    </main>
    <footer className="m-footer"><div className="m-container"><div className="m-footer-top"><div><Logo /><p>Investing, made easier to understand.</p></div><nav aria-label="Footer product"><h2>Explore</h2>{publicSections.map(([id,label]) => <a key={id} href={`#${id}`}>{label}</a>)}</nav><nav aria-label="Footer support"><h2>Support</h2><a href="mailto:support@arbor.ph">support@arbor.ph</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/investment-disclosures">Investment disclosures</a><a href={entryLinks.login}>Sign in</a></nav><div className="m-footer-appearance"><AppearanceSelect /></div></div><details id="disclosures" className="m-disclosures"><summary>Investment information</summary><p>Arbor is an investment planning, tracking and education companion. It is not a broker, bank, custodian or exchange. You make your own investment decisions. Investing involves risk; returns are not guaranteed. Planning illustrations are hypothetical and reference values may be delayed or unavailable.</p><p>Provider and investment names are shown for identification only. No affiliation, sponsorship or endorsement is implied.</p></details><div className="m-footer-bottom"><p>© {new Date().getFullYear()} Arbor</p><p>You choose. Arbor calculates, tracks and explains.</p></div></div></footer>
  </div>;
}
