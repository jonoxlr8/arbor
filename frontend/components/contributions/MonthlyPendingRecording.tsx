"use client";
import { useState } from "react";
import { portfolioApi, type LivePortfolioData } from "@/lib/livePortfolio";
import { pendingApi, pendingChanged, type PendingRecording } from "@/lib/pendingRecordings";
import DatedInvestmentFlow from "../portfolio/DatedInvestmentFlow";
import PendingRecordingResume from "./PendingRecordingResume";

/** Factual recording stays available even when Plus monthly planning is locked. */
export default function MonthlyPendingRecording({ userId }: { userId: string }) {
  const [portfolio, setPortfolio] = useState<LivePortfolioData | null>(null);
  const [recording, setRecording] = useState<PendingRecording | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  async function record(item: PendingRecording) {
    setError("");
    setSaved(false);
    try {
      const current = await portfolioApi.read(userId);
      if (!current.catalog.some(product => product.product_id === item.product_id && product.provider === item.provider)) {
        setError("This unfinished investment is unavailable in the current catalogue. You can dismiss its reminder without changing your holdings.");
        return;
      }
      setPortfolio(current);
      setRecording(item);
    } catch {
      setError("Your portfolio could not be loaded. Please retry before recording this investment.");
    }
  }
  const product = portfolio?.catalog.find(row => row.product_id === recording?.product_id && row.provider === recording.provider);
  return <>
    <PendingRecordingResume userId={userId} onRecord={item => void record(item)}/>
    {saved && <p role="status" className="monthly-record-success">Investment recorded. Your actual units and PHP paid were saved.</p>}
    {error && <p role="alert">{error}</p>}
    {recording && portfolio && product && <DatedInvestmentFlow portfolio={portfolio} userId={userId}
      initialProduct={product} monthly onClose={() => setRecording(null)} onOpeningOnly={() => { setRecording(null); window.location.hash = "#portfolio/add"; }}
      onSaved={() => {
        const id = recording.id;
        setRecording(null);
        setSaved(true);
        window.dispatchEvent(new Event("arbor-investment-recorded"));
        void pendingApi.resolve(userId, id, "recorded")
          .then(() => { setError(""); pendingChanged(); })
          .catch(() => setError("Your investment was saved, but its unfinished reminder could not be cleared. Do not record it again; return later to dismiss the reminder."));
      }}/>}
  </>;
}
