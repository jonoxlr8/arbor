// Real PostgreSQL 17 on a disposable localhost cluster only. Never hosted.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import test from 'node:test';

const expected={PGHOST:'127.0.0.1',PGPORT:'55444',PGDATABASE:'arbor_nav_test',PGUSER:'arbor_test'};
for(const [key,value] of Object.entries(expected))
  if(process.env[key]!==value) throw new Error(`Refusing database connection: ${key} must be ${value}`);
if(process.env.ARBOR_LOCAL_RECONSTRUCTION_TEST!=='1') throw new Error('Disposable reconstruction test opt-in required');
const psql='/opt/homebrew/opt/postgresql@17/bin/psql';
const args=['-w','-X','-A','-t','-q','-v','ON_ERROR_STOP=1','-h',expected.PGHOST,
  '-p',expected.PGPORT,'-U',expected.PGUSER,'-d',expected.PGDATABASE];
function attempt(statement){return new Promise(resolve=>execFile(psql,[...args,'-c',statement],
  {timeout:60000,maxBuffer:8*1024*1024},(error,stdout,stderr)=>resolve({ok:!error,
    output:stdout.trim(),error:stderr.trim()})));}
async function sql(statement){const result=await attempt(statement);assert.equal(result.ok,true,result.error);return result.output;}
const owner=(id,statement)=>attempt(`begin;set local role authenticated;
  set local request.jwt.claim.sub='${id}';${statement};commit`);
async function good(id,statement){const result=await owner(id,statement);assert.equal(result.ok,true,result.error);return result.output;}
async function rows(id){return JSON.parse(await good(id,
  "select coalesce(jsonb_agg(p order by p->>'day'),'[]'::jsonb) from public.arbor_reconstructed_portfolio_history() p"));}
const A=randomUUID(),B=randomUUID(),C=randomUUID(),D=randomUUID(),E=randomUUID(),F=randomUUID();
const source=(key,day,value,source,currency,at=`${day}T21:00:00+00`)=>
  `('${key}','${at}','${day}',${value},'${source}','${currency}',
    'https://example.test/${source}/historical-source','2026-09-29T23:00:00+00')`;

test('migration authority, shared cache restrictions, owner isolation',async()=>{
  assert.match(await sql('show server_version'),/^17\./);
  const tables=['arbor_historical_market_observations','arbor_historical_nonpublishing_days'];
  for(const table of tables){
    assert.equal(await sql(`select relrowsecurity from pg_class where oid='public.${table}'::regclass`),'t');
    assert.equal((await owner(A,`select count(*) from public.${table}`)).ok,false);
    assert.equal((await owner(A,`insert into public.${table} default values`)).ok,false);
  }
  assert.equal(await sql("select 'security_invoker=true'=any(reloptions) from pg_class where oid='public.arbor_portfolio_observed_history_status'::regclass"),'t');
  assert.equal(await sql("select 'search_path=\"\"'=any(proconfig) from pg_proc where oid='public.arbor_reconstructed_portfolio_history(integer,integer)'::regprocedure"),'t');
  assert.equal((await attempt('begin;set local role anon;select public.arbor_reconstructed_portfolio_history();rollback')).ok,false);
  await sql(`insert into auth.users(id) values('${A}'),('${B}'),('${C}'),('${D}'),('${E}'),('${F}')`);
  assert.deepEqual(await rows(B),[]);
});

test('founder August correction rebuilds All without rewriting an old snapshot',async()=>{
  await sql(`insert into public.arbor_historical_market_observations
    (price_key,observed_at,observation_date,value,source,currency,provenance,fetched_at) values
    ${source('gotrade_vt','2026-08-18',100,'marketstack','USD')},
    ${source('gotrade_vt','2026-08-19',110,'marketstack','USD')},
    ${source('usd_php','2026-08-18',50,'bsp','PHP','2026-08-18T00:00:00+00')},
    ${source('usd_php','2026-08-19',50,'bsp','PHP','2026-08-19T00:00:00+00')}
    on conflict do nothing`);
  const initial=JSON.parse(await good(A,`select public.arbor_record_investment(
    'gotrade_vt','gotrade','2026-08-18',1,5000,'${randomUUID()}')`));
  await sql(`insert into public.arbor_portfolio_snapshots(user_id,day,value_php,captured_at)
    values('${A}','2026-09-22',99999,clock_timestamp())`);
  const before=await rows(A);
  assert.equal(before[0].day,'2026-08-18');
  assert.equal(before[0].earliest_recorded_date,'2026-08-18');
  assert.equal(before[0].value_php,'5000.00');
  assert.equal(before[0].value_usd,'100.00');
  assert.equal(before.find(point=>point.day==='2026-09-22')?.origin,'observed');
  assert.equal((await good(A,"select count(*) from public.arbor_reconstructed_portfolio_history(0,1)")),'1');
  assert.equal((await good(A,"select (p->>'day') from public.arbor_reconstructed_portfolio_history(1,1) p")),'2026-08-19');
  await good(A,`select public.arbor_revise_investment('${initial.entry_id}',1,
    '2026-08-18',1,5000,true)`);
  await good(A,`select public.arbor_record_investment(
    'gotrade_vt','gotrade','2026-08-18',2,10000,'${randomUUID()}')`);
  const after=await rows(A);
  assert.equal(after[0].day,'2026-08-18');
  assert.equal(after[0].value_php,'10000.00');
  assert.equal(after[0].value_usd,'200.00');
  assert.equal(after[0].recorded_gain_php,'0.00');
  assert.equal(after.some(point=>point.day==='2026-09-22'),false);
  assert.equal(await sql(`select value_php from public.arbor_portfolio_snapshots
    where user_id='${A}' and day='2026-09-22'`),'99999');
  assert.equal(await sql(`select recorded_cost_php is null,usd_php_rate_at_capture is null
    from public.arbor_portfolio_snapshots where user_id='${A}' and day='2026-09-22'`),'t|t');
  assert.equal(await good(A,"select superseded from public.arbor_portfolio_observed_history_status where day='2026-09-22'"),'t');
  assert.equal(await good(B,'select count(*) from public.arbor_portfolio_observed_history_status'),'0');
  assert.equal((await owner(B,`update public.arbor_portfolio_snapshots set value_php=1 where user_id='${A}'`)).ok,false);
});

test('moved date invalidates from the old date, including observations before the new date',async()=>{
  const entry=JSON.parse(await good(B,`select public.arbor_record_investment(
    'gotrade_vt','gotrade','2026-08-18',1,5000,'${randomUUID()}')`));
  await sql(`insert into public.arbor_portfolio_snapshots(user_id,day,value_php,captured_at)
    values('${B}','2026-08-19',5500,clock_timestamp())`);
  await good(B,`select public.arbor_revise_investment('${entry.entry_id}',1,
    '2026-08-25',1,5000,false)`);
  assert.equal(await good(B,"select min(affected_from) from public.arbor_portfolio_history_changes where reason='entry'"),'2026-08-18');
  assert.equal(await good(B,"select superseded from public.arbor_portfolio_observed_history_status where day='2026-08-19'"),'t');
  assert.equal((await rows(B)).some(point=>point.day==='2026-08-19'),false);
});

test('weekend carries verified Friday ETF and BSP dates; weekdays and >4-day gaps fail closed',async()=>{
  await sql(`insert into public.arbor_historical_market_observations
    (price_key,observed_at,observation_date,value,source,currency,provenance,fetched_at) values
    ${source('gotrade_vgt','2026-09-24',100,'marketstack','USD')},
    ${source('gotrade_vgt','2026-09-25',110,'marketstack','USD')},
    ${source('usd_php','2026-09-24',50,'bsp','PHP','2026-09-24T00:00:00+00')},
    ${source('usd_php','2026-09-25',50,'bsp','PHP','2026-09-25T00:00:00+00')}
    on conflict do nothing`);
  await good(C,`select public.arbor_record_investment(
    'gotrade_vgt','gotrade','2026-09-24',1,5000,'${randomUUID()}')`);
  const points=await rows(C);
  assert.deepEqual(points.map(point=>point.day),
    ['2026-09-24','2026-09-25','2026-09-26','2026-09-27']);
  const sunday=points.at(-1);
  assert.equal(sunday.value_php,'5500.00');
  assert.ok(sunday.source_dates.every(source=>source.observation_date==='2026-09-25'
    && source.valuation_date==='2026-09-27'));
  assert.equal(points.some(point=>point.day==='2026-09-28'),false);
});

test('a confirmed Tuesday closure cannot bridge an unconfirmed missing Monday source day',async()=>{
  await sql(`insert into public.arbor_historical_nonpublishing_days(source,day,provenance)
    values('marketstack','2026-09-29','https://example.test/verified-closure'),
      ('bsp','2026-09-29','https://example.test/verified-closure') on conflict do nothing`);
  assert.equal((await rows(C)).some(point=>point.day==='2026-09-29'),false);
  await sql(`insert into public.arbor_historical_nonpublishing_days(source,day,provenance)
    values('marketstack','2026-09-28','https://example.test/verified-closure') on conflict do nothing`);
  assert.equal((await rows(C)).some(point=>point.day==='2026-09-29'),false,
    'missing BSP Monday still prevents a complete portfolio value');
  await sql(`insert into public.arbor_historical_nonpublishing_days(source,day,provenance)
    values('bsp','2026-09-28','https://example.test/verified-closure') on conflict do nothing`);
  assert.equal((await rows(C)).find(point=>point.day==='2026-09-29')?.value_php,'5500.00');
});

test('future-nearest BTC is rejected; unsupported historical fund blocks a partial total',async()=>{
  await sql(`insert into public.arbor_historical_market_observations
    (price_key,observed_at,observation_date,value,source,currency,provenance,fetched_at) values
    ${source('btc_php','2026-09-25',100000,'coinranking','PHP','2026-09-25T18:00:00+00')}
    on conflict do nothing`);
  await good(D,`select public.arbor_record_investment(
    'coins_btc','coins_ph','2026-09-24',0.01,1000,'${randomUUID()}')`);
  assert.equal((await rows(D)).some(point=>point.day==='2026-09-24'),false);
  assert.equal((await rows(D)).find(point=>point.day==='2026-09-25')?.value_php,'1000.00');
  await good(D,`select public.arbor_record_investment(
    'gcash_global_equity','gcash','2026-09-25',1,1000,'${randomUUID()}')`);
  assert.equal((await rows(D)).some(point=>point.day==='2026-09-25'),false);
});

test('six exact NAV classes support complete fund and mixed reconstruction without cost substitution',async()=>{
  const names={
    gcash_global_equity:['gcash','ATRAM Global Equity Opportunity Feeder Fund (PHP Unit Class)','PHP Unit Class',100],
    gcash_technology:['gcash','ATRAM Global Technology Feeder Fund (A PHP Unit Class)','A PHP Unit Class',200],
    gcash_defensive:['gcash','ATRAM Medium Term Peso Bond Fund (A Unit Class)','A Unit Class',300],
    dragonfi_global_equity:['dragonfi','BPI GLOBAL EQUITY FUND-OF-FUNDS CLASS P (PHP CLASS)','PHP / Class P',400],
    dragonfi_technology:['dragonfi','BPI WORLD TECHNOLOGY FEEDER FUND CLASS P (PHP CLASS)','PHP / Class P',500],
    dragonfi_defensive:['dragonfi','BPI PREMIUM BOND FUND','PHP',600],
  };
  const ownerId=randomUUID();
  await sql(`insert into auth.users(id) values('${ownerId}')`);
  for(const [product,[provider,name,unitClass,nav]] of Object.entries(names)){
    await sql(`insert into public.arbor_historical_market_observations
      (price_key,observed_at,observation_date,value,source,currency,provenance,fetched_at,
       kind,unit_class,reference_id) values
      ('${product}','2026-09-25T00:00:00+00','2026-09-25',${nav},'toap','PHP',
       'https://uitf.com.ph/daily_navpu.php?bank_id=${provider==='gcash'?31:3}',
       '2026-09-29T23:00:00+00','nav','${unitClass}','${name}')`);
    await good(ownerId,`select public.arbor_record_investment(
      '${product}','${provider}','2026-09-25',2,100,'${randomUUID()}')`);
  }
  const friday=(await rows(ownerId)).find(point=>point.day==='2026-09-25');
  assert.equal(friday.value_php,'4200.00');
  assert.equal(friday.recorded_cost_php,'600.00');
  assert.equal(friday.recorded_gain_php,'3600.00');
  assert.equal(friday.source_dates.filter(source=>source.source==='toap').length,6);
  const sunday=(await rows(ownerId)).find(point=>point.day==='2026-09-27');
  assert.equal(sunday.value_php,'4200.00');
  assert.ok(sunday.source_dates.filter(source=>source.source==='toap').every(source=>
    source.observation_date==='2026-09-25' && source.valuation_date==='2026-09-27'));
  assert.equal((await rows(ownerId)).some(point=>point.day==='2026-09-28'),false,
    'missing expected weekday NAV cannot be carried forward');
  assert.equal((await owner(ownerId,
    'select count(*) from public.arbor_historical_market_observations')).ok,false);

  const mixed=randomUUID();
  await sql(`insert into auth.users(id) values('${mixed}')`);
  await sql(`insert into public.arbor_historical_market_observations
    (price_key,observed_at,observation_date,value,source,currency,provenance,fetched_at) values
    ${source('gotrade_vt','2026-09-25',100,'marketstack','USD')},
    ${source('gotrade_vt','2026-09-24',100,'marketstack','USD')},
    ${source('usd_php','2026-09-24',50,'bsp','PHP','2026-09-24T00:00:00+00')},
    ${source('usd_php','2026-09-25',50,'bsp','PHP','2026-09-25T00:00:00+00')},
    ${source('btc_php','2026-09-25',100000,'coinranking','PHP','2026-09-25T18:00:00+00')}
    on conflict do nothing`);
  await good(mixed,`select public.arbor_record_investment('gotrade_vt','gotrade','2026-09-25',1,5000,'${randomUUID()}')`);
  await good(mixed,`select public.arbor_record_investment('coins_btc','coins_ph','2026-09-25',0.01,1000,'${randomUUID()}')`);
  await good(mixed,`select public.arbor_record_investment('gcash_technology','gcash','2026-09-25',2,100,'${randomUUID()}')`);
  assert.equal((await rows(mixed)).find(point=>point.day==='2026-09-25')?.value_php,'6400.00');
  const noNav=randomUUID();
  await sql(`insert into auth.users(id) values('${noNav}')`);
  await good(noNav,`select public.arbor_record_investment('gotrade_vt','gotrade','2026-09-24',1,5000,'${randomUUID()}')`);
  await good(noNav,`select public.arbor_record_investment('gcash_technology','gcash','2026-09-24',2,100,'${randomUUID()}')`);
  assert.equal((await rows(noNav)).some(point=>point.day==='2026-09-24'),false,
    'an owned fund without NAV blocks a partial ETF total');
});

test('same-date NAV is idempotent, a conflicting value fails without mutating provenance',async()=>{
  const identical=await attempt(`insert into public.arbor_historical_market_observations
    (price_key,observed_at,observation_date,value,source,currency,provenance,fetched_at,
     kind,unit_class,reference_id) values
    ('gcash_global_equity','2026-09-25T00:00:00+00','2026-09-25',100,'toap','PHP',
     'https://uitf.com.ph/daily_navpu.php?bank_id=31','2026-09-30T00:00:00+00',
     'nav','PHP Unit Class','ATRAM Global Equity Opportunity Feeder Fund (PHP Unit Class)')
    on conflict (price_key,observed_at) do update set value=excluded.value,
      fetched_at=excluded.fetched_at`);
  assert.equal(identical.ok,true,identical.error);
  const conflict=await attempt(`update public.arbor_historical_market_observations
    set value=999 where price_key='gcash_global_equity' and observation_date='2026-09-25'`);
  assert.equal(conflict.ok,false);
  assert.equal(await sql("select value from public.arbor_historical_market_observations where price_key='gcash_global_equity' and observation_date='2026-09-25'"),'100');
  assert.equal(await sql("select fetched_at at time zone 'UTC' from public.arbor_historical_market_observations where price_key='gcash_global_equity' and observation_date='2026-09-25'"),'2026-09-29 23:00:00');
});

test('out-of-order and same-day additions, unit edit and archived holding replay',async()=>{
  const first=JSON.parse(await good(E,`select public.arbor_record_investment(
    'gotrade_vt','gotrade','2026-08-19',1,5500,'${randomUUID()}')`));
  const second=JSON.parse(await good(E,`select public.arbor_record_investment(
    'gotrade_vt','gotrade','2026-08-18',2,10000,'${randomUUID()}')`));
  const third=JSON.parse(await good(E,`select public.arbor_record_investment(
    'gotrade_vt','gotrade','2026-08-18',1,5000,'${randomUUID()}')`));
  let points=await rows(E);
  assert.equal(points[0].day,'2026-08-18');
  assert.equal(points[0].value_php,'15000.00');
  assert.equal(points[0].recorded_gain_php,'0.00');
  assert.equal(points[1].day,'2026-08-19');
  assert.equal(points[1].value_php,'22000.00');
  assert.equal(points[1].recorded_cost_php,'20500.00');
  await good(E,`select public.arbor_revise_investment('${first.entry_id}',1,
    '2026-08-19',2,11000,false)`);
  points=await rows(E);
  assert.equal(points[1].value_php,'27500.00');
  assert.equal(points[1].recorded_cost_php,'26000.00');
  // The archived holding remains in ledger replay before its last entry is voided.
  const holding=await good(E,"select id from public.arbor_portfolio_holdings where product_id='gotrade_vt'");
  assert.ok(holding);
  assert.equal(await good(E,"select is_archived from public.arbor_portfolio_holdings where product_id='gotrade_vt'"),'f');
  await good(E,`select public.arbor_revise_investment('${first.entry_id}',2,
    '2026-08-19',2,11000,true)`);
  await good(E,`select public.arbor_revise_investment('${second.entry_id}',1,
    '2026-08-18',2,10000,true)`);
  await good(E,`select public.arbor_revise_investment('${third.entry_id}',1,
    '2026-08-18',1,5000,true)`);
  assert.equal(await good(E,"select is_archived from public.arbor_portfolio_holdings where product_id='gotrade_vt'"),'t');
  assert.deepEqual(await rows(E),[],'voided entries never remain in current-ledger reconstruction');
});

test('verified nonpublishing days honor four-day ceiling, missing FX leaves BTC PHP only',async()=>{
  await sql(`insert into public.arbor_historical_market_observations
    (price_key,observed_at,observation_date,value,source,currency,provenance,fetched_at) values
    ${source('gotrade_bnd','2026-09-18',80,'marketstack','USD')},
    ${source('usd_php','2026-09-18',50,'bsp','PHP','2026-09-18T00:00:00+00')},
    ${source('btc_php','2026-09-23',100000,'coinranking','PHP','2026-09-23T18:00:00+00')}
    on conflict do nothing`);
  await sql(`insert into public.arbor_historical_nonpublishing_days(source,day,provenance)
    select source,day,'https://example.test/verified-exchange-closure'
    from (values ('marketstack'::text,'2026-09-21'::date),('marketstack','2026-09-22'),
      ('marketstack','2026-09-23'),('bsp','2026-09-21'),('bsp','2026-09-22'),
      ('bsp','2026-09-23')) x(source,day) on conflict do nothing`);
  await good(F,`select public.arbor_record_investment(
    'gotrade_bnd','gotrade','2026-09-18',1,4000,'${randomUUID()}')`);
  let points=await rows(F);
  assert.equal(points.find(point=>point.day==='2026-09-22')?.value_php,'4000.00');
  assert.equal(points.some(point=>point.day==='2026-09-23'),false);
  assert.equal(points.find(point=>point.day==='2026-09-22')?.source_dates.every(source=>
    source.observation_date==='2026-09-18'),true);
  await good(F,`select public.arbor_record_investment(
    'coins_btc','coins_ph','2026-09-23',0.01,1000,'${randomUUID()}')`);
  points=await rows(F);
  assert.equal(points.some(point=>point.day==='2026-09-23'),false);
  assert.equal(points.find(point=>point.day==='2026-09-22')?.value_usd,'80.00');
  const btcOnly=randomUUID();
  await sql(`insert into auth.users(id) values('${btcOnly}')`);
  await good(btcOnly,`select public.arbor_record_investment(
    'coins_btc','coins_ph','2026-09-23',0.01,1000,'${randomUUID()}')`);
  const btcPoint=(await rows(btcOnly)).find(point=>point.day==='2026-09-23');
  assert.equal(btcPoint.value_php,'1000.00');
  assert.equal(btcPoint.value_usd,null);
  assert.equal(Date.parse(btcPoint.source_dates.find(source=>source.source==='coinranking').observed_at),
    Date.parse('2026-09-23T18:00:00+00:00'));
});

test('legacy unknown cost preserves value but not historical gain; undated opening fails closed',async()=>{
  const unknown=randomUUID(),opening=randomUUID();
  await sql(`insert into auth.users(id) values('${unknown}'),('${opening}')`);
  const entry=JSON.parse(await good(unknown,`select public.arbor_record_investment(
    'gotrade_vt','gotrade','2026-08-18',1,5000,'${randomUUID()}')`));
  await sql(`update public.arbor_investment_entries set amount_paid_php=null
    where id='${entry.entry_id}'`); // Simulated pre-enforcement legacy fact in disposable DB.
  const point=(await rows(unknown)).find(item=>item.day==='2026-08-18');
  assert.equal(point.value_php,'5000.00');
  assert.equal(point.cost_complete,false);
  assert.equal(point.recorded_gain_php,null);
  await good(opening,"insert into public.arbor_portfolio_holdings(product_id,provider,units,cost_basis_php) values('gotrade_vt','gotrade',1,5000)");
  assert.deepEqual(await rows(opening),[],'undated opening cannot imply an acquisition date');
  await sql(`insert into public.arbor_portfolio_snapshots(user_id,day,value_php,captured_at)
    values('${opening}','2026-08-19',5500,clock_timestamp())`);
  await good(opening,"delete from public.arbor_portfolio_holdings where product_id='gotrade_vt'");
  assert.equal(await good(opening,"select superseded from public.arbor_portfolio_observed_history_status where day='2026-08-19'"),'t');
  assert.deepEqual(await rows(opening),[],'removing an undated opening cannot leave a stale canonical snapshot');
});

test('year boundary, independent owner reads and idempotent reconstruction',async()=>{
  const yearOwner=randomUUID();
  await sql(`insert into auth.users(id) values('${yearOwner}')`);
  await sql(`insert into public.arbor_historical_market_observations
    (price_key,observed_at,observation_date,value,source,currency,provenance,fetched_at) values
    ${source('gotrade_bnd','2025-12-31',80,'marketstack','USD')},
    ${source('gotrade_bnd','2026-01-02',81,'marketstack','USD')},
    ${source('usd_php','2025-12-31',50,'bsp','PHP','2025-12-31T00:00:00+00')},
    ${source('usd_php','2026-01-02',50,'bsp','PHP','2026-01-02T00:00:00+00')}
    on conflict do nothing`);
  await sql(`insert into public.arbor_historical_nonpublishing_days(source,day,provenance)
    values('marketstack','2026-01-01','https://example.test/verified-closure'),
      ('bsp','2026-01-01','https://example.test/verified-closure') on conflict do nothing`);
  await good(yearOwner,`select public.arbor_record_investment(
    'gotrade_bnd','gotrade','2025-12-31',1,4000,'${randomUUID()}')`);
  await good(yearOwner,`select public.arbor_record_investment(
    'gotrade_bnd','gotrade','2026-01-01',1,4000,'${randomUUID()}')`);
  const first=await rows(yearOwner);
  assert.deepEqual(first.slice(0,3).map(point=>point.day),['2025-12-31','2026-01-01','2026-01-02']);
  assert.deepEqual(first.slice(0,3).map(point=>point.value_php),['4000.00','8000.00','8100.00']);
  assert.deepEqual(await rows(yearOwner),first,'derived reads are deterministic and create no rows');
  assert.equal((await rows(A)).some(point=>point.day==='2025-12-31'),false,'one owner cannot see another history');
});
