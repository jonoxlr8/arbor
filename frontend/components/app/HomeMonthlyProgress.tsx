"use client";
import {useEffect,useState} from "react";
import type {PlanV2} from "@/lib/types/planV2";
import {currentInvestmentMonth,currentBudgetProgress,currentBudgetMeter,readHomeMonth,type HomeMonthTotal} from "@/lib/homeMonthlyProgress";
import {reviewMonthLabel} from "@/lib/monthlyReview";
import {monthlyMoney} from "@/lib/monthlyPlan";
import HomeBudget from "./HomeBudget";
export default function HomeMonthlyProgress({value,userId,available,onPlanChange,refreshVersion=0}:{value:PlanV2;userId?:string;available:boolean;refreshVersion?:number;onPlanChange?:(plan:PlanV2)=>void}){
 const [month,setMonth]=useState(currentInvestmentMonth),[loaded,setLoaded]=useState<{key:string;total:HomeMonthTotal}|null>(null),[failed,setFailed]=useState<string|null>(null),[attempt,setAttempt]=useState(0);
 useEffect(()=>{const update=()=>{setMonth(currentInvestmentMonth());setAttempt(n=>n+1);};const visible=()=>{if(document.visibilityState==="visible")update();};
  const timer=setInterval(()=>{const next=currentInvestmentMonth();setMonth(previous=>previous===next?previous:next);},60000);
  document.addEventListener("visibilitychange",visible);window.addEventListener("arbor-investment-recorded",update);
  return()=>{clearInterval(timer);document.removeEventListener("visibilitychange",visible);window.removeEventListener("arbor-investment-recorded",update);};},[]);
 const readKey=`${userId}:${month}:${attempt}:${refreshVersion}`;
 const data=loaded?.key===readKey?loaded.total:null,error=failed===readKey;
 useEffect(()=>{if(!available||!userId)return;const controller=new AbortController();
  readHomeMonth(userId,month,controller.signal).then(next=>{if(!controller.signal.aborted&&currentInvestmentMonth()===month)setLoaded({key:readKey,total:next});})
    .catch(()=>{if(!controller.signal.aborted)setFailed(readKey);});return()=>controller.abort();},[available,userId,month,readKey]);
 const progress=data?currentBudgetProgress(data,value.profile.monthly_investment):null;
 const meter=data?currentBudgetMeter(data,value.profile.monthly_investment):null;
 return <section className="home-month-progress" aria-label="This month’s recorded progress"><header><div><p className="eyebrow">{reviewMonthLabel(month)}</p><h2>This month’s progress</h2></div><span className="review-status">In progress</span></header>
  {!available?<p>Investment tracking is unavailable right now.</p>:error?<div role="status"><p>Recorded progress is temporarily unavailable. No partial total is shown.</p><button className="entry-link min-h-11" onClick={()=>setAttempt(n=>n+1)}>Refresh progress</button></div>:!data?<p role="status">Checking this month’s recorded investments…</p>:<>
    <div className="home-progress-main"><strong className="home-financial-amount">{data.count===0?"No investment recorded":monthlyMoney(data.amount)}</strong>
      {data.count>0&&<p>{data.missing?"Known purchases · some PHP amounts are missing":"Recorded purchases this month"}</p>}
    </div>
  </>}
  <HomeBudget value={value} userId={userId} onPlanChange={onPlanChange} compact progress={data&&!error&&available?<>
    {meter!==null&&<div className="home-progress-meter" role="progressbar" aria-label="Recorded purchases against monthly target" aria-valuenow={meter} aria-valuemin={0} aria-valuemax={100}><span style={{width:`${meter}%`}}/></div>}
    <p className="home-progress-result">{progress?.status==="unset"?"Monthly budget not set":progress?.status==="reached"?"Target reached":progress?.status==="incomplete"?"Progress unavailable · PHP amounts are missing":`${monthlyMoney(progress!.remaining!)} left to reach your target`}</p>
    {value.profile.monthly_investment===0&&<p className="home-progress-zero">Your budget is explicitly set to ₱0.</p>}
  </>:undefined}/>
 </section>;
}
