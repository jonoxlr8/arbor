import type { PortfolioHistory } from "./livePortfolio";
import { historyRange } from "./portfolioHistory";

export type PortfolioGraphState =
  | { kind: "empty_zero" | "current_only" | "single_recorded" | "incomplete"; value: string; history: PortfolioHistory[]; summary: string }
  | { kind: "historical"; value: string; history: PortfolioHistory[]; summary: string };

// Flat lines are drawing instructions only. They are never history records.
export function portfolioGraphState(input: { knownValue: string; complete: boolean; holdingsCount: number; history: PortfolioHistory[] }): PortfolioGraphState {
  const history = historyRange(input.history);
  if (!input.holdingsCount) return { kind: "empty_zero", value: "0", history: [], summary: "No investments recorded yet." };
  if (!input.complete) return { kind: "incomplete", value: input.knownValue, history, summary: "Some investments need an updated value. The known value is not your complete portfolio value." };
  if (!history.length) return { kind: "current_only", value: input.knownValue, history, summary: "Current value · No history yet" };
  if (history.length === 1) return { kind: "single_recorded", value: history[0].value_php, history, summary: "One supported historical portfolio value is available so far." };
  return { kind: "historical", value: history[history.length - 1].value_php, history, summary: `${history.length} supported historical portfolio values.` };
}
