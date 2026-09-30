"use client";
import {useEffect, useState} from "react";
import {portfolioApi, type InvestmentEntry} from "@/lib/livePortfolio";
import {investmentIdentity} from "@/lib/investmentIdentity";
import InvestmentIdentity from "../InvestmentIdentity";
import ProviderIdentity from "../ProviderIdentity";
import { datedInvestmentEntries, investmentEntryAction, investmentEntryCost, investmentEntryUnits } from "@/lib/portfolioActivity";

export default function InvestmentHistory({userId,onManage,canManage}: {userId:string;onManage?:(entry:InvestmentEntry)=>void;canManage?:(entry:InvestmentEntry)=>boolean}) {
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
  const visibleEntries=datedInvestmentEntries(entries);
  return <section className="mt-6" aria-label="All investment activity"><h3 className="text-lg font-semibold">Dated investment activity</h3>
    <p className="mt-2 text-sm text-slate-600">Includes positions no longer in current holdings. Investment dates are separate from the time you recorded them in Arbor.</p>
    {visibleEntries.map(e=><div className="activity-entry investment-line" key={e.id}><InvestmentIdentity product={e.product_id}/><div><strong>{e.investment_date} · {investmentEntryAction(e)} {investmentIdentity(e.product_id).shortName}</strong><ProviderIdentity provider={e.provider}/><small>{investmentEntryUnits(e)} · {investmentEntryCost(e)}</small>{onManage && canManage?.(e) && <button type="button" className="entry-link min-h-11" onClick={()=>onManage(e)}>Edit or delete</button>}</div></div>)}
    {!visibleEntries.length && !error && <p className="mt-3 text-sm text-slate-600">No dated additions recorded yet.</p>}
    {hasMore && <button type="button" className="entry-secondary mt-3 min-h-11 w-full" disabled={busy} onClick={()=>void more()}>Show more activity</button>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  </section>;
}
