"use client";
import { useState } from "react";
import { providerDestination } from "@/lib/planImplementation";
import { providerName } from "@/lib/investmentIdentity";
import { pendingApi, pendingChanged } from "@/lib/pendingRecordings";

/** Persist owner-scoped intent before opening an external provider. No holding is created. */
export default function ProviderContinue({ userId, productId, provider }: { userId: string; productId: string; provider: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const destination = providerDestination(provider);
  if (!destination) return null;
  async function openProvider() {
    if (busy) return;
    // Reserve the tab during the click so browsers do not block it after the save.
    const providerTab = window.open("about:blank", "_blank");
    if (!providerTab) { setError("Allow pop-ups to continue to your provider."); return; }
    providerTab.opener = null;
    setBusy(true); setError("");
    try {
      await pendingApi.start(userId, productId, provider);
      pendingChanged();
      const link = providerTab.document.createElement("a");
      link.href = destination!;
      link.rel = "noopener noreferrer";
      link.referrerPolicy = "no-referrer";
      providerTab.document.body.append(link);
      link.click();
      setBusy(false);
    } catch (cause) { providerTab.close(); setError(cause instanceof Error ? cause.message : "Please retry before leaving Arbor."); setBusy(false); }
  }
  return <div className="monthly-provider-continue"><button type="button" className="provider-open min-h-11" disabled={busy} onClick={() => void openProvider()} aria-label={`Continue with ${providerName(provider)} (opens in a new tab)`}>{busy ? "Saving your place…" : `Continue with ${providerName(provider)} ↗`}</button>{error && <p role="alert">{error}</p>}</div>;
}
