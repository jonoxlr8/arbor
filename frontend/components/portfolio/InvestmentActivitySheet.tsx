"use client";
import { useState } from "react";
import type { LivePortfolioData, InvestmentEntry } from "@/lib/livePortfolio";
import { formatContributionMoney } from "@/lib/contributions";
import Sheet from "../ui/Sheet";
import InvestmentHistory from "./InvestmentHistory";
import HoldingActivity from "./HoldingActivity";

export default function InvestmentActivitySheet({ portfolio, userId, onClose, onChanged }: {
  portfolio: LivePortfolioData; userId: string; onClose: () => void; onChanged: () => void;
}) {
  const [selected, setSelected] = useState<{entry: InvestmentEntry; action: "edit" | "delete"} | null>(null);
  const [activityVersion, setActivityVersion] = useState(0);
  const holding = selected && portfolio.holdings.find(item => item.id === selected.entry.holding_id);
  return <Sheet title="Investment activity" wide onClose={onClose}>
    {selected && holding && <HoldingActivity key={`${selected.entry.id}:${selected.action}`} holding={holding} userId={userId} selectedEntry={selected.entry} selectedAction={selected.action} onActionClose={() => setSelected(null)} onChanged={() => { setSelected(null); setActivityVersion(version => version + 1); onChanged(); }}/>}
    <InvestmentHistory key={activityVersion} userId={userId} canManage={entry => portfolio.holdings.some(item => item.id === entry.holding_id)} onManage={(entry, action) => setSelected({entry, action})}/>
      <details className="mt-5"><summary className="min-h-11 cursor-pointer text-sm font-semibold">Recorded portfolio values</summary>
        <dl className="detail-facts">{[...portfolio.history].reverse().map(point => <div key={point.day}><dt>{point.day}</dt><dd>{formatContributionMoney(point.value_php, "PHP")}</dd></div>)}</dl>
        {!portfolio.history.length && <p className="mt-3 text-sm text-slate-600">No portfolio observations recorded yet.</p>}
      </details>
  </Sheet>;
}
