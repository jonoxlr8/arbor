"use client";

import { useEffect, useRef, useState } from "react";
import Image, { getImageProps } from "next/image";
import Logo, { ArborMark } from "@/components/Logo";
import ProviderIdentity from "@/components/ProviderIdentity";
import { AppearanceSelect } from "@/components/app/Appearance";
import { entryLinks } from "@/lib/publicEntry";
import { publicFaqs, publicSections } from "@/lib/publicWebsite";

function Arrow() { return <span aria-hidden="true">↗</span>; }
function StartLink({ children = "Get started free" }: { children?: React.ReactNode }) {
  return <a className="m-button" href={entryLinks.signup}>{children}<Arrow /></a>;
}
function ProductImage({ name, width, height, alt, hero = false }: { name: string; width: number; height: number; alt: string; hero?: boolean }) {
  const mobile = ({ home: [390,844], holdings: [358,529], allocation: [358,201] } as Record<string,number[]>)[name];
  const mobileProps = mobile ? getImageProps({src:`/product/${name}-mobile.webp`,width:mobile[0],height:mobile[1],alt,sizes:"90vw"}).props : null;
  const sizes = name === "fund-value" ? "(max-width: 600px) 260px, (max-width: 1100px) 245px, 290px" : name === "ask" ? "(max-width: 600px) 280px, (max-width: 900px) 290px, 330px" : "(max-width: 760px) 90vw, 650px";
  return <picture>{mobileProps && <source media="(max-width: 600px)" srcSet={mobileProps.srcSet} sizes={mobileProps.sizes} width={mobile[0]} height={mobile[1]}/>}
    <Image src={`/product/${name}.webp`} width={width} height={height} alt={alt}
    sizes={hero ? "(max-width: 760px) 94vw, (max-width: 1280px) 90vw, 1120px" : sizes}
    loading="lazy" fetchPriority={hero ? "high" : undefined} /></picture>;
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
          <p className="m-lead">A plan you choose. A clearer picture of your investments.<br className="m-desktop-break"/> A companion to help you understand your next step.</p>
          <div className="m-actions"><StartLink/><a className="m-text-link" href="#how-it-works">See how Arbor works <span aria-hidden="true">↓</span></a></div>
          <p className="m-fine">Arbor Plus is free during private beta. No credit card.</p>
        </div>
        <figure className="m-hero-product m-container">
          <p className="m-preview-label">Inside Arbor <span>Product preview · Illustrative data</span></p>
          <div className="m-browser"><div className="m-browser-bar" aria-hidden="true"><span/><span/><span/><small>arbor.ph</small></div>
            <ProductImage name="home" width={1280} height={900} hero alt="Arbor Home preview with one next step, a selected plan and an illustrative portfolio summary."/>
          </div>
          <figcaption>Actual Arbor interface · Illustrative data. Portfolio tracking and monthly check-ins are previews, not yet enabled.</figcaption>
        </figure>
      </section>

      <section id="how-it-works" className="m-container m-section m-approach" aria-labelledby="approach-title">
        <div><p className="m-eyebrow">Your choices. A clearer picture.</p><h2 id="approach-title">Your plan.<br/>Not a black box.</h2></div>
        <div className="m-approach-story"><p className="m-section-lead">Start with what matters to you. Compare standardized long-term approaches and choose one you understand.</p><p>Arbor helps you check your financial readiness and explore your assumptions. You make the choice—and stay in control.</p>
          <ol className="m-steps"><li><span>01</span><strong>Choose your approach</strong></li><li><span>02</span><strong>Understand your targets</strong></li><li><span>03</span><strong>Review with perspective</strong></li></ol>
        </div>
      </section>

      <section id="product-portfolio" className="m-portfolio m-section" aria-labelledby="portfolio-title">
        <div className="m-container">
          <div className="m-section-heading"><p className="m-eyebrow">Portfolio · Preview</p><h2 id="portfolio-title">Across your providers.<br/>Together in perspective.</h2><p className="m-section-lead">A clear view of what you’ve recorded, in pesos.<br/>Your investments stay right where they are.</p></div>
          <div className="m-portfolio-stage">
            <figure className="m-holdings-preview"><div className="m-preview-heading"><span>One view. Your investments.</span><small>Product preview</small></div><ProductImage name="holdings" width={992} height={408} alt="Actual holdings view: an ATRAM fund held through GFunds, Vanguard VT through Gotrade and Bitcoin through PDAX. Values are illustrative."/><figcaption>Enter holdings or the current value shown in your fund app. No broker connection or automatic account sync.</figcaption></figure>
            <figure className="m-fund-preview"><ProductImage name="fund-value" width={390} height={754} alt="Actual Add Investment form for an ATRAM fund: current PHP value first, fund units optional."/><figcaption>Simple fund-value entry</figcaption></figure>
          </div>
          <div className="m-provider-list" aria-label="Supported provider examples">{['gcash','gotrade','dragonfi','gcrypto','coins_ph','pdax'].map(provider => <ProviderIdentity key={provider} provider={provider}/>)}</div>
          <p className="m-fine m-centered">Live Portfolio is not enabled in the current public beta. Selected supported products only. Names identify providers, not partnerships.</p>
          <div className="m-alignment"><div><p className="m-eyebrow">Understand the mix</p><h3>Your holdings.<br/>Your chosen targets.</h3><p>See how your recorded allocation compares with your plan. A comparison to understand—not a signal to trade.</p></div><figure><ProductImage name="allocation" width={992} height={213} alt="Arbor’s current allocation view with labeled percentages. This example mix describes recorded holdings, not a recommended plan."/><figcaption>Illustrative current allocation · Not an investment recommendation</figcaption></figure></div>
        </div>
      </section>

      <section id="monthly-contribution" className="m-container m-section m-monthly" aria-labelledby="monthly-title">
        <div className="m-monthly-copy"><p className="m-eyebrow">Monthly contribution · Arbor Plus</p><h2 id="monthly-title">Make room for<br/>the long term.</h2><p className="m-section-lead">Explore what this month’s contribution could look like.</p><p>Your chosen plan and current-value inputs become a clear contribution preview. You choose the implementation options. Arbor calculates the breakdown.</p><p className="m-note">Available now with manual inputs. Recorded holdings can supply those values when Live Portfolio is enabled.</p>
          <div className="m-monthly-loop"><span>Review</span><span aria-hidden="true">→</span><span>Record</span><span aria-hidden="true">→</span><span>Keep perspective</span></div><p className="m-fine">Monthly check-in recording is a preview. “Recorded as invested” means you invested outside Arbor—not that Arbor placed a trade.</p>
        </div>
        <figure className="m-contribution-preview"><ProductImage name="contribution" width={468} height={455} alt="Actual contribution preview with an illustrative ₱5,000 amount, target calculation and minimum check. No investment has been made."/><figcaption>Example calculation, not a buy list.</figcaption></figure>
      </section>

      <section id="ask-arbor" className="m-ask m-section" aria-labelledby="ask-title"><div className="m-container m-ask-layout">
        <figure className="m-phone"><ProductImage name="ask" width={390} height={1017} alt="Actual Ask Arbor conversation explaining a sample portfolio value, including which fund amount was entered manually."/><figcaption>Illustrative conversation · Portfolio context preview</figcaption></figure>
        <div><span className="m-companion-mark"><ArborMark className="h-10 w-12"/></span><p className="m-eyebrow">Meet Ask Arbor</p><h2 id="ask-title">Less jargon.<br/>More understanding.</h2><p className="m-section-lead">Your plan, in plain language.</p><p>Ask about the approach you chose, how a contribution was calculated or your next step in Arbor. Clear explanations, grounded in your Arbor context.</p>
          <ul className="m-question-chips" aria-label="Questions you can ask"><li>Explain my investment plan</li><li>How was my contribution calculated?</li><li>What should I do next in Arbor?</li></ul><a className="m-text-link" href={entryLinks.signup}>Get to know your plan <Arrow/></a><p className="m-fine">AI explanations can be mistaken. Ask Arbor does not choose investments or give trading instructions.</p>
        </div>
      </div></section>

      <section className="m-container m-section m-trust" aria-labelledby="trust-title"><p className="m-eyebrow">Built around your independence</p><h2 id="trust-title">Your money stays yours.<br/>Your decisions do, too.</h2><div className="m-trust-points"><p><span aria-hidden="true">↗</span>Your investments stay<br/>with your provider.</p><p><span aria-hidden="true">◈</span>Arbor never holds your money<br/>or places trades.</p><p><span aria-hidden="true">✓</span>You choose.<br/>Arbor helps you understand.</p></div></section>

      <section id="pricing" className="m-pricing m-section" aria-labelledby="pricing-title"><div className="m-container"><div className="m-section-heading"><p className="m-eyebrow">A little clarity goes a long way</p><h2 id="pricing-title">Start with a plan.<br/>Grow with perspective.</h2><p className="m-section-lead">All beta users get Arbor Plus free.<br/>No card. No billing date. Just room to explore.</p></div>
        <div className="m-price-grid">
          <article className="m-price-free"><p className="m-eyebrow">Arbor Free · At launch</p><h3>Build and understand<br/>your investing plan.</h3><p className="m-price">₱0</p><ul><li>Investment profile &amp; readiness checks</li><li>Your choice of standardized plan</li><li>Basic projections &amp; next steps</li><li>Implementation education</li><li>10 Ask Arbor questions per month</li></ul><a className="m-text-link" href="#faq">Understand the plans <Arrow/></a></article>
          <article className="m-price-plus"><span className="m-beta-label">Private beta · Free for now</span><p className="m-eyebrow">Arbor Plus</p><h3>A companion for<br/>the longer journey.</h3><p className="m-price">Free <span>during beta</span></p><ul><li>Everything in Free</li><li>Full Ask Arbor access, under fair use</li><li>Monthly contribution planning</li><li>Edit your profile or change your plan</li><li>Portfolio tracking &amp; monthly check-ins <small>Preview</small></li></ul><StartLink/><p className="m-fine">Planned launch price: ₱399/month or ₱3,990/year.<br/>Display only. Payments are not available.</p></article>
        </div><p className="m-pricing-note">Your feedback will help shape Free and Plus at launch. Preview features remain unavailable until their separate release.</p>
      </div></section>

      <section id="faq" className="m-container m-section m-faq" aria-labelledby="faq-title"><div><p className="m-eyebrow">A few good questions</p><h2 id="faq-title">Clarity starts here.</h2><p>Something else on your mind?<br/><a href="mailto:support@arbor.ph">Talk to us <Arrow/></a></p></div><div>{publicFaqs.map(([question,answer]) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div></section>

      <section className="m-final m-section"><div className="m-container"><ArborMark className="h-12 w-16"/><h2>A little clarity.<br/>A longer view.</h2><StartLink/><p className="m-fine">Your investing journey, on your terms.</p></div></section>
    </main>
    <footer className="m-footer"><div className="m-container"><div className="m-footer-top"><div><Logo/><p>An AI investment companion.<br/>Rooted in the long term.</p></div><nav aria-label="Footer product"><h2>Product</h2><a href="#how-it-works">How it works</a><a href="#pricing">Free &amp; Plus</a><a href={entryLinks.login}>Sign in</a></nav><nav aria-label="Footer support"><h2>Support</h2><a href="#faq">Help &amp; FAQ</a><a href="mailto:support@arbor.ph">support@arbor.ph</a><a href="#disclosures">Disclosures</a></nav><div className="m-footer-appearance"><AppearanceSelect/></div></div>
      <details id="disclosures" className="m-disclosures"><summary>About Arbor, privacy &amp; disclosures</summary><p>Arbor is an educational planning and tracking companion, not a broker, custodian or investment adviser. You make your own investment decisions. Projections and contribution previews are hypothetical; returns are not guaranteed. Reference values can be delayed, incomplete or entered by you.</p><p>Arbor uses the account, profile and holdings information you provide to power its tools. Do not enter brokerage passwords, bank account details or order confirmations. For privacy, account or terms questions, contact <a href="mailto:support@arbor.ph">support@arbor.ph</a>. Full public Privacy and Terms pages are being prepared.</p><p>Provider and investment names are for identification only and do not imply affiliation or endorsement. Corporate identity tiles are text labels, not official logos. Bitcoin artwork from <a href="https://bitcoin.design/guide/getting-started/visual-language/">Bitcoin Design / bitboy</a>, unchanged under <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>.</p></details>
      <div className="m-footer-bottom"><p>© {new Date().getFullYear()} Arbor</p><p>You choose. Arbor calculates, tracks, simulates and explains.</p></div>
    </div></footer>
  </div>;
}
