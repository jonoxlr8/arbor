import {boundedRequest} from "./dashboardConsistency";
import {addUnitTexts,manilaInvestmentToday} from "./investmentEntries";
import {datedInvestmentEntries} from "./portfolioActivity";
import {portfolioApi,type InvestmentEntry} from "./livePortfolio";

export const currentInvestmentMonth=(now=new Date())=>manilaInvestmentToday(now).slice(0,7);
const cents=(value:string)=>{
  if(!/^\d+(?:\.\d{1,2})?$/.test(value))throw new Error("Recorded PHP amount unavailable");
  const [whole,fraction=""]=value.split(".");return BigInt(whole)*BigInt(100)+BigInt(fraction.padEnd(2,"0"));
};
const text=(value:bigint)=>`${value/BigInt(100)}.${(value%BigInt(100)).toString().padStart(2,"0")}`;
export type HomeMonthTotal={month:string;amount:string;count:number;missing:number};
export function recordedMonthTotal(entries:InvestmentEntry[],month:string):HomeMonthTotal {
  if(entries.some(e=>!e.investment_date.startsWith(month+"-")))throw new Error("Unexpected investment month");
  const active=datedInvestmentEntries(entries);
  let amount="0";
  for(const row of active)if(row.amount_paid_php!==null){cents(row.amount_paid_php);amount=addUnitTexts(amount,row.amount_paid_php);}
  return {month,amount:text(cents(amount)),count:active.length,missing:active.filter(e=>e.amount_paid_php===null).length};
}
export function currentBudgetProgress(total:HomeMonthTotal,budget:number|null) {
  if(budget===null)return {status:"unset" as const,remaining:null};
  const target=cents(String(budget)),known=cents(total.amount);
  if(known>=target)return {status:"reached" as const,remaining:"0.00"};
  if(total.missing)return {status:"incomplete" as const,remaining:null};
  return {status:"remaining" as const,remaining:text(target-known)};
}
/** A visual ratio only when both the recorded total and a positive target are known. */
export function currentBudgetMeter(total:HomeMonthTotal,budget:number|null):number|null {
  if(budget===null || budget<=0 || total.missing)return null;
  const target=cents(String(budget)),known=cents(total.amount);
  const tenths=(known*BigInt(1000)+target/BigInt(2))/target;
  return Number(tenths>BigInt(1000)?BigInt(1000):tenths)/10;
}
// Offset pagination has no atomic snapshot. Two bounded complete matching reads
// detect ordinary concurrent changes; never claim real-time or atomic accuracy.
export async function readHomeMonth(userId:string,month:string,signal:AbortSignal,
  read=portfolioApi.activity):Promise<HomeMonthTotal> {
  return boundedRequest(async active=>{
  async function complete(){
    const rows:InvestmentEntry[]=[],ids=new Set<string>();
    for(let page=0;page<25;page++){
      active.throwIfAborted();const result=await read(userId,undefined,page,active,{month});
      if(result.page!==page||result.entries.length>20||result.has_more&&result.entries.length!==20)throw new Error("Incomplete recorded activity");
      for(const row of result.entries){if(ids.has(row.id)||!row.investment_date.startsWith(month+"-"))throw new Error("Inconsistent recorded activity");ids.add(row.id);rows.push(row);}
      if(!result.has_more)return rows;
    }
    throw new Error("Recorded activity exceeds summary limit");
  }
  const first=await complete(),second=await complete();active.throwIfAborted();
  const signature=(rows:InvestmentEntry[])=>JSON.stringify([...rows].sort((a,b)=>a.id.localeCompare(b.id)));
  if(signature(first)!==signature(second))throw new Error("Recorded activity changed");
  return recordedMonthTotal(first,month);
  },signal,20000);
}
