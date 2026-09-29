"use client";
import { useState } from "react";
import type { LivePortfolioData, PortfolioHolding } from "@/lib/livePortfolio";
import { formatContributionMoney } from "@/lib/contributions";
import Sheet from "../ui/Sheet";
import InvestmentHistory from "./InvestmentHistory";
import HoldingActivity from "./HoldingActivity";

export default function InvestmentActivitySheet({ portfolio, userId, onClose, onChanged }: {
  portfolio: LivePortfolioData; userId: string; onClose: () => void; onChanged: () => void;
}) {
  const [activityHolding, setActivityHolding] = useState<PortfolioHolding | null>(null);
  return <Sheet title="Investment activity" wide onClose={onClose}>
    {activityHolding ? <>
      <button type="button" className="entry-link min-h-11" onClick={() => setActivityHolding(null)}>‹ All investment activity</button>
      <HoldingActivity holding={activityHolding} userId={userId} onChanged={() => { setActivityHolding(null); onChanged(); }}/>
    </> : <>
      <InvestmentHistory userId={userId} canManage={entry => portfolio.holdings.some(item => item.id === entry.holding_id)} onManage={entry => {
        const holding = portfolio.holdings.find(item => item.id === entry.holding_id);
        if (holding) setActivityHolding(holding);
      }}/>
      <details className="mt-5"><summary className="min-h-11 cursor-pointer text-sm font-semibold">Recorded portfolio values</summary>
        <dl className="detail-facts">{[...portfolio.history].reverse().map(point => <div key={point.day}><dt>{point.day}</dt><dd>{formatContributionMoney(point.value_php, "PHP")}</dd></div>)}</dl>
        {!portfolio.history.length && <p className="mt-3 text-sm text-slate-600">No portfolio observations recorded yet.</p>}
      </details>
    </>}
  </Sheet>;
}
