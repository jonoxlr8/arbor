// Isolated PostgreSQL/WASM only; no hosted connection.
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
const {PGlite}=createRequire(import.meta.url)(process.env.ARBOR_PGLITE_PATH);
const db=new PGlite();
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002';
await db.exec(`create role anon;create role authenticated;create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated;
insert into auth.users values('${A}'),('${B}');
create table public.profiles(user_id uuid primary key,strategy_engine_version text,currency text,v2_inputs jsonb);
insert into public.profiles values('${A}','2.0','PHP','{"selected_approach":"Growth","horizon":"ten_plus_years","high_interest_debt":"none"}'),('${B}','2.0','PHP','{"selected_approach":"Balanced","horizon":"ten_plus_years","high_interest_debt":"none"}');`);
await db.exec(await readFile(new URL('../../migrations/20260924112421_3u_d_monthly_checkin.sql',import.meta.url),'utf8'));
const period=(await db.query("select to_char(clock_timestamp() at time zone 'UTC','YYYY-MM') as m")).rows[0].m;
async function identity(id){await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);}
async function call(action='read',month=null,amount=null){return (await db.query('select public.arbor_monthly_checkin($1,$2,$3) as result',[action,month,amount])).rows[0].result;}
test('owner read and positive decimal completion uses database time',async()=>{
 await identity(A);assert.equal((await call()).current,null);
 const row=(await call('complete',period,'5000.25')).current;
 assert.equal(row.amount_php,'5000.25');assert.equal(row.month,period);
 assert.ok(Math.abs(Date.now()-Date.parse(row.completed_at))<10000);
});
test('duplicate and concurrent retries cannot overwrite first completion',async()=>{
 await identity(A);await Promise.all(Array.from({length:10},()=>call('complete',period,'9999')));
 const s=await call();assert.equal(s.history.length,1);assert.equal(s.current.amount_php,'5000.25');
});
test('session timezone cannot change the canonical month or timestamp presentation',async()=>{
 await db.exec("set timezone='Pacific/Auckland'");const s=await call();
 assert.equal(s.month,period);assert.match(s.current.completed_at,/\+00:00$/);
 await db.exec("set timezone='UTC'");
});
test('cross-owner rows hidden; direct owner/timestamp/amount mutations denied',async()=>{
 await identity(B);assert.equal((await call()).history.length,0);
 assert.equal((await db.query('select * from public.arbor_monthly_checkins')).rows.length,0);
 for(const q of ["update public.arbor_monthly_checkins set amount_php=999",'delete from public.arbor_monthly_checkins',`insert into public.arbor_monthly_checkins values('${A}',current_date,1,now(),null)`])await assert.rejects(db.exec(q),/permission denied/);
 await call('complete',period,'200');await identity(A);assert.equal((await call()).current.amount_php,'5000.25');
});
test('undo is explicit retained state and permits corrected completion',async()=>{
 await identity(A);const s=await call('undo',period);assert.equal(s.current,null);assert.ok(s.history[0].undone_at);
 await call('undo',period);const corrected=await call('complete',period,'5500');assert.equal(corrected.current.amount_php,'5500');assert.equal(corrected.history.length,1);
});
test('wrong month and historical mutation rejected',async()=>{
 await identity(A);for(const month of ['2020-01','wrong',null,'2026-99'])await assert.rejects(call('complete',month,'1'),/Month changed/);
 await assert.rejects(call('undo','2020-01'),/Month changed/);
});
test('malformed, zero, infinite and excessively precise amounts rejected',async()=>{
 await identity(A);for(const amount of ['0','-1','NaN','Infinity','1.001','1000000000000',null])await assert.rejects(call('complete',period,amount),/Invalid amount/);
});
test('foundation, short-term and missing explicit plan fail through direct RPC',async()=>{
 for(const patch of [{high_interest_debt:'difficult_to_manage'},{horizon:'less_than_3_years'},{selected_approach:null}]){
  await db.exec('reset role');await db.query('update public.profiles set v2_inputs=$1 where user_id=$2',[JSON.stringify({selected_approach:'Growth',horizon:'ten_plus_years',high_interest_debt:'none',...patch}),B]);
  await identity(B);await assert.rejects(call('complete',period,'1'),/Profile does not permit/);
 }
});
test('old month stays historical and cannot satisfy current month',async()=>{
 await db.exec('reset role');await db.query("update public.arbor_monthly_checkins set month=date '2020-01-01' where user_id=$1",[A]);
 await identity(A);const s=await call();assert.equal(s.current,null);assert.equal(s.history[0].month,'2020-01');
});
test('anonymous and absent JWT denied; cascade removes only deleted owner',async()=>{
 await db.exec('reset role;set role anon');await assert.rejects(call(),/permission denied/);
 await identity('');await assert.rejects(call(),/Authentication required/);
 await db.exec('reset role');await db.query('delete from auth.users where id=$1',[A]);
 assert.equal((await db.query('select * from public.arbor_monthly_checkins where user_id=$1',[A])).rows.length,0);
 assert.equal((await db.query('select * from public.arbor_monthly_checkins where user_id=$1',[B])).rows.length,1);
});
test.after(()=>db.close());
