// Actual isolated PostgreSQL/WASM function execution; no hosted access/secrets.
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const {PGlite}=createRequire(import.meta.url)(process.env.ARBOR_PGLITE_PATH);
const db=new PGlite();
const migration='20260925204248_allow_coinranking_540s_refresh.sql';
const sql=async name=>readFile(new URL(`../../migrations/${name}`,import.meta.url),'utf8');
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as
 $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to authenticated;`);
for(const name of ['3u_b_live_portfolio.sql','20260924070525_3u_b_5_manual_fund_values.sql','20260925114901_toap_nav_ingestion.sql'])
 await db.exec(await sql(name));

const metadata=async()=>({
 functions:(await db.query(`select proname,prosecdef,proconfig,proacl::text,proowner::text
 from pg_proc where oid in ('public.arbor_claim_market_refresh(text,integer)'::regprocedure,
 'public.arbor_capture_portfolio()'::regprocedure) order by proname`)).rows,
 tables:(await db.query(`select relname,relrowsecurity,relacl::text from pg_class
 where oid in ('public.arbor_market_prices'::regclass,'public.arbor_market_refresh'::regclass)
 order by relname`)).rows,
 snapshot:(await db.query("select pg_get_functiondef('public.arbor_capture_portfolio()'::regprocedure) as def")).rows,
});
const before=await metadata();
const oldDefinition=(await db.query("select pg_get_functiondef('public.arbor_claim_market_refresh(text,integer)'::regprocedure) as def")).rows[0].def;
await db.exec('set role service_role');
// Reproduce the production defect before applying the additive fix.
await assert.rejects(db.query("select public.arbor_claim_market_refresh('coinranking',540)"),/Invalid refresh cadence/);
await db.exec('reset role');
await db.exec(await sql(migration));
const after=await metadata();
const newDefinition=(await db.query("select pg_get_functiondef('public.arbor_claim_market_refresh(text,integer)'::regprocedure) as def")).rows[0].def;
const claim=async(source,seconds)=>(await db.query('select public.arbor_claim_market_refresh($1,$2) as ok',[source,seconds])).rows[0].ok;
async function fresh(){await db.exec('reset role;delete from public.arbor_market_refresh;set role service_role');}

test('only Coinranking minimum changes; ACL, owner, RLS, invoker/search_path and snapshot math unchanged',()=>{
 assert.equal(newDefinition,oldDefinition.replace("source_id='coinranking' then 600","source_id='coinranking' then 540"));
 assert.deepEqual(after,before);
 assert.equal(after.functions.find(f=>f.proname==='arbor_claim_market_refresh').prosecdef,false);
});

test('539 rejected without consuming a lease',async()=>{
 await fresh();await assert.rejects(claim('coinranking',539),/Invalid refresh cadence/);
 assert.equal((await db.query('select count(*)::int as n from public.arbor_market_refresh')).rows[0].n,0);
});
for(const seconds of [540,541])test(`${seconds} accepted when due; repeat claim throttled`,async()=>{
 await fresh();assert.equal(await claim('coinranking',seconds),true);
 assert.equal(await claim('coinranking',seconds),false);
});
test('exact 539-second early claim denied; 540-second due claim granted',async()=>{
 await fresh();await db.exec('begin');
 try{
  await db.exec("insert into public.arbor_market_refresh values('coinranking',now()-interval '539 seconds')");
  assert.equal(await claim('coinranking',540),false);
  await db.exec("update public.arbor_market_refresh set attempted_at=now()-interval '540 seconds'");
  assert.equal(await claim('coinranking',540),true);
  assert.equal(await claim('coinranking',540),false);
 }finally{await db.exec('rollback');}
});
test('repeat queued claims grant only one lease',async()=>{
 await fresh();const results=await Promise.all(Array.from({length:10},()=>claim('coinranking',540)));
 assert.equal(results.filter(Boolean).length,1);
});
for(const source of ['marketstack','exchangerate_api','atram_nav','bpi_nav'])test(`${source} retains 86400 minimum`,async()=>{
 await fresh();await assert.rejects(claim(source,86399),/Invalid refresh cadence/);
 assert.equal(await claim(source,86400),true);assert.equal(await claim(source,86400),false);
});
for(const source of ['atram_nav','bpi_nav'])test(`${source} preserves Philippine calendar-day lease`,async()=>{
 await fresh();await db.query(`insert into public.arbor_market_refresh values($1,
 date_trunc('day',now() at time zone 'Asia/Manila') at time zone 'Asia/Manila'-interval '1 second')`,[source]);
 assert.equal(await claim(source,86400),true);assert.equal(await claim(source,86400),false);
});
test('unsupported source remains rejected',async()=>{
 await fresh();await assert.rejects(claim('other',86400),/Invalid refresh cadence/);
});
for(const role of ['authenticated','anon'])test(`${role} cannot claim or write shared prices/leases`,async()=>{
 await db.exec(`reset role;set role ${role}`);
 for(const statement of [
  "select public.arbor_claim_market_refresh('coinranking',540)",
  "insert into public.arbor_market_prices(price_key,value,as_of,source) values('btc_php',1,now(),'coinranking')",
  "update public.arbor_market_prices set value=1", "delete from public.arbor_market_prices",
  "insert into public.arbor_market_refresh values('coinranking',now())",
  "update public.arbor_market_refresh set attempted_at=now()", "delete from public.arbor_market_refresh",
 ])await assert.rejects(db.exec(statement),/permission denied/);
});
test('trusted operator still writes exact Decimal observations',async()=>{
 await fresh();await db.exec(`insert into public.arbor_market_prices(price_key,value,as_of,source)
 values('btc_php',3123456.123456789012,now(),'coinranking')`);
 assert.equal((await db.query("select value::text as value from public.arbor_market_prices where price_key='btc_php'")).rows[0].value,'3123456.123456789012');
});
test('actual Python adapter interval is accepted by actual migrated SQL (not a mocked claim)',async()=>{
 const backend=fileURLToPath(new URL('../../',import.meta.url));
 const seconds=Number(execFileSync(`${backend}.venv/bin/python`,['-c',
  'from app.market_data.adapters import Coinranking; print(Coinranking.interval)'],{cwd:backend,env:{},encoding:'utf8'}).trim());
 assert.equal(seconds,540);await fresh();
 await assert.rejects(claim('coinranking',seconds-1),/Invalid refresh cadence/);
 assert.equal(await claim('coinranking',seconds),true);
});
test.after(()=>db.close());
