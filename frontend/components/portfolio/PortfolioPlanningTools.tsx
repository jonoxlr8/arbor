export default function PortfolioPlanningTools() {
  return <nav className="portfolio-planning-tools" aria-label="Portfolio planning tools">
    <a href="#portfolio/contribution" aria-haspopup="dialog"><span className="eyebrow plus-eyebrow">Arbor Plus</span><strong>Investment breakdown</strong><small>See how your next amount fits your chosen targets</small><span aria-hidden="true">→</span></a>
    <a href="#portfolio/what-if" aria-haspopup="dialog"><span className="eyebrow plus-eyebrow">Arbor Plus</span><strong>What-if exploration</strong><small>Try a monthly amount and future date</small><span aria-hidden="true">→</span></a>
    <a href="#portfolio/insights" data-sheet-launcher="insights" aria-haspopup="dialog"><span className="eyebrow plus-eyebrow">Arbor Plus</span><strong>Portfolio insights</strong><small>Review recorded activity and how your holdings compare with your plan</small><span aria-hidden="true">→</span></a>
  </nav>;
}
