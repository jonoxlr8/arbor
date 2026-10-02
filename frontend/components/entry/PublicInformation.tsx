import termsDocument from '@/lib/termsDocument.json';
import Link from "next/link";
import Logo from "@/components/Logo";
import { publicInformation, type PublicInformationPage } from "@/lib/publicInformation";

export default function PublicInformation({ page }: { page: PublicInformationPage }) {
  const content = publicInformation[page];
  return <div className="marketing-site m-information">
    <a className="m-skip" href="#information-content">Skip to content</a>
    <header className="m-header"><div className="m-nav-wrap"><Link className="m-logo" href="/" aria-label="Arbor home"><Logo /></Link><Link className="m-text-link" href="/">Back to Arbor</Link></div></header>
    <main id="information-content" tabIndex={-1} className="m-container m-section">
      <p className="m-eyebrow">{page === "terms" ? `Terms version ${termsDocument.version}` : page === "investment-disclosures" ? "About Arbor" : "Public beta information · September 2026"}</p>
      <h1>{content.title}</h1><p className="m-section-lead">{content.introduction}</p>
      {content.sections.map(([heading, body]) => <section key={heading} aria-label={heading}><h2>{heading}</h2><p>{body}</p></section>)}
      <p className="m-information-contact">Questions? <a href="mailto:support@arbor.ph">support@arbor.ph</a></p>
    </main>
    <footer className="m-footer"><nav className="m-container" aria-label="Public information"><Link href="/">Home</Link><a href="/privacy">Privacy</a><Link href="/terms">Terms</Link><a href="/investment-disclosures">Investment disclosures</a></nav></footer>
  </div>;
}
