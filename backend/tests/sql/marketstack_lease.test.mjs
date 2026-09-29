// Isolated SQL contract test; never connects to hosted Supabase.
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const {PGlite}=createRequire(import.meta.url)(process.env.ARBOR_PGLITE_PATH);
const db=new PGlite();
const sql=async name=>readFile(new URL(`../../migrations/${name}`,import.meta.url),'utf8');
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as
 $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to authenticated;`);
for(const name of ['3u_b_live_portfolio.sql','20260924070525_3u_b_5_manual_fund_values.sql',
 '20260925114901_toap_nav_ingestion.sql','20260925204248_allow_coinranking_540s_refresh.sql'])
 await db.exec(await sql(name));
const metadata=async()=>(await db.query(`select prosecdef,proconfig,proacl::text,proowner::text
 from pg_proc where oid='public.arbor_claim_market_refresh(text,integer)'::regprocedure`)).rows[0];
const before=await metadata();
const oldDefinition=(await db.query("select pg_get_functiondef('public.arbor_claim_market_refresh(text,integer)'::regprocedure) as def")).rows[0].def;
await db.exec('set role service_role');
await assert.rejects(db.query("select public.arbor_claim_market_refresh('marketstack',21600)"),/Invalid refresh cadence/);
await db.exec('reset role');
await db.exec(await sql('20260929040800_marketstack_refresh_cadence.sql'));
const after=await metadata();
const newDefinition=(await db.query("select pg_get_functiondef('public.arbor_claim_market_refresh(text,integer)'::regprocedure) as def")).rows[0].def;
const claim=async(source,seconds)=>(await db.query('select public.arbor_claim_market_refresh($1,$2) as ok',[source,seconds])).rows[0].ok;
async function fresh(){await db.exec('reset role;delete from public.arbor_market_refresh;set role service_role');}

test('only Marketstack minimum changes; owner, ACL, invoker and search path are preserved',()=>{
 assert.equal(newDefinition,oldDefinition.replace("source_id='coinranking' then 540 else 86400",
  "source_id='coinranking' then 540 when source_id='marketstack' then 21600 else 86400"));
 assert.deepEqual(after,before);
 assert.equal(after.prosecdef,false);
});
test('Marketstack rejects shorter leases without writing, then grants a due six-hour lease',async()=>{
 await fresh();await assert.rejects(claim('marketstack',21599),/Invalid refresh cadence/);
 assert.equal((await db.query('select count(*)::int as n from public.arbor_market_refresh')).rows[0].n,0);
 assert.equal(await claim('marketstack',21600),true);
 assert.equal(await claim('marketstack',21600),false);
});
test('Marketstack due boundary and queued claims remain atomic',async()=>{
 await fresh();await db.exec('begin');
 try{
  await db.exec("insert into public.arbor_market_refresh values('marketstack',now()-interval '21599 seconds')");
  assert.equal(await claim('marketstack',21600),false);
  await db.exec("update public.arbor_market_refresh set attempted_at=now()-interval '21600 seconds'");
  assert.equal(await claim('marketstack',21600),true);
 }finally{await db.exec('rollback');}
 await fresh();const results=await Promise.all(Array.from({length:10},()=>claim('marketstack',21600)));
 assert.equal(results.filter(Boolean).length,1);
});
test('all other sources keep their approved minimum leases',async()=>{
 for(const [source,minimum] of [['coinranking',540],['exchangerate_api',86400],['atram_nav',86400],['bpi_nav',86400]]){
  await fresh();await assert.rejects(claim(source,minimum-1),/Invalid refresh cadence/);
  assert.equal(await claim(source,minimum),true);
 }
});
test('untrusted roles remain unable to claim or write market rows',async()=>{
 for(const role of ['authenticated','anon']){
  await db.exec(`reset role;set role ${role}`);
  await assert.rejects(claim('marketstack',21600),/permission denied/);
  await assert.rejects(db.exec("update public.arbor_market_prices set value=1"),/permission denied/);
  await assert.rejects(db.exec("update public.arbor_market_refresh set attempted_at=now()"),/permission denied/);
 }
});
test('Python Marketstack interval matches the SQL minimum',async()=>{
 const backend=fileURLToPath(new URL('../../',import.meta.url));
 const seconds=Number(execFileSync(`${backend}.venv/bin/python`,['-c',
  'from app.market_data.adapters import Marketstack; print(Marketstack.interval)'],
  {cwd:backend,env:{},encoding:'utf8'}).trim());
 assert.equal(seconds,21600);await fresh();
 assert.equal(await claim('marketstack',seconds),true);
});
test.after(()=>db.close());
