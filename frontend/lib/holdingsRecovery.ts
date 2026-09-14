import type { Holding } from "./api";
import { boundedRequest } from "./dashboardConsistency";
import { normalizeTicker } from "./currency";

export class HoldingsRequestError extends Error {}

// Currency is deliberately preserved, including legacy blank/unknown codes.
// The existing portfolio summary makes those rows editable but not analytical.
export function parseHolding(value: unknown): Holding {
  if (!value || typeof value !== "object") throw new HoldingsRequestError("The saved holdings response was incomplete. Please retry.");
  const row = value as Record<string, unknown>;
  const text = (key: string) => typeof row[key] === "string" && (row[key] as string).trim().length > 0;
  const amount = (key: string) => typeof row[key] === "number" && Number.isFinite(row[key]) && (row[key] as number) >= 0;
  if (!Number.isSafeInteger(row.id) || (row.id as number) <= 0 ||
      !text("created_at") || !Number.isFinite(Date.parse(row.created_at as string)) ||
      !normalizeTicker(row.ticker) || !text("asset_name") || !text("asset_type") ||
      !amount("quantity") || !amount("average_cost") ||
      !Number.isFinite((row.quantity as number) * (row.average_cost as number)) ||
      (row.currency != null && typeof row.currency !== "string")) {
    throw new HoldingsRequestError("The saved holdings response was incomplete. Please retry.");
  }
  return value as Holding;
}

export function parseHoldingsResponse(value: unknown): Holding[] {
  if (!value || typeof value !== "object" || !("holdings" in value) || !Array.isArray(value.holdings)) {
    throw new HoldingsRequestError("The saved holdings response was incomplete. Please retry.");
  }
  const rows = value.holdings.map(parseHolding);
  if (new Set(rows.map(row => row.id)).size !== rows.length) {
    throw new HoldingsRequestError("The saved holdings response contained duplicate rows. Please retry.");
  }
  return rows;
}

export type HoldingsState =
  | { status: "loading"; revision: number; operation: "load" | "save" }
  | { status: "loaded"; revision: number; holdings: Holding[] }
  | { status: "error"; revision: number; error: string };

export const initialHoldingsState: HoldingsState = { status: "loading", revision: 0, operation: "load" };

// A revision identifies a complete canonical read, not a locally patched array.
export function holdingsHealthKey(state: HoldingsState, risk: string): string | null {
  return state.status === "loaded" ? `${state.revision}:${risk}` : null;
}

export function createHoldingsRecovery(
  read: (signal: AbortSignal) => Promise<Holding[]>,
  publish: (state: HoldingsState) => void,
  timeoutMs = 12000,
) {
  let state: HoldingsState = initialHoldingsState;
  let generation = 0;
  let controller: AbortController | undefined;
  let disposed = false;
  function update(next: HoldingsState) { state = next; publish(next); }
  async function run(write?: (signal: AbortSignal) => Promise<unknown>) {
    if (disposed || (write && state.status !== "loaded") || (!write && state.status === "loading" && state.operation === "save")) return false;
    const attempt = ++generation;
    controller?.abort();
    const active = new AbortController();
    controller = active;
    update({ status: "loading", revision: attempt, operation: write ? "save" : "load" });
    let written = false;
    try {
      if (write) { await boundedRequest(write, active.signal, timeoutMs); written = true; }
      active.signal.throwIfAborted();
      const holdings = await boundedRequest(read, active.signal, timeoutMs);
      if (disposed || attempt !== generation) return false;
      update({ status: "loaded", revision: attempt, holdings });
      return true;
    } catch (error) {
      if (!disposed && attempt === generation) {
        const message = error instanceof HoldingsRequestError ? error.message : "We couldn’t load your saved holdings. Please retry.";
        update({ status: "error", revision: attempt, error: write
          ? (written ? "Your change was saved, but we couldn’t reload your holdings. Retry loading before making more changes."
            : `${message} The change may not have completed. Retry loading to check your saved holdings before trying again.`)
          : message });
      }
      return false;
    }
  }
  return {
    load: () => run(),
    mutate: (write: (signal: AbortSignal) => Promise<unknown>) => run(write),
    dispose() { disposed = true; generation++; controller?.abort(); },
  };
}
