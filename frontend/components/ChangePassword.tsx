"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { changeAccountPassword } from "@/lib/accountPassword";
import { AuthEmblem } from "./AuthSurface";

export default function ChangePassword({userId}:{userId:string}) {
  const [password,setPassword]=useState(""),[confirmation,setConfirmation]=useState(""),[error,setError]=useState("");
  const [status,setStatus]=useState<"ready"|"saving"|"success">("ready");
  const busy=useRef(false),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  async function submit(event:FormEvent) {
    event.preventDefault();if(busy.current)return;busy.current=true;setStatus("saving");setError("");
    try {
      const {supabase}=await import("@/lib/supabase");
      const message=await changeAccountPassword(supabase,userId,password,confirmation);
      if(mounted.current){setError(message??"");setStatus(message?"ready":"success");if(!message){setPassword("");setConfirmation("");}}
    } catch {if(mounted.current){setError("We couldn’t confirm the change. Try again or request a reset link.");setStatus("ready");}}
    finally {busy.current=false;}
  }
  return <div className="auth-content account-password"><AuthEmblem/><h3>{status==="success"?"Password updated":"Change password"}</h3>
    {status==="success"?<p role="status">Your new password is ready to use the next time you sign in.</p>:<form onSubmit={submit} className="space-y-4"><p className="text-sm text-slate-600">Choose a unique password with at least 8 characters.</p><label className="block">New password<input required type="password" autoComplete="new-password" minLength={8} value={password} disabled={status==="saving"} onChange={e=>setPassword(e.target.value)}/></label><label className="block">Confirm new password<input required type="password" autoComplete="new-password" minLength={8} value={confirmation} disabled={status==="saving"} onChange={e=>setConfirmation(e.target.value)}/></label><button className="entry-primary w-full" disabled={status==="saving"}>{status==="saving"?"Updating…":"Update password"}</button>{error&&<p role="alert">{error}</p>}<a href="/forgot-password" className="entry-link">Use a secure reset link instead</a></form>}
  </div>;
}
