"use client";
import {gainInfo} from "@/lib/gainInfo";
import type {GainDisplayFx,PortfolioHistory} from "@/lib/livePortfolio";
export default function GainInfo({currency,fx,point,coverage=[]}:{currency:"PHP"|"USD";fx?:GainDisplayFx|null;point?:PortfolioHistory|null;coverage?:string[]}) {
  return <details key={`${currency}-${point?.day??"current"}`} className="chart-gain-info" onKeyDown={event=>{
    if(event.key==="Escape"){event.stopPropagation();event.currentTarget.open=false;event.currentTarget.querySelector('summary')?.focus();}
  }}><summary aria-label={`About ${currency} gain and return`}><span aria-hidden="true">i</span></summary>
    <div className="chart-gain-info-body" role="note" tabIndex={0} aria-label={`${currency} gain explanation`}>
      <strong>{currency==="USD"?"USD equivalent of PHP gain":"About your recorded gain"}</strong>
      {gainInfo(currency,fx,point).map(text=><p key={text}>{text}</p>)}
      {coverage.map(text=><p key={text}>{text}</p>)}
    </div>
  </details>;
}
