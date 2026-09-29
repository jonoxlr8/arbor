// Real PostgreSQL 17, disposable localhost database only. Never hosted.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import test from 'node:test';

const expected={PGHOST:'127.0.0.1',PGPORT:'55442',PGDATABASE:'arbor_history_test',PGUSER:'arbor_test'};
for(const [key,value] of Object.entries(expected))
  if(process.env[key]!==value) throw new Error(`Refusing database connection: ${key} must be ${value}`);
if(process.env.ARBOR_LOCAL_HISTORY_TEST!=='1') throw new Error('Disposable history test opt-in required');
const args=['-w','-X','-A','-t','-q','-v','ON_ERROR_STOP=1','-h',expected.PGHOST,
  '-p',expected.PGPORT,'-U',expected.PGUSER,'-d',expected.PGDATABASE];
function attempt(statement){return new Promise(resolve=>execFile('psql',[...args,'-c',statement],
  {timeout:30000,maxBuffer:1024*1024},(error,stdout,stderr)=>resolve({ok:!error,
    output:stdout.trim(),error:stderr.trim()})));}
async function sql(statement){const result=await attempt(statement);assert.equal(result.ok,true,result.error);return result.output;}
const owner=(id,statement)=>attempt(`begin;set local role authenticated;
  set local request.jwt.claim.sub='${id}';${statement};commit`);
async function good(id,statement){const result=await owner(id,statement);assert.equal(result.ok,true,result.error);return result.output;}
const A=randomUUID(),B=randomUUID(),C=randomUUID(),D=randomUUID(),E=randomUUID(),F=randomUUID(),G=randomUUID();

test('migration keeps nullable old cost context, hardened capture and owner-only history',async()=>{
  await sql('delete from public.arbor_market_prices'); // Dedicated disposable database, reusable test run.
  assert.match(await sql('show server_version'),/^17\./);
  assert.equal(await sql("select column_default is null from information_schema.columns where table_schema='public' and table_name='arbor_portfolio_snapshots' and column_name='recorded_cost_php'"),'t');
  const metadata=(await sql(`select p.prosecdef,'search_path=""'=any(p.proconfig),
    has_function_privilege('authenticated',p.oid,'execute'),
    has_function_privilege('anon',p.oid,'execute')
    from pg_proc p where p.oid='public.arbor_capture_portfolio()'::regprocedure`)).split('|');
  assert.deepEqual(metadata,['t','t','t','f']);
  assert.equal(await sql("select 'security_invoker=true'=any(reloptions) from pg_class where oid='public.arbor_portfolio_history'::regclass"),'t');
  await sql(`insert into auth.users(id) values('${A}'),('${B}'),('${C}'),('${D}'),('${E}'),('${F}'),('${G}')`);
  await sql(`insert into public.arbor_portfolio_snapshots(user_id,day,value_php,captured_at)
    values('${A}',current_date-10,7000,now()-interval '10 days')`);
  assert.equal(await good(A,'select value_php,coalesce(recorded_cost_php,\'NULL\'),cost_complete,cost_context_captured from public.arbor_portfolio_history'), '7000|NULL|f|f');
  assert.equal(await good(A,'select usd_php_rate_at_capture is null from public.arbor_portfolio_snapshots'),'t');
  assert.equal(await good(A,'select value_usd is null from public.arbor_portfolio_history'),'t');
  assert.equal(await good(B,'select count(*) from public.arbor_portfolio_history'),'0');
  assert.equal((await owner(A,'update public.arbor_portfolio_snapshots set recorded_cost_php=1')).ok,false);
  assert.equal((await attempt('begin;set local role anon;select * from public.arbor_portfolio_history;rollback')).ok,false);
});

test('complete capture saves cost; contribution changes value, not gain; later price move creates gain',async()=>{
  await sql("insert into public.arbor_market_prices(price_key,value,as_of,source,currency,kind,verified) values('gotrade_vt',100,now(),'marketstack','USD','etf_eod',true),('usd_php',50,now(),'exchangerate_api','PHP','fx',true)");
  await good(A,"insert into public.arbor_portfolio_holdings(product_id,provider,units,cost_basis_php) values('gotrade_vt','gotrade',2,10000)");
  assert.match(await good(A,'select public.arbor_capture_portfolio()'),/t/);
  let row=(await good(A,"select value_php,recorded_cost_php,recorded_gain_php,recorded_gain_percentage from public.arbor_portfolio_history where day=current_date")).split('|');
  assert.deepEqual(row,['10000.00','10000','0.00','0.00']);
  assert.equal(await good(A,'select usd_php_rate_at_capture,value_usd from public.arbor_portfolio_snapshots s join public.arbor_portfolio_history v using(user_id,day) where day=current_date'),'50|200.00');
  await sql(`update public.arbor_portfolio_snapshots set day=current_date-2,captured_at=now()-interval '2 days' where user_id='${A}' and day=current_date`);
  await good(A,"update public.arbor_portfolio_holdings set units=3,cost_basis_php=15000");
  assert.match(await good(A,'select public.arbor_capture_portfolio()'),/t/);
  row=(await good(A,"select value_php,recorded_cost_php,recorded_gain_php from public.arbor_portfolio_history where day=current_date")).split('|');
  assert.deepEqual(row,['15000.00','15000','0.00']);
  assert.equal(await good(A,'select value_usd from public.arbor_portfolio_history where day=current_date'),'300.00');
  // A later genuine observation with only valuation movement shows PHP gain.
  await sql(`update public.arbor_portfolio_snapshots set day=current_date-1,captured_at=now()-interval '1 day' where user_id='${A}' and day=current_date`);
  await sql("update public.arbor_market_prices set value=110,as_of=now(),fetched_at=now() where price_key='gotrade_vt'");
  assert.match(await good(A,'select public.arbor_capture_portfolio()'),/t/);
  row=(await good(A,"select value_php,recorded_cost_php,recorded_gain_php,recorded_gain_percentage from public.arbor_portfolio_history where day=current_date")).split('|');
  assert.deepEqual(row,['16500.00','15000','1500.00','10.00']);
  assert.equal(await good(A,'select value_usd from public.arbor_portfolio_history where day=current_date'),'330.00');
  assert.equal(await good(A,"select string_agg(recorded_gain_php,',' order by day) from public.arbor_portfolio_history where day>=current_date-2"),'0.00,0.00,1500.00');
});

test('incomplete cost stays unknown; backdated entry cannot rewrite prior snapshot',async()=>{
  await good(B,"insert into public.arbor_portfolio_holdings(product_id,provider,units,cost_basis_php) values('gotrade_vt','gotrade',1,null)");
  assert.match(await good(B,'select public.arbor_capture_portfolio()'),/t/);
  assert.equal(await good(B,"select cost_complete,cost_context_captured,recorded_cost_php is null,recorded_gain_php is null from public.arbor_portfolio_history"),'f|t|t|t');
  const before=await good(A,"select value_php,recorded_cost_php from public.arbor_portfolio_history where day=current_date-2");
  const entry=await good(A,`select public.arbor_record_investment('coins_btc','coins_ph',current_date-20,0.001,100,
    '${randomUUID()}')::text`);
  assert.match(entry,/entry_id/);
  assert.equal(await good(A,"select value_php,recorded_cost_php from public.arbor_portfolio_history where day=current_date-2"),before);
  assert.equal(await good(A,"select count(*) from public.arbor_portfolio_history where day=current_date-20"),'0');
});

test('legacy zero holding cost does not become a fabricated historical gain',async()=>{
  await good(F,"insert into public.arbor_portfolio_holdings(product_id,provider,units,cost_basis_php) values('gotrade_vt','gotrade',1,0)");
  assert.match(await good(F,'select public.arbor_capture_portfolio()'),/t/);
  assert.equal(await good(F,'select cost_complete,cost_context_captured,recorded_cost_php is null,recorded_gain_php is null from public.arbor_portfolio_history'),'f|t|t|t');
});

test('independent concurrent captures create one first observation per UTC day',async()=>{
  await good(C,"insert into public.arbor_portfolio_holdings(product_id,provider,units,cost_basis_php) values('gotrade_vt','gotrade',1,5000)");
  const sessions=await Promise.all(Array.from({length:6},()=>good(C,'select pg_backend_pid(),pg_sleep(0.1)')));
  assert.equal(new Set(sessions.map(row=>row.split('|')[0])).size,6);
  const results=await Promise.all(Array.from({length:8},()=>owner(C,'select public.arbor_capture_portfolio()')));
  assert.ok(results.every(result=>result.ok));
  assert.equal(await good(C,'select count(*) from public.arbor_portfolio_history'),'1');
  assert.equal(await good(C,'select recorded_cost_php,recorded_gain_php,cost_complete from public.arbor_portfolio_history'),'5000|500.00|t');
});

test('PHP gain reflects FX movement even when USD ETF quote stays unchanged',async()=>{
  await good(D,"insert into public.arbor_portfolio_holdings(product_id,provider,units,cost_basis_php) values('gotrade_vt','gotrade',1,5500)");
  assert.match(await good(D,'select public.arbor_capture_portfolio()'),/t/);
  assert.equal(await good(D,'select recorded_gain_php from public.arbor_portfolio_history'),'0.00');
  await sql(`update public.arbor_portfolio_snapshots set day=current_date-1 where user_id='${D}'`);
  await sql("update public.arbor_market_prices set value=60,as_of=now(),fetched_at=now() where price_key='usd_php'");
  assert.match(await good(D,'select public.arbor_capture_portfolio()'),/t/);
  assert.equal(await good(D,"select value_php,recorded_cost_php,recorded_gain_php from public.arbor_portfolio_history where day=current_date"),'6600.00|5500|1100.00');
});

test('fresh exact-class fund NAV and personal manual value preserve captured cost',async()=>{
  await good(E,"insert into public.arbor_portfolio_holdings(product_id,provider,units,cost_basis_php,manual_value_php) values('gcash_global_equity','gcash',10,1000,1200)");
  await sql(`insert into public.arbor_market_prices(price_key,value,as_of,source,currency,kind,verified,unit_class,provenance,reference_id)
    values('gcash_global_equity',110,now(),'toap','PHP','nav',true,'PHP Unit Class',
      'https://uitf.com.ph/daily_navpu.php?bank_id=31','ATRAM Global Equity Opportunity Feeder Fund (PHP Unit Class)')`);
  assert.match(await good(E,'select public.arbor_capture_portfolio()'),/t/);
  assert.equal(await good(E,'select value_php,recorded_cost_php,recorded_gain_php from public.arbor_portfolio_history'),'1100.00|1000|100.00');
  await sql(`update public.arbor_portfolio_snapshots set day=current_date-1 where user_id='${E}'`);
  // The normal NAV precedence trigger rightly refuses a backwards-dated quote.
  // Replace only this disposable source fixture to simulate an expired feed.
  await sql("delete from public.arbor_market_prices where price_key='gcash_global_equity'");
  await sql(`insert into public.arbor_market_prices(price_key,value,as_of,source,currency,kind,verified,unit_class,provenance,reference_id)
    values('gcash_global_equity',110,now()-interval '8 days','toap','PHP','nav',true,'PHP Unit Class',
      'https://uitf.com.ph/daily_navpu.php?bank_id=31','ATRAM Global Equity Opportunity Feeder Fund (PHP Unit Class)')`);
  assert.match(await good(E,'select public.arbor_capture_portfolio()'),/t/);
  assert.equal(await good(E,"select value_php,recorded_gain_php from public.arbor_portfolio_history where day=current_date"),'1200.00|200.00');
});

test('PHP snapshot and complete cost survive missing FX without invented USD history',async()=>{
  await sql("delete from public.arbor_market_prices where price_key='usd_php'");
  await sql("insert into public.arbor_market_prices(price_key,value,as_of,source,currency,kind,verified,reference_id) values('btc_php',40000,now(),'coinranking','PHP','btc_reference',true,'btc')");
  await good(G,"insert into public.arbor_portfolio_holdings(product_id,provider,units,cost_basis_php) values('gcrypto_btc','gcrypto',0.01,300)");
  assert.match(await good(G,'select public.arbor_capture_portfolio()'),/t/);
  assert.equal(await good(G,'select value_php,recorded_cost_php,recorded_gain_php,value_usd is null from public.arbor_portfolio_history'),'400.00|300|100.00|t');
  assert.equal(await good(A,"select count(*) from public.arbor_portfolio_history where user_id='"+G+"'"),'0');
});
