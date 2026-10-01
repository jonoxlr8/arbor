"use client";
import {useEffect,useState} from "react";
import {portfolioApi} from "@/lib/livePortfolio";
import {type MonthlyReviewData,reviewAmountLabel,reviewMonthLabel} from "@/lib/monthlyReview";
import {formatContributionMoney} from "@/lib/contributions";
import {investmentIdentity,providerName} from "@/lib/investmentIdentity";
import Sheet from "../ui/Sheet";
import InvestmentHistory from "./InvestmentHistory";
const money=(v:string)=>formatContributionMoney(v,"PHP");
export default function MonthlyReview({userId}:{userId:string}) {
  const [data,setData]=useState<MonthlyReviewData|null>(null),[month,setMonth]=useState<string>(),[error,setError]=useState(""),[retry,setRetry]=useState(0);
  const [all,setAll]=useState(false),[records,setRecords]=useState<{month:string;holdingId?:string}|null>(null);
  useEffect(()=>{const controller=new AbortController();
    portfolioApi.monthlyReview(userId,month,controller.signal).then(d=>{if(!controller.signal.aborted){setData(d);setError("");}})
      .catch(()=>{if(!controller.signal.aborted)setError("We couldn’t verify the complete recorded activity. Refresh this review to try again.");});
    return()=>controller.abort();},[userId,month,retry]);
  function change(value:string){setData(null);setError("");setAll(false);setMonth(value);}
  const maximum=Math.max(1,...(data?.pattern.map(p=>Number(p.amount_php??0))??[]));
  return <section className="monthly-review" aria-label="Your monthly review">
    <header className="review-heading"><div><span className="eyebrow">Recorded activity</span><h3>Your monthly review</h3><p>What you recorded adding, month by month.</p></div>
      {data&&<label>Review month<select value={data.month} onChange={e=>change(e.target.value)}>{data.available_months.map(m=><option key={m} value={m}>{reviewMonthLabel(m)}{m===data.current_month?" · In progress":""}</option>)}</select></label>}
    </header>
    {error?<div role="alert" className="review-notice">{error}<button className="entry-link min-h-11" onClick={()=>{setError("");setData(null);setRetry(v=>v+1);}}>Refresh review</button></div>:!data?<p role="status" className="review-notice">Loading recorded activity…</p>:<>
      <div className="review-layout"><div className="review-overview"><span className="review-period">{reviewMonthLabel(data.month)}{data.in_progress&&<span className="review-status">In progress</span>}</span>
        <p className="review-total">{data.amount_php===null?"—":money(data.amount_php)}</p><p className="review-total-label">{reviewAmountLabel(data)}</p>
        <p className="review-count">{data.record_count} dated {data.record_count===1?"record":"records"}{data.missing_amount_count?` · ${data.missing_amount_count} missing PHP amounts`:""}</p>
        <button className="entry-link min-h-11" onClick={()=>setRecords({month:data.month})}>View this month’s records →</button>
      </div><div className="review-breakdown"><h4>By investment</h4>
        {!data.breakdown.length?<p className="review-empty">No additions recorded for this month. This doesn’t mean you didn’t invest.</p>:<ul>{(all?data.breakdown:data.breakdown.slice(0,6)).map(row=><li key={row.holding_id}><button onClick={()=>setRecords({month:data.month,holdingId:row.holding_id})} aria-label={`View ${investmentIdentity(row.product_id).shortName} records for ${reviewMonthLabel(data.month)}`}><span><strong>{investmentIdentity(row.product_id).shortName}</strong><small>{providerName(row.provider)} · {row.record_count} {row.record_count===1?"record":"records"}</small></span><span className="review-row-amount">{row.amount_php===null?"Amount unknown":money(row.amount_php)}{row.missing_amount_count>0&&<small>Subtotal · {row.missing_amount_count} missing</small>}<small className="review-record-link">View records →</small></span></button></li>)}</ul>}
        {data.breakdown.length>6&&<button className="entry-link min-h-11" onClick={()=>setAll(v=>!v)}>{all?"Show fewer investments":`Show all ${data.breakdown.length} investments`}</button>}
      </div></div>
      <div className="review-pattern"><div><h4>Six-month recorded pattern</h4><p>PHP additions only. Not investment profit.</p></div>
        <div className="review-bars" role="group" aria-label="Six months of recorded additions">{data.pattern.map(p=><button key={p.month} className={p.month===data.month?"is-selected":""} onClick={()=>change(p.month)} aria-label={`${reviewMonthLabel(p.month)}: ${p.amount_php===null?reviewAmountLabel(p):money(p.amount_php)}${p.missing_amount_count?", subtotal with missing amounts":""}`} aria-pressed={p.month===data.month}>
          <span className="review-bar-space" aria-hidden="true"><span className={`review-bar ${p.amount_php===null?"is-unknown":""} ${p.missing_amount_count?"is-partial":""}`} style={{height:p.amount_php===null?"12px":`${Math.max(3,Number(p.amount_php)/maximum*100)}%`}}/></span><span>{reviewMonthLabel(p.month,true)}</span>{p.amount_php===null?<small>No total</small>:p.amount_php==="0.00"?<small>₱0</small>:null}
        </button>)}</div>
        <p className="review-chart-key">Striped bars have missing PHP amounts or no recorded total. See the exact amounts below.</p>
        <details className="review-pattern-values"><summary>See exact monthly amounts</summary><dl>{data.pattern.map(p=><div key={p.month}><dt>{reviewMonthLabel(p.month)}</dt><dd>{p.amount_php===null?reviewAmountLabel(p):money(p.amount_php)}{p.missing_amount_count>0&&<small>Subtotal · missing PHP amounts</small>}</dd></div>)}</dl></details>
      </div>
      <p className="review-footnote">Based on active dated additions recorded in Arbor, using their investment dates in the Philippine calendar. Corrections and deleted entries update this review. Check-ins and opening positions aren’t counted. Missing records or PHP amounts leave gaps; this isn’t your complete real-world deposit history.</p>
    </>}
    {records&&<Sheet title={`Records · ${reviewMonthLabel(records.month)}`} wide onClose={()=>setRecords(null)}><InvestmentHistory userId={userId} month={records.month} holdingId={records.holdingId}/></Sheet>}
  </section>;
}
