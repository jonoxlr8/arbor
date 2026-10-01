import {currentGainFxRate,historicalGainFxRate} from "./gainDisplayFx";
import type {GainDisplayFx,PortfolioHistory} from "./livePortfolio";
export function gainInfo(currency:"PHP"|"USD",fx?:GainDisplayFx|null,point?:PortfolioHistory|null) {
  const paragraphs=["Gain/loss compares recorded value with known recorded PHP cost. For a selected period, the amount is the change in that PHP gain. New contributions aren’t investment profit.",
    "The percentage, when shown, is based on recorded PHP cost. This isn’t an annualized or time-weighted return."];
  if(currency==="PHP")return paragraphs;
  paragraphs.unshift("This amount is the USD equivalent of PHP gain, not a separately calculated USD investment return. The percentage remains PHP-based.");
  const rate=point?historicalGainFxRate(point):currentGainFxRate(fx);
  if(!rate){paragraphs.push("A verified FX rate aligned with this value is unavailable. Arbor doesn’t infer a rate from rounded balances.");return paragraphs;}
  const date=(value:string)=>new Date(value).toLocaleString("en-PH",{timeZone:"UTC",dateStyle:"medium",timeStyle:"short"})+" UTC";
  if(point?.origin==="reconstructed"){
    const quote=point.source_dates?.find(s=>s.price_key==="usd_php");
    paragraphs.push(`1 USD = ${rate} PHP. Historical source: BSP; observation date ${quote?.observation_date}; valuation date ${point.day}.`);
  }else if(point){paragraphs.push(`1 USD = ${rate} PHP. Rate captured with the snapshot on ${date(point.captured_at!)}. The original quote timestamp and provider aren’t stored in this snapshot.`);
  }else{paragraphs.push(`1 USD = ${rate} PHP. Source: ExchangeRate-API; quote dated ${date(fx!.as_of!)}; valuation date ${fx!.valuation_date}. This is a daily indicative equivalent, not a live brokerage rate.`);}
  return paragraphs;
}
