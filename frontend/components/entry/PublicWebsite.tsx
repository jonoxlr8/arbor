"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Logo, { ArborMark } from "@/components/Logo";
import ProviderIdentity from "@/components/ProviderIdentity";
import InvestmentIdentity from "@/components/InvestmentIdentity";
import { investmentIdentity, providerName } from "@/lib/investmentIdentity";
import { PLAN_OPTIONS, providerDestination } from "@/lib/planImplementation";
import { AppearanceSelect } from "@/components/app/Appearance";
import { entryLinks } from "@/lib/publicEntry";
import { publicFaqs, publicSections } from "@/lib/publicWebsite";
import imageSizes from "@/public/product/premium/sizes.json";

function Arrow() { return <span aria-hidden="true">↗</span>; }
function StartLink({ children = "Get started free" }: { children?: React.ReactNode }) {
  return <a className="m-button" href={entryLinks.signup}>{children}<Arrow /></a>;
}
function ProductImage({ name, alt, hero = false }: { name: keyof typeof imageSizes; alt: string; hero?: boolean }) {
  const { width, height } = imageSizes[name];
  const mobile = imageSizes[`${name}-mobile` as keyof typeof imageSizes];
  const sizes = name === "fund-value" ? "(max-width: 600px) 260px, (max-width: 1100px) 245px, 290px" : name === "ask" ? "(max-width: 600px) 280px, (max-width: 900px) 290px, 330px" : "(max-width: 760px) 90vw, 650px";
  // Mobile crops are already compressed at their native 390px width. Serve the
  // exact WebP instead of upscaling it through a second optimizer/srcset.
  return <picture>{mobile && <source media="(max-width: 600px)" srcSet={`/product/premium/${name}-mobile.webp`} width={mobile.width} height={mobile.height}/>}
    <Image src={`/product/premium/${name}.webp`} width={width} height={height} alt={alt}
    sizes={hero || name === "portfolio" || name === "ways" ? "(max-width: 760px) 94vw, (max-width: 1280px) 90vw, 1120px" : sizes}
    loading={hero ? "eager" : "lazy"} fetchPriority={hero ? "high" : undefined} /></picture>;
}

export default function PublicWebsite() {
  const [menu, setMenu] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // Auth restoration can finish after the browser's initial fragment scroll.
    const id = window.location.hash.slice(1);
    if (publicSections.some(([section]) => section === id) || id === "disclosures") document.getElementById(id)?.scrollIntoView();
  }, []);
  return <div className="marketing-site" onKeyDown={event => {
    if (event.key === "Escape" && menu) { setMenu(false); menuButton.current?.focus(); }
  }}>
    <a className="m-skip" href="#public-content">Skip to content</a>
    <header className="m-header">
      <div className="m-nav-wrap">
        <a className="m-logo" href={entryLinks.landing} aria-label="Arbor welcome"><Logo /></a>
        <nav id="public-navigation" className="m-navigation" data-open={menu} aria-label="Public navigation">
          {publicSections.map(([id,label]) => <a key={id} href={`#${id}`} onClick={() => setMenu(false)}>{label}</a>)}
          <a className="m-mobile-signin" href={entryLinks.login} onClick={() => setMenu(false)}>Sign in</a>
        </nav>
        <div className="m-nav-actions"><a className="m-signin" href={entryLinks.login}>Sign in</a><StartLink />
          <button ref={menuButton} type="button" className="m-menu" aria-label={menu ? "Close menu" : "Open menu"} aria-controls="public-navigation" aria-expanded={menu} onClick={() => setMenu(!menu)}><span/ ><span/ ></button>
        </div>
      </div>
    </header>
    <main id="public-content" tabIndex={-1}>
      <section className="m-hero" aria-labelledby="hero-title">
        <div className="m-container m-hero-copy">
          <p className="m-eyebrow"><span className="m-leaf-dot"/> AI investment companion · Philippines-first</p>
          <h1 id="hero-title">Invest with clarity.<br/><span>Keep the longer view.</span></h1>
          <p className="m-lead">Choose your plan. See ways to put it into practice.<br className="m-desktop-break"/> Keep a clearer picture of what comes next.</p>
          <div className="m-actions"><StartLink/><a className="m-text-link" href="#how-it-works">See how Arbor works <span aria-hidden="true">↓</span></a></div>
          <p className="m-fine">Arbor Plus is free during private beta. No credit card.</p>
        </div>
        <figure className="m-hero-product m-container">
          <p className="m-preview-label">Inside Arbor <span>Product preview · Illustrative data</span></p>
          <div className="m-browser"><div className="m-browser-bar" aria-hidden="true"><span/><span/><span/><small>arbor.ph</small></div>
            <ProductImage name="home" hero alt="Arbor Home preview with one next step, a selected plan and an illustrative portfolio summary."/>
          </div>
          <figcaption>Actual Arbor interface · Illustrative data. Example history shows recorded values, not investment returns. Portfolio tracking and monthly check-ins are available in private beta.</figcaption>
        </figure>
      </section>

      <section id="how-it-works" className="m-container m-section m-approach" aria-labelledby="approach-title">
        <div><p className="m-eyebrow">Your choices. A clearer picture.</p><h2 id="approach-title">Your plan.<br/>Not a black box.</h2></div>
        <div className="m-approach-story"><p className="m-section-lead">Start with what matters to you. Compare standardized long-term approaches and choose one you understand.</p><p>Arbor helps you check your financial readiness and explore your assumptions. You make the choice—and stay in control.</p>
          <ol className="m-steps"><li><span>01</span><strong>Choose your approach</strong></li><li><span>02</span><strong>Make it your plan</strong></li><li><span>03</span><strong>See ways to invest</strong></li></ol>
        </div>
      </section>

      <section id="customize-plan" className="m-record m-section" aria-labelledby="customize-title"><div className="m-container m-record-layout">
        <div><p className="m-eyebrow">Your plan, your choice</p><h2 id="customize-title">Keep it simple.<br/>Or make it yours.</h2><p className="m-section-lead">Your core plan is complete as-is.</p><p>Choose None, 5% or 10% for extra Technology or Bitcoin exposure. Nothing is added for you.</p><p>Arbor calculates the final mix from your choices. You review it, then confirm your plan.</p><p className="m-note">Technology may overlap with your global investments. Bitcoin can have much larger price swings. Both are optional.</p></div>
        <figure className="m-phone"><ProductImage name="customize" alt="Arbor Customize your plan preview with separate None, 5% and 10% choices for Technology and Bitcoin, both explicitly chosen by the user."/><figcaption>Optional customization · Included in Free</figcaption></figure>
      </div><div className="m-container m-onboarding-sequence"><figure><ProductImage name="approaches" alt="Compare four standardized approaches. Nothing is selected for you."/><figcaption>01 · Choose your approach</figcaption></figure><figure><ProductImage name="final-plan" alt="Final plan review with the user’s explicit 80% Global Equity, 10% Technology and 10% Bitcoin example allocation."/><figcaption>02 · Review and make it your plan</figcaption></figure></div></section>

      <section id="product-portfolio" className="m-portfolio m-section" aria-labelledby="portfolio-title">
        <div className="m-container">
          <div className="m-section-heading"><p className="m-eyebrow">Your plan to your portfolio</p><h2 id="portfolio-title">Everything you own.<br/>One clearer view.</h2><p className="m-section-lead">Track your recorded investments and compare them with the targets you chose.<br/>Invest through your provider. Record what you own in Arbor.</p></div>
          <figure className="m-current-portfolio"><ProductImage name="portfolio" alt="Arbor Portfolio with a prominent recorded-value graph, VT, VGT, Bitcoin and an ATRAM holding. Illustrative local demo, not investment returns."/><figcaption>Illustrative recorded-value history · Your holdings stay with your provider. Arbor does not connect to your broker or place trades.</figcaption></figure>
          <div className="m-portfolio-stage">
            <figure className="m-holdings-preview"><div className="m-preview-heading"><span>One view. Your investments.</span><small>Product preview</small></div><ProductImage name="holdings" alt="Actual holdings view: an ATRAM fund held through GFunds, Vanguard VT through Gotrade and Bitcoin through PDAX. Values are illustrative."/><figcaption>Enter holdings or the current value shown in your fund app. No broker connection or automatic account sync.</figcaption></figure>
            <figure className="m-fund-preview"><ProductImage name="fund-value" alt="Actual Add Investment form for an ATRAM fund: current PHP value first, fund units optional."/><figcaption>Simple fund-value entry</figcaption></figure>
          </div>
          <div className="m-provider-list" aria-label="Supported provider examples">{['gcash','gotrade','dragonfi','gcrypto','coins_ph','pdax'].map(provider => <ProviderIdentity key={provider} provider={provider}/>)}</div>
          <p className="m-fine m-centered">Arbor Plus tracking is available in private beta. Selected supported products only. Names identify providers, not partnerships. Icons are original Arbor illustrations.</p>
          <div className="m-alignment"><div><p className="m-eyebrow">Understand the mix</p><h3>Your holdings.<br/>Your chosen targets.</h3><p>See how your recorded allocation compares with your plan. A comparison to understand—not a signal to trade.</p></div><figure><ProductImage name="allocation" alt="Arbor’s current allocation view with labeled percentages. This example mix describes recorded holdings, not a recommended plan."/><figcaption>Illustrative current allocation · Not an investment recommendation</figcaption></figure></div>
        </div>
      </section>

      <section id="ways-to-invest" className="m-container m-section m-ways" aria-labelledby="ways-title">
        <div className="m-section-heading"><p className="m-eyebrow">From understanding to doing</p><h2 id="ways-title">Ways to invest<br/>the plan you choose.</h2><p className="m-section-lead">Recognizable investments. Official provider links.<br/>The decision stays yours.</p></div>
        <figure className="m-ways-screen"><ProductImage name="ways" alt="Current empty Portfolio showing the selected approach and factual Ways to invest, with separate investment and provider identities."/><figcaption>Options follow the parts of your chosen plan. You choose one investment and provider for each part—never a provider ranking.</figcaption></figure>
        <div className="m-supported-options" aria-label="Supported investment examples">{[...PLAN_OPTIONS.global_equity, ...PLAN_OPTIONS.crypto].map(option => <div className="m-supported-option" key={option.product}>
          <InvestmentIdentity product={option.product}/><div><strong>{investmentIdentity(option.product).shortName}</strong><ProviderIdentity provider={option.provider}/></div>
          <a href={providerDestination(option.provider)!} target="_blank" rel="noopener noreferrer" aria-label={`Open ${providerName(option.provider)} (opens in a new tab)`}><Arrow/></a>
        </div>)}</div>
        <p className="m-fine m-centered">Supported examples, not recommendations. Availability and fees vary. Provider and fund names are for identification only; Arbor is not affiliated with or endorsed by these providers.</p>
      </section>

      <section id="record-investment" className="m-record m-section" aria-labelledby="record-title"><div className="m-container m-record-layout">
        <div><p className="m-eyebrow">Add Investment · Arbor Plus</p><h2 id="record-title">What you own.<br/>Clearly organized.</h2><p className="m-section-lead">Find your investment in a simple catalogue.</p><p>For supported funds, enter the current peso value shown in your provider app. For ETFs or Bitcoin, record the shares or amount you hold.</p><p className="m-note">A holding record—not a purchase, broker import or transaction confirmation.</p><a className="m-text-link" href="#pricing">See what’s included <Arrow/></a></div>
        <figure className="m-phone"><ProductImage name="catalogue" alt="Current Add Investment catalogue with All, Funds, ETFs and Bitcoin filters, fund-manager identities and separate provider names."/><figcaption>Actual catalogue · Selected supported investments only</figcaption></figure>
      </div></section>

      <section id="monthly-contribution" className="m-container m-section m-monthly" aria-labelledby="monthly-title">
        <div className="m-monthly-copy"><p className="m-eyebrow">Invest this month · Arbor Plus</p><h2 id="monthly-title">A clear month.<br/>A longer view.</h2><p className="m-section-lead">Know what this month’s contribution looks like.</p><p>Arbor uses your chosen plan and recorded portfolio to calculate a breakdown. See exact amounts by provider, with amounts below a minimum visible.</p><p className="m-note">Your saved implementation choices organize the result. You review the amounts and invest outside Arbor.</p>
          <div className="m-monthly-loop"><span>Review</span><span aria-hidden="true">→</span><span>Record</span><span aria-hidden="true">→</span><span>Keep perspective</span></div><p className="m-fine">Monthly check-ins are available in private beta. “Recorded as invested” means you invested outside Arbor—not that Arbor placed a trade or updated your holdings.</p>
        </div>
        <figure className="m-contribution-preview"><ProductImage name="contribution" alt="Arbor’s monthly breakdown groups the user’s assigned amounts by provider. Illustrative calculation, no trade placed."/><figcaption>Example calculation, not a buy list. You invest through your provider.</figcaption></figure>
      </section>

      <section id="ask-arbor" className="m-ask m-section" aria-labelledby="ask-title"><div className="m-container m-ask-layout">
        <figure className="m-phone"><ProductImage name="ask" alt="Actual Ask Arbor conversation explaining a sample portfolio value, including which fund amount was entered manually."/><figcaption>Illustrative conversation · Portfolio context preview</figcaption></figure>
        <div><span className="m-companion-mark"><ArborMark className="h-10 w-12"/></span><p className="m-eyebrow">Meet Ask Arbor</p><h2 id="ask-title">Less jargon.<br/>More understanding.</h2><p className="m-section-lead">Your plan, in plain language.</p><p>Ask about the approach you chose, how a contribution was calculated or your next step in Arbor. Clear explanations, grounded in your Arbor context.</p>
          <ul className="m-question-chips" aria-label="Questions you can ask"><li>Why is Technology in my plan?</li><li>How was my contribution calculated?</li><li>What should I do next in Arbor?</li></ul><a className="m-text-link" href={entryLinks.signup}>Get to know your plan <Arrow/></a><p className="m-fine">AI explanations can be mistaken. Ask Arbor does not choose investments or give trading instructions.</p>
        </div>
      </div></section>

      <section className="m-container m-section m-trust" aria-labelledby="trust-title"><p className="m-eyebrow">Built around your independence</p><h2 id="trust-title">Your money stays yours.<br/>Your decisions do, too.</h2><div className="m-trust-points"><p><span aria-hidden="true">↗</span>Your investments stay<br/>with your provider.</p><p><span aria-hidden="true">◈</span>Arbor never holds your money<br/>or places trades.</p><p><span aria-hidden="true">✓</span>You choose.<br/>Arbor helps you understand.</p></div></section>

      <section id="pricing" className="m-pricing m-section" aria-labelledby="pricing-title"><div className="m-container"><div className="m-section-heading"><p className="m-eyebrow">A little clarity goes a long way</p><h2 id="pricing-title">Start with a plan.<br/>Grow with perspective.</h2><p className="m-section-lead">All beta users get Arbor Plus free.<br/>No card. No billing date. Just room to explore.</p></div>
        <div className="m-price-grid">
          <article className="m-price-free"><p className="m-eyebrow">Arbor Free · At launch</p><h3>Build your plan.<br/>See ways to invest.</h3><p className="m-price">₱0</p><ul><li>Investment profile &amp; readiness checks</li><li>Your choice of standardized plan &amp; targets</li><li>Optional Technology &amp; Bitcoin choices</li><li>Basic projections &amp; next steps</li><li>Ways to invest &amp; official provider links</li><li>10 Ask Arbor questions per month, when public quota support launches</li></ul><a className="m-text-link" href="#faq">Understand the plans <Arrow/></a></article>
          <article className="m-price-plus"><span className="m-beta-label">Private beta · Free for now</span><p className="m-eyebrow">Arbor Plus</p><h3>Track your portfolio.<br/>Stay aligned over time.</h3><p className="m-price">Free <span>during beta</span></p><ul><li>Everything in Free</li><li>Full Ask Arbor access, under fair use</li><li>Monthly contribution planning &amp; check-ins</li><li>Edit your profile or change your plan</li><li>Holdings, value history &amp; Plan Alignment</li></ul><StartLink/><p className="m-fine">Planned launch price: ₱399/month or ₱3,990/year.<br/>Display only. Payments are not available.</p></article>
        </div><p className="m-pricing-note">Your feedback will help shape Free and Plus at launch. Availability is controlled by your account’s current access.</p>
      </div></section>

      <section id="faq" className="m-container m-section m-faq" aria-labelledby="faq-title"><div><p className="m-eyebrow">A few good questions</p><h2 id="faq-title">Clarity starts here.</h2><p>Something else on your mind?<br/><a href="mailto:support@arbor.ph">Talk to us <Arrow/></a></p></div><div>{publicFaqs.map(([question,answer]) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div></section>

      <section className="m-final m-section"><div className="m-container"><ArborMark className="h-12 w-16"/><h2>A little clarity.<br/>A longer view.</h2><StartLink/><p className="m-fine">Your investing journey, on your terms.</p></div></section>
    </main>
    <footer className="m-footer"><div className="m-container"><div className="m-footer-top"><div><Logo/><p>An AI investment companion.<br/>Rooted in the long term.</p></div><nav aria-label="Footer product"><h2>Product</h2><a href="#how-it-works">How it works</a><a href="#pricing">Free &amp; Plus</a><a href={entryLinks.login}>Sign in</a></nav><nav aria-label="Footer support"><h2>Support</h2><a href="#faq">Help &amp; FAQ</a><a href="mailto:support@arbor.ph">support@arbor.ph</a><a href="#disclosures">Disclosures</a></nav><div className="m-footer-appearance"><AppearanceSelect/></div></div>
      <details id="disclosures" className="m-disclosures"><summary>About Arbor, privacy &amp; disclosures</summary><p>Arbor is an educational planning and tracking companion, not a broker, custodian or investment adviser. You make your own investment decisions. Projections and contribution previews are hypothetical; returns are not guaranteed. Reference values can be delayed, incomplete or entered by you.</p><p>Arbor uses the account, profile and holdings information you provide to power its tools. Do not enter brokerage passwords, bank account details or order confirmations. For privacy, account or terms questions, contact <a href="mailto:support@arbor.ph">support@arbor.ph</a>. Full public Privacy and Terms pages are being prepared.</p><p>Provider and investment names are shown for identification only and belong to their respective owners. The identity icons are original Arbor illustrations, not official logos. No affiliation, sponsorship or endorsement is implied.</p></details>
      <div className="m-footer-bottom"><p>© {new Date().getFullYear()} Arbor</p><p>You choose. Arbor calculates, tracks, simulates and explains.</p></div>
    </div></footer>
  </div>;
}
