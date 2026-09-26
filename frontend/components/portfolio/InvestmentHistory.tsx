"use client";
import {useEffect, useState} from "react";
import {portfolioApi, type InvestmentEntry} from "@/lib/livePortfolio";
import {investmentIdentity, providerName} from "@/lib/investmentIdentity";
import {formatContributionMoney} from "@/lib/contributions";

export default function InvestmentHistory({userId}: {userId:string}) {
  const [entries,setEntries]=useState<InvestmentEntry[]>([]);
  const [page,setPage]=useState(0);
  const [hasMore,setHasMore]=useState(false);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();
    portfolioApi.activity(userId,undefined,0,controller.signal).then(result=>{
      setEntries(result.entries);setHasMore(result.has_more);setPage(0);
    }).catch(()=>{if(!controller.signal.aborted)setError("Investment activity is temporarily unavailable.");});
    return ()=>controller.abort();
  },[userId]);
  async function more(){setBusy(true);try{const next=await portfolioApi.activity(userId,undefined,page+1);setEntries(old=>[...old,...next.entries]);setPage(page+1);setHasMore(next.has_more);}catch{setError("Couldn’t load more activity.");}finally{setBusy(false);}}
  return <section className="mt-6" aria-label="All investment activity"><h3 className="text-lg font-semibold">Dated investment activity</h3>
    <p className="mt-2 text-sm text-slate-600">Includes voided entries and positions no longer in current holdings. Investment dates are separate from the time you recorded them in Arbor.</p>
    {entries.map(e=><div className="activity-entry" key={e.id}><strong>{e.investment_date} · {investmentIdentity(e.product_id).shortName} · {providerName(e.provider)} {e.voided_at ? "· voided" : ""}</strong><small>{e.units} units · {e.amount_paid_php===null?"Actual cost not recorded":formatContributionMoney(e.amount_paid_php,"PHP")}</small></div>)}
    {!entries.length && !error && <p className="mt-3 text-sm text-slate-600">No dated additions recorded yet.</p>}
    {hasMore && <button type="button" className="entry-secondary mt-3 min-h-11 w-full" disabled={busy} onClick={()=>void more()}>Show more activity</button>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  </section>;
}
