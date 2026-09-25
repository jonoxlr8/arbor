// Isolated PostgreSQL/WASM only. No network credentials or hosted access.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
const {PGlite}=createRequire(import.meta.url)(process.env.ARBOR_PGLITE_PATH);
const db=new PGlite();
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002';
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as
 $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to authenticated;insert into auth.users values('${A}'),('${B}');`);
for(const file of ['3u_b_live_portfolio.sql','20260924070525_3u_b_5_manual_fund_values.sql','20260925114901_toap_nav_ingestion.sql','20260925204248_allow_coinranking_540s_refresh.sql'])
 await db.exec(await readFile(new URL(`../../migrations/${file}`,import.meta.url),'utf8'));
async function identity(id=A){await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);}
async function fresh(){await db.exec('reset role;delete from public.arbor_portfolio_holdings;delete from public.arbor_market_prices;delete from public.arbor_portfolio_snapshots;delete from public.arbor_market_refresh');await identity();}
async function capture(){return (await db.query('select public.arbor_capture_portfolio() as ok')).rows[0].ok;}
async function amount(){return (await db.query('select value_php from public.arbor_portfolio_history')).rows[0]?.value_php;}
const funds=[
 ['gcash_global_equity','PHP Unit Class','ATRAM Global Equity Opportunity Feeder Fund (PHP Unit Class)'],
 ['gcash_technology','A PHP Unit Class','ATRAM Global Technology Feeder Fund (A PHP Unit Class)'],
 ['gcash_defensive','A Unit Class','ATRAM Medium Term Peso Bond Fund (A Unit Class)'],
 ['dragonfi_global_equity','PHP / Class P','BPI GLOBAL EQUITY FUND-OF-FUNDS CLASS P (PHP CLASS)'],
 ['dragonfi_technology','PHP / Class P','BPI WORLD TECHNOLOGY FEEDER FUND CLASS P (PHP CLASS)'],
 ['dragonfi_defensive','PHP','BPI PREMIUM BOND FUND']];
async function seed(fund,age=0,overrides={}){
 const [product,unit,name]=fund;
 await db.exec('reset role;set role service_role');
 await db.query(`insert into public.arbor_market_prices(price_key,value,as_of,fetched_at,source,currency,kind,unit_class,provenance,reference_id,verified)
 values($1,123.123456789012,now()-make_interval(days=>$2),now(),$3,'PHP','nav',$4,$5,$6,true)`,
 [product,age,overrides.source??'toap',overrides.unit??unit,overrides.url??`https://uitf.com.ph/daily_navpu.php?bank_id=${product.startsWith('gcash')?'31':'3'}`,overrides.name??name]);
 await identity();
}
async function add(fund,units=10){await db.query('insert into public.arbor_portfolio_holdings(product_id,provider,units,manual_value_php) values($1,$2,$3,8000)',[fund[0],fund[0].split('_')[0],units]);}
for(const fund of funds)test(`${fund[0]}: TOAP NAV snapshot, manual-only, owner isolation`,async()=>{
 await fresh();await add(fund);await seed(fund);assert.equal(await capture(),true);assert.equal(await amount(),'1231.23');
 await identity(B);assert.equal(await capture(),false);assert.equal(await amount(),undefined);
 await identity();await db.exec('update public.arbor_portfolio_holdings set units=null');
 await db.exec('reset role;delete from public.arbor_portfolio_snapshots');await identity();
 assert.equal(await capture(),true);assert.equal(await amount(),'8000.00');
});
for(const age of [3,8])test(`NAV age ${age}: existing stale and manual fallback rules`,async()=>{
 await fresh();await add(funds[0]);await seed(funds[0],age);
 assert.equal(await capture(),age===8);assert.equal(await amount(),age===8?'8000.00':undefined);
});
for(const overrides of [{name:'ATRAM Global Equity Opportunity Feeder Fund (USD Unit Class)'},{url:'https://uitf.com.ph/daily_navpu.php?bank_id=3'},{url:'https://uitf.com.ph/daily_navpu.php?bank_id=31&extra=1'},{unit:'USD'},{source:'untrusted'}])test(`wrong TOAP identity falls back: ${JSON.stringify(overrides)}`,async()=>{
 await fresh();await add(funds[0]);await seed(funds[0],0,overrides);
 assert.equal(await capture(),true);assert.equal(await amount(),'8000.00');
});
test('only case and whitespace name normalization accepted',async()=>{
 await fresh();await add(funds[5]);await seed(funds[5],0,{name:'\t bpi   premium bond fund \n '});
 assert.equal(await capture(),true);assert.equal(await amount(),'1231.23');
});
test('existing official operator NAV snapshot unchanged',async()=>{
 await fresh();await add(funds[0]);await seed(funds[0],0,{source:'official_nav',url:'https://www.atram.com.ph/fund'});
 assert.equal(await capture(),true);assert.equal(await amount(),'1231.23');
});
test('ordinary clients cannot write cache or claim leases; service role daily only',async()=>{
 await fresh();await seed(funds[0]);
 for(const role of ['authenticated','anon']){
  await db.exec(`reset role;set role ${role}`);
  for(const sql of ["update public.arbor_market_prices set value=1","delete from public.arbor_market_prices","insert into public.arbor_market_prices(price_key,value,as_of,source) values('gotrade_vt',1,now(),'toap')","select public.arbor_claim_market_refresh('atram_nav',86400)","update public.arbor_market_refresh set attempted_at=now()"])
   await assert.rejects(db.exec(sql),/permission denied/);
 }
 await db.exec('reset role;set role service_role');
 for(const source of ['atram_nav','bpi_nav']){
  await assert.rejects(db.query('select public.arbor_claim_market_refresh($1,86399)',[source]),/Invalid refresh cadence/);
  assert.equal((await db.query('select public.arbor_claim_market_refresh($1,86400) as ok',[source])).rows[0].ok,true);
  assert.equal((await db.query('select public.arbor_claim_market_refresh($1,86400) as ok',[source])).rows[0].ok,false);
 }
 await assert.rejects(db.query("select public.arbor_claim_market_refresh('other',86400)"),/Invalid refresh cadence/);
});
test('atomic upsert guards older and equal-date automatic writes, permits newer auto and same-date manual',async()=>{
 await fresh();await seed(funds[0],2,{source:'official_nav',url:'https://atram.com.ph/fund'});
 await db.exec('reset role;set role service_role');
 const old=(await db.query('select as_of from public.arbor_market_prices')).rows[0].as_of;
 async function write(source,date,value){await db.query(`insert into public.arbor_market_prices(price_key,value,as_of,source,verified)
 values('gcash_global_equity',$1,$2,$3,true) on conflict(price_key) do update set value=excluded.value,as_of=excluded.as_of,source=excluded.source`,[value,date,source]);}
 const read=async()=>(await db.query('select value::text as v from public.arbor_market_prices')).rows[0].v;
 await write('toap',old,'999');assert.equal(await read(),'123.123456789012');
 await write('toap',new Date(new Date(old).getTime()-86400000),'999');assert.equal(await read(),'123.123456789012');
 await write('official_nav',old,'124');assert.equal(await read(),'124');
 await write('toap',new Date(new Date(old).getTime()+86400000),'125');assert.equal(await read(),'125');
 await write('toap',old,'999');assert.equal(await read(),'125');
 await assert.rejects(write('toap',new Date(),0),/check constraint/);assert.equal(await read(),'125');
});
test('Philippine calendar-day lease tolerates scheduler jitter without extra same-day requests',async()=>{
 await fresh();await db.exec('reset role;set role service_role');
 await db.query("insert into public.arbor_market_refresh values('atram_nav',date_trunc('day',now() at time zone 'Asia/Manila') at time zone 'Asia/Manila'-interval '1 second')");
 assert.equal((await db.query("select public.arbor_claim_market_refresh('atram_nav',86400) as ok")).rows[0].ok,true);
 assert.equal((await db.query("select public.arbor_claim_market_refresh('atram_nav',86400) as ok")).rows[0].ok,false);
});
test('snapshot arithmetic and fallback clauses are byte-identical to 3U-B.5',async()=>{
 const base=await readFile(new URL('../../migrations/20260924070525_3u_b_5_manual_fund_values.sql',import.meta.url),'utf8');
 const next=await readFile(new URL('../../migrations/20260925114901_toap_nav_ingestion.sql',import.meta.url),'utf8');
 assert.equal(next.slice(next.indexOf(' ) n')),base.slice(base.indexOf(' ) n')));
});
test.after(()=>db.close());
