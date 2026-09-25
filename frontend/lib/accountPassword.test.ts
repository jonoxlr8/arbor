import test from "node:test";
import assert from "node:assert/strict";
import type {SupabaseClient} from "@supabase/supabase-js";
import {changeAccountPassword} from "./accountPassword";
for(const mode of ["ok","wrong_owner","expired","denied"])test(`account password ${mode}`,async()=>{
  let writes=0;
  const client={auth:{getUser:async()=>({error:mode==="expired"?{}:null,data:{user:{id:mode==="wrong_owner"?"B":"A"}}}),updateUser:async()=>{writes++;return{error:mode==="denied"?{message:"sensitive internal error"}:null};}}} as unknown as SupabaseClient;
  const result=await changeAccountPassword(client,"A","fixture-password","fixture-password");
  assert.equal(result===null,mode==="ok");assert.equal(writes,["wrong_owner","expired"].includes(mode)?0:1);assert.doesNotMatch(result??"",/sensitive/);
});
test("account password validation rejects mismatch before any request",async()=>{
  assert.match((await changeAccountPassword({} as SupabaseClient,"A","long-password","different"))!,/don’t match/);
});
