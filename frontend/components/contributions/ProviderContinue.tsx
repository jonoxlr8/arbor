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
    setBusy(true); setError("");
    try {
      await pendingApi.start(userId, productId, provider);
      pendingChanged();
      window.location.assign(destination!);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Please retry before leaving Arbor."); setBusy(false); }
  }
  return <div className="monthly-provider-continue"><button type="button" className="provider-open min-h-11" disabled={busy} onClick={() => void openProvider()}>{busy ? "Saving your place…" : `Continue with ${providerName(provider)} ↗`}</button>{error && <p role="alert">{error}</p>}</div>;
}
