import type {PortfolioHolding} from "./livePortfolio";
import {supportsManualValue} from "./livePortfolio";

// Missing ledger metadata is not permission to infer an opening cost.
export function canCorrectManualFundUnits(holding: PortfolioHolding): boolean {
  return supportsManualValue(holding) && holding.units === null &&
    holding.has_entries === false && holding.opening_units != null &&
    Number(holding.opening_units) === 0 && holding.opening_cost_php !== undefined;
}

export function validCorrectedFundUnits(value: string): boolean {
  return /^\d{1,12}(?:\.\d{1,12})?$/.test(value) && /[1-9]/.test(value);
}
