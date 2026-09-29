// Explicit local qualification against the six authorized TOAP exports and
// bounded genuine Marketstack, Coinranking, and BSP observations. Never hosted.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import test from 'node:test';

const expected={PGHOST:'127.0.0.1',PGPORT:'55444',PGDATABASE:'arbor_nav_test',PGUSER:'arbor_test'};
for(const [key,value] of Object.entries(expected))
  if(process.env[key]!==value) throw new Error(`Refusing database connection: ${key} must be ${value}`);
if(process.env.ARBOR_REAL_NAV_IMPORT_TEST!=='1') throw new Error('Real NAV local-test opt-in required');

const psql='/opt/homebrew/opt/postgresql@17/bin/psql';
const args=['-w','-X','-A','-t','-q','-v','ON_ERROR_STOP=1','-h',expected.PGHOST,
  '-p',expected.PGPORT,'-U',expected.PGUSER,'-d',expected.PGDATABASE];
function attempt(statement){return new Promise(resolve=>execFile(psql,[...args,'-c',statement],
  {timeout:60000,maxBuffer:8*1024*1024},(error,stdout,stderr)=>resolve({ok:!error,
    output:stdout.trim(),error:stderr.trim()})));}
async function sql(statement){const result=await attempt(statement);assert.equal(result.ok,true,result.error);return result.output;}
async function owner(id,statement){return sql(`begin;set local role authenticated;
  set local request.jwt.claim.sub='${id}';${statement};commit`);}
async function history(id){return JSON.parse(await owner(id,
  "select coalesce(jsonb_agg(p order by p->>'day'),'[]'::jsonb) from public.arbor_reconstructed_portfolio_history() p"));}
async function add(id,product,provider,day,units,cost){return JSON.parse(await owner(id,
  `select public.arbor_record_investment('${product}','${provider}','${day}',${units},${cost},'${randomUUID()}')`));}
async function point(id,day){return (await history(id)).find(item=>item.day===day);}

test('genuine imported NAVs and three other approved historical sources are present',async()=>{
  assert.equal(await sql("select count(*) from public.arbor_historical_market_observations where source='toap'"),'15635');
  assert.equal(await sql("select count(distinct price_key) from public.arbor_historical_market_observations where source='toap'"),'6');
  for(const [source,keys] of [['marketstack',3],['coinranking',1],['bsp',1]]){
    assert.equal(await sql(`select count(distinct price_key) from public.arbor_historical_market_observations where source='${source}'`),String(keys));
  }
  assert.equal(await sql("select count(*) from public.arbor_historical_market_observations where source='toap' and (kind<>'nav' or currency<>'PHP' or reference_id is null or unit_class is null)"),'0');
  assert.equal(await sql("select count(*) from public.arbor_historical_market_observations where source='toap' and observation_date in ('2026-09-29','2026-09-30')"),'0');
});

test('fund-only and ATRAM plus ETF use real NAV and BSP FX, never contribution cost as value',async()=>{
  const fund=randomUUID(),mixed=randomUUID();
  await sql(`insert into auth.users(id) values('${fund}'),('${mixed}')`);
  await add(fund,'gcash_global_equity','gcash','2026-08-18',2,1000);
  const nav=await sql("select value from public.arbor_historical_market_observations where price_key='gcash_global_equity' and observation_date='2026-08-18'");
  const expectedPhp=await sql(`select round(2*${nav}::numeric,2)::text`);
  const expectedUsd=await sql(`select round(2*${nav}::numeric/fx.value,2)::text from public.arbor_historical_market_observations fx where fx.price_key='usd_php' and fx.observation_date='2026-08-18'`);
  const fundPoint=await point(fund,'2026-08-18');
  assert.equal(fundPoint.value_php,expectedPhp);
  assert.equal(fundPoint.value_usd,expectedUsd);
  assert.equal(fundPoint.recorded_cost_php,'1000.00');
  assert.equal(fundPoint.source_dates.find(item=>item.source==='toap').observation_date,'2026-08-18');
  assert.equal(fundPoint.source_dates.find(item=>item.source==='bsp').observation_date,'2026-08-18');
  await add(mixed,'gcash_technology','gcash','2026-08-18',1,1000);
  await add(mixed,'gotrade_vt','gotrade','2026-08-18',1,1000);
  const expectedMixed=await sql(`select (round(nav.value,2)+round(etf.value*fx.value,2))::text
    from public.arbor_historical_market_observations nav
    join public.arbor_historical_market_observations etf on etf.price_key='gotrade_vt' and etf.observation_date=nav.observation_date
    join public.arbor_historical_market_observations fx on fx.price_key='usd_php' and fx.observation_date=nav.observation_date
    where nav.price_key='gcash_technology' and nav.observation_date='2026-08-18'`);
  assert.equal((await point(mixed,'2026-08-18')).value_php,expectedMixed);
});

test('BPI plus BTC and four-source mixed history use actual source dates and historical FX',async()=>{
  const bpi=randomUUID(),mixed=randomUUID();
  await sql(`insert into auth.users(id) values('${bpi}'),('${mixed}')`);
  await add(bpi,'dragonfi_defensive','dragonfi','2026-08-18',1,100);
  await add(bpi,'coins_btc','coins_ph','2026-08-18',0.01,1000);
  const expectedBpi=await sql(`select (round(nav.value,2)+round(btc.value*0.01,2))::text
    from public.arbor_historical_market_observations nav
    join public.arbor_historical_market_observations btc on btc.price_key='btc_php' and btc.observation_date=nav.observation_date
    where nav.price_key='dragonfi_defensive' and nav.observation_date='2026-08-18'`);
  assert.equal((await point(bpi,'2026-08-18')).value_php,expectedBpi);

  await add(mixed,'gcash_global_equity','gcash','2026-08-18',2,1000);
  await add(mixed,'gotrade_vt','gotrade','2026-08-18',1,1000);
  await add(mixed,'coins_btc','coins_ph','2026-08-18',0.01,1000);
  const result=await point(mixed,'2026-08-18');
  assert.equal(result.origin,'reconstructed');
  assert.deepEqual(new Set(result.source_dates.map(item=>item.source)),
    new Set(['toap','marketstack','coinranking','bsp']));
  const expected=await sql(`select (round(nav.value*2,2)+round(etf.value*fx.value,2)+round(btc.value*0.01,2))::text
    from public.arbor_historical_market_observations nav
    join public.arbor_historical_market_observations etf on etf.price_key='gotrade_vt' and etf.observation_date=nav.observation_date
    join public.arbor_historical_market_observations btc on btc.price_key='btc_php' and btc.observation_date=nav.observation_date
    join public.arbor_historical_market_observations fx on fx.price_key='usd_php' and fx.observation_date=nav.observation_date
    where nav.price_key='gcash_global_equity' and nav.observation_date='2026-08-18'`);
  assert.equal(result.value_php,expected);
  assert.ok(result.value_usd);
  assert.equal(result.source_dates.find(item=>item.source==='bsp').observation_date,'2026-08-18');
});

test('August 18 correction rebuilds All while its genuine observed snapshot stays immutable',async()=>{
  const id=randomUUID();
  await sql(`insert into auth.users(id) values('${id}')`);
  const entry=await add(id,'gcash_global_equity','gcash','2026-08-18',2,1000);
  await sql(`insert into public.arbor_portfolio_snapshots(user_id,day,value_php,captured_at)
    values('${id}','2026-09-29',99999,clock_timestamp())`);
  const before=await history(id);
  assert.equal(before[0].day,'2026-08-18');
  assert.equal(before.find(item=>item.day==='2026-09-29')?.origin,'observed');
  await owner(id,`select public.arbor_revise_investment('${entry.entry_id}',1,'2026-08-18',3,1500,false)`);
  const after=await history(id);
  assert.equal(after[0].day,'2026-08-18');
  assert.notEqual(after[0].value_php,before[0].value_php);
  assert.notEqual(after[0].value_usd,before[0].value_usd);
  assert.equal(after.some(item=>item.day==='2026-09-29' && item.origin==='observed'),false);
  assert.equal(await sql(`select value_php from public.arbor_portfolio_snapshots where user_id='${id}' and day='2026-09-29'`),'99999');
  assert.equal(await owner(id,"select superseded from public.arbor_portfolio_observed_history_status where day='2026-09-29'"),'t');
  assert.equal(await owner(id,"select min(affected_from) from public.arbor_portfolio_history_changes where reason='entry'"),'2026-08-18');
});

test('soft deletion retains audit row but removes the fund from owner activity and canonical history',async()=>{
  const id=randomUUID();
  await sql(`insert into auth.users(id) values('${id}')`);
  const entry=await add(id,'dragonfi_global_equity','dragonfi','2026-08-18',1,100);
  assert.ok(await point(id,'2026-08-18'));
  await owner(id,`select public.arbor_revise_investment('${entry.entry_id}',1,'2026-08-18',1,100,true)`);
  assert.equal(await sql(`select voided_at is not null from public.arbor_investment_entries where id='${entry.entry_id}'`),'t');
  assert.equal(await owner(id,"select count(*) from public.arbor_investment_entries where voided_at is null"),'0');
  assert.deepEqual(await history(id),[]);
});

test('a separate synthetic same-date NAV conflict rolls back without touching imported rows',async()=>{
  const statement=`begin;
    insert into public.arbor_historical_market_observations
      (price_key,observed_at,observation_date,value,source,currency,provenance,fetched_at,
       kind,unit_class,reference_id)
    values ('gcash_global_equity','2026-09-29T00:00:00+00','2026-09-29',123,'toap','PHP',
      'https://www.uitf.com.ph/daily_navpu_details.php?bank_id=31&fund_id=420',
      clock_timestamp(),'nav','PHP Unit Class',
      'ATRAM Global Equity Opportunity Feeder Fund (PHP Unit Class)');
    update public.arbor_historical_market_observations set value=124
      where price_key='gcash_global_equity' and observation_date='2026-09-29';
    commit;`;
  assert.equal((await attempt(statement)).ok,false);
  assert.equal(await sql("select count(*) from public.arbor_historical_market_observations where price_key='gcash_global_equity' and observation_date='2026-09-29'"),'0');
  assert.equal(await sql("select count(*) from public.arbor_historical_market_observations where source='toap'"),'15635');
});
