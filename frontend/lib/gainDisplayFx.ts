import { decimalText } from "./contributions";
import type { GainDisplayFx, PortfolioHistory } from "./livePortfolio";

const dayMilliseconds = 86400000;
const positiveRate = (rate: unknown): rate is string => {
  if (typeof rate !== "string") return false;
  try { return decimalText(rate) !== "0"; } catch { return false; }
};
const timestamp = (value: unknown) => typeof value === "string" ? Date.parse(value) : NaN;
const validDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

export function currentGainFxRate(fx: GainDisplayFx | null | undefined, now = Date.now()): string | null {
  if (!fx || fx.source !== "exchangerate_api" || !positiveRate(fx.rate) || !validDay(fx.valuation_date)) return null;
  const quote = timestamp(fx.as_of), valuation = timestamp(fx.valued_at);
  if (!Number.isFinite(quote) || !Number.isFinite(valuation) || quote > valuation || valuation > now + 5000 ||
      now - quote > 4 * dayMilliseconds || new Date(valuation).toISOString().slice(0, 10) !== fx.valuation_date) return null;
  return fx.rate;
}

export function historicalGainFxRate(point: PortfolioHistory): string | null {
  if (point.value_usd == null || !validDay(point.day)) return null;
  if (point.origin === "reconstructed") {
    const quotes = (point.source_dates ?? []).filter(item => item.price_key === "usd_php");
    if (quotes.length !== 1) return null;
    const quote = quotes[0];
    const age = Date.parse(point.day) - Date.parse(quote.observation_date);
    return quote.source === "bsp" && quote.valuation_date === point.day && validDay(quote.observation_date) &&
      age >= 0 && age <= 4 * dayMilliseconds && positiveRate(quote.rate) ? quote.rate : null;
  }
  const fx = point.display_fx;
  const capture = timestamp(point.captured_at);
  return fx?.source === "captured_snapshot" && positiveRate(fx.rate) && fx.as_of === null &&
    fx.valuation_date === point.day && fx.captured_at === point.captured_at && Number.isFinite(capture) &&
    new Date(capture).toISOString().slice(0, 10) === point.day ? fx.rate : null;
}

/** Display-only USD equivalent of PHP gain, rounded half-up to USD cents. */
export function usdEquivalentOfPhpGain(gain: string, rate: string | null): string | null {
  if (!positiveRate(rate)) return null;
  try {
    const negative = gain.startsWith("-");
    const [whole, fraction = ""] = decimalText(negative ? gain.slice(1) : gain).split(".");
    const [rateWhole, rateFraction = ""] = decimalText(rate).split(".");
    const numerator = BigInt(whole + fraction) * BigInt(10) ** BigInt(rateFraction.length) * BigInt(100);
    const denominator = BigInt(rateWhole + rateFraction) * BigInt(10) ** BigInt(fraction.length);
    const cents = (numerator * BigInt(2) + denominator) / (denominator * BigInt(2));
    return `${negative && cents !== BigInt(0) ? "-" : ""}${cents / BigInt(100)}.${String(cents % BigInt(100)).padStart(2, "0")}`;
  } catch { return null; }
}
