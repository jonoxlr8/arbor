"use client";
import { useEffect, useState } from "react";
import { investmentIdentity, providerName } from "@/lib/investmentIdentity";
import InvestmentIdentity from "../InvestmentIdentity";
import ProviderIdentity from "../ProviderIdentity";
import { pendingApi, pendingChanged, type PendingRecording } from "@/lib/pendingRecordings";

export default function PendingRecordingResume({ userId, compact = false, monthlyAvailable = true, onRecord }:
  { userId: string; compact?: boolean; monthlyAvailable?: boolean; onRecord?: (item: PendingRecording) => void }) {
  const [items, setItems] = useState<PendingRecording[]>([]);
  const [expanded, setExpanded] = useState(!compact);
  const [busy, setBusy] = useState("");
  const [notYet, setNotYet] = useState("");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    pendingApi.list(userId, controller.signal).then(value => { if (!controller.signal.aborted) { setItems(value); setError(""); } })
      .catch(() => { if (!controller.signal.aborted) setError("Unfinished recordings could not be loaded."); });
    const changed = () => setRevision(value => value + 1);
    window.addEventListener("arbor-pending-changed", changed);
    return () => { controller.abort(); window.removeEventListener("arbor-pending-changed", changed); };
  }, [userId, revision]);
  async function dismiss(item: PendingRecording) {
    setBusy(item.id); setError("");
    try { await pendingApi.resolve(userId, item.id, "dismissed"); setItems(current => current.filter(row => row.id !== item.id)); pendingChanged(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Please retry."); }
    finally { setBusy(""); }
  }
  if (!items.length && !error) return null;
  if (!items.length) return <p role="alert" className="pending-recording">{error} <button type="button" className="entry-link min-h-11" onClick={() => setRevision(value => value + 1)}>Retry</button></p>;
  return <section className={compact ? "pending-recording pending-recording-compact" : "pending-recording"} aria-label="Unfinished investment recordings">
    {compact ? <button type="button" className="pending-recording-toggle" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
      {items.length === 1 && <InvestmentIdentity product={items[0].product_id}/>}<span><strong>{items.length === 1 ? "Finish recording your investment" : "Finish recording investments"}</strong><small>{items.length === 1 ? `${investmentIdentity(items[0].product_id).shortName} · ${providerName(items[0].provider)}` : `${items.length} waiting`}</small></span><span aria-hidden="true">›</span>
    </button> : <header><h3>Finish recording your investment</h3><p>Only record units if you actually invested through your provider.</p></header>}
    {error && <p role="alert">{error} <button type="button" className="entry-link min-h-11" onClick={() => setRevision(value => value + 1)}>Retry</button></p>}
    {expanded && <ul>{items.map(item => <li key={item.id}>
      <div className="investment-line"><InvestmentIdentity product={item.product_id}/><div><strong>{investmentIdentity(item.product_id).shortName}</strong><ProviderIdentity provider={item.provider}/></div></div>
      <div className="pending-recording-actions">
        {onRecord ? <button type="button" className="entry-primary min-h-11" disabled={Boolean(busy)} onClick={() => onRecord(item)}>Record investment</button>
          : <a className="entry-primary min-h-11" href={monthlyAvailable ? "#home/monthly" : "#portfolio/add"}>Record investment</a>}
        <button type="button" className="entry-secondary min-h-11" onClick={() => { setNotYet(item.id); if (compact) setExpanded(false); }}>Not yet</button>
        <button type="button" className="entry-link min-h-11" disabled={Boolean(busy)} onClick={() => void dismiss(item)}>I didn’t invest</button>
        <button type="button" className="entry-link min-h-11" disabled={Boolean(busy)} onClick={() => void dismiss(item)}>I already recorded this</button>
      </div>{notYet === item.id && !compact && <small role="status">Okay. You can record this when you have the provider details.</small>}
    </li>)}</ul>}
  </section>;
}
