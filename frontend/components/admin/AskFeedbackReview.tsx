'use client';
import {useEffect,useState} from 'react';
import {adminFeedbackApi,TOPIC_LABELS,type FeedbackPage} from '@/lib/adminAskFeedback';
import {AdminAccessError} from '@/lib/ownerAdmin';
import {FEEDBACK_REASONS} from '@/lib/askPresentation';
export default function AskFeedbackReview({userId}:{userId:string}){
 const [page,setPage]=useState<FeedbackPage|null>(null),[offset,setOffset]=useState(0),[attempt,setAttempt]=useState(0),[busy,setBusy]=useState(true),[error,setError]=useState(''),[denied,setDenied]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();let active=true;
  async function load(){setBusy(true);setError('');setPage(null);setDenied(false);try{
   if(!await adminFeedbackApi.access(userId,controller.signal))throw new AdminAccessError('Feedback review is unavailable for this account.');
   const next=await adminFeedbackApi.list(userId,offset,controller.signal);if(active)setPage(next);
  }catch(e){if(active){setPage(null);setDenied(e instanceof AdminAccessError);setError(e instanceof Error?e.message:'Feedback review is unavailable.');}}finally{if(active)setBusy(false);}}
  void load();return()=>{active=false;controller.abort();};
 },[userId,offset,attempt]);
 return <section className="owner-admin" aria-label="Ask Arbor feedback review"><a className="entry-link min-h-11 inline-flex items-center" href="#settings">‹ Settings</a><p className="eyebrow">Owner only · Read only</p><h2>Ask Arbor feedback</h2><p className="admin-intro">Review explicit votes and the topics that need attention.</p>
 {busy&&<p role="status">Loading feedback…</p>}{error&&<p role="alert">{error}</p>}
 {!denied&&<button className="entry-link min-h-11" disabled={busy} onClick={()=>setAttempt(n=>n+1)}>Refresh feedback</button>}
 {page&&<><section className="admin-card"><h3>Feedback by topic</h3><p className="admin-note">All retained votes. Topics with the most Not helpful votes appear first; this is not an answer-accuracy score.</p>{page.topics.length===0?<p>No feedback recorded.</p>:<ul className="feedback-topic-list">{page.topics.map(t=><li key={t.intent}><strong>{TOPIC_LABELS[t.intent]}</strong><span>{t.not_helpful} Not helpful · {t.helpful} Helpful</span></li>)}</ul>}</section>
 <section className="admin-card"><h3>Recent feedback</h3>{page.items.length===0?<p>No feedback recorded.</p>:<ul className="feedback-vote-list">{page.items.map((r,i)=><li key={`${page.offset}-${i}`}><div><strong>{r.helpful?'Helpful':'Not helpful'}</strong><time dateTime={r.created_at}>{new Date(r.created_at).toLocaleString('en-PH',{timeZone:'Asia/Manila',day:'2-digit',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'})} PHT</time></div><p>{TOPIC_LABELS[r.intent]}</p><p className="admin-note">{r.reason?FEEDBACK_REASONS[r.reason]:'No reason selected'}</p></li>)}</ul>}
 <div className="admin-pagination">{page.offset>0&&<button className="entry-link min-h-11" disabled={busy} onClick={()=>setOffset(Math.max(0,page.offset-50))}>Previous</button>}{page.has_more&&page.offset<10000&&<button className="entry-link min-h-11" disabled={busy} onClick={()=>setOffset(page.offset+50)}>Next</button>}</div></section></>}
 </section>;
}
