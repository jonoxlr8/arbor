// Isolated PostgreSQL/WASM. No hosted access or credentials.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
const { PGlite } = createRequire(import.meta.url)(process.env.ARBOR_PGLITE_PATH);
const db = new PGlite();
const A='00000000-0000-0000-0000-000000000001', B='00000000-0000-0000-0000-000000000002';
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as
 $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to authenticated; insert into auth.users values('${A}'),('${B}');`);
for(const file of ['3u_b_live_portfolio.sql','20260924070525_3u_b_5_manual_fund_values.sql'])
  await db.exec(await readFile(new URL(`../../migrations/${file}`,import.meta.url),'utf8'));
async function identity(id=A){await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);}
async function value(v){return db.query('update public.arbor_portfolio_holdings set manual_value_php=$1',[v]);}
async function capture(){return (await db.query('select public.arbor_capture_portfolio() as ok')).rows[0].ok;}
async function fresh(){await db.exec('reset role;delete from public.arbor_portfolio_holdings;delete from public.arbor_market_prices;delete from public.arbor_portfolio_snapshots');await identity();}
const funds=[['gcash_global_equity','PHP Unit Class'],['gcash_technology','A PHP Unit Class'],['gcash_defensive','A Unit Class'],['dragonfi_global_equity','PHP / Class P'],['dragonfi_technology','PHP / Class P'],['dragonfi_defensive','PHP']];
async function add(product='gcash_global_equity',provider='gcash'){await db.query('insert into public.arbor_portfolio_holdings(product_id,provider,units) values($1,$2,10)',[product,provider]);}
for(const [product,unit] of funds)test(`${product}: exact money, server timestamp, own-only, clear keeps holding`,async()=>{
 await fresh();await add(product,product.split('_')[0]);await value('8000.25');
 const row=(await db.query('select * from public.arbor_portfolio_holding_values')).rows[0];
 assert.equal(row.manual_value_php,'8000.25');assert.ok(row.manual_value_updated_at);
 await identity(B);assert.equal((await db.query('select * from public.arbor_portfolio_holding_values')).rows.length,0);
 await value('1');await identity();assert.equal((await db.query('select manual_value_php::text as v from public.arbor_portfolio_holdings')).rows[0].v,'8000.25');
 assert.equal(await capture(),true);
 assert.equal((await db.query('select value_php from public.arbor_portfolio_history')).rows[0].value_php,'8000.25');
 await value(null);const cleared=(await db.query('select * from public.arbor_portfolio_holding_values')).rows;
 assert.equal(cleared.length,1);assert.equal(cleared[0].manual_value_php,null);assert.equal(cleared[0].manual_value_updated_at,null);
 assert.equal(await capture(),false);
});
test('numeric constraints, unsupported ETF/BTC and arbitrary products',async()=>{
 await fresh();await add();
 for(const v of ['0','-1','NaN','Infinity','-Infinity','10000000000000000','0.001'])await assert.rejects(value(v),/check constraint/);
 for(const [p,provider] of [['gotrade_vt','gotrade'],['gotrade_vgt','gotrade'],['gotrade_bnd','gotrade'],['pdax_btc','pdax'],['coins_btc','coins_ph'],['gcrypto_btc','gcrypto']]){
  await fresh();await add(p,provider);await assert.rejects(value('1'),/check constraint/);
 }
 await assert.rejects(add('arbitrary'),/foreign key/);
});
test('client cannot forge owner, update time, snapshot, cache or source',async()=>{
 await fresh();await add();
 for(const sql of ["update public.arbor_portfolio_holdings set manual_value_updated_at=now()",`update public.arbor_portfolio_holdings set user_id='${B}'`,"update public.arbor_market_prices set value=1","update public.arbor_portfolio_snapshots set value_php=1"])
  await assert.rejects(db.exec(sql),/permission denied/);
 await db.exec('reset role;set role anon');await assert.rejects(value('1'),/permission denied/);
});
test('same amount refreshes only on explicit value update; stale blocks snapshot',async()=>{
 await fresh();await add();await value('8000');
 await db.exec("reset role;update public.arbor_portfolio_holdings set manual_value_updated_at=now()-interval '8 days'");
 await identity();await db.exec('update public.arbor_portfolio_holdings set units=20');
 assert.equal(await capture(),false);
 await value('8000');assert.equal(await capture(),true);
 await value('9000');assert.equal(await capture(),true);
 assert.equal((await db.query('select value_php from public.arbor_portfolio_history')).rows[0].value_php,'8000.00');
});
for(const [product,unit] of funds)test(`${product}: canonical fresh wins, cached wins but blocks snapshot, expired falls back`,async()=>{
 await fresh();await add(product,product.split('_')[0]);await value('8000.25');
 await db.exec('reset role');
 const host=product.startsWith('gcash')?'atram.com.ph':'bpi.com.ph';
 await db.query("insert into public.arbor_market_prices(price_key,value,as_of,source,verified,currency,kind,unit_class,provenance) values($1,100,now(),'official_nav',true,'PHP','nav',$2,$3)",[product,unit,`https://${host}/fund`]);
 await identity();assert.equal(await capture(),true);
 assert.equal((await db.query('select value_php from public.arbor_portfolio_history')).rows[0].value_php,'1000.00');
 await db.exec("reset role;delete from public.arbor_portfolio_snapshots;update public.arbor_market_prices set as_of=now()-interval '3 days'");
 await identity();assert.equal(await capture(),false);
 await db.exec("reset role;update public.arbor_market_prices set as_of=now()-interval '8 days'");
 await identity();assert.equal(await capture(),true);
 assert.equal((await db.query('select value_php from public.arbor_portfolio_history')).rows[0].value_php,'8000.25');
});
test('wrong class/source rejected; fallback remains personal not shared',async()=>{
 await fresh();await add();await value('8000');await db.exec('reset role');
 await db.exec("insert into public.arbor_market_prices(price_key,value,as_of,source,verified,currency,kind,unit_class,provenance) values('gcash_global_equity',100,now(),'official_nav',true,'PHP','nav','USD','https://atram.com.ph/fund')");
 await identity();assert.equal(await capture(),true);
 assert.equal((await db.query('select value_php from public.arbor_portfolio_history')).rows[0].value_php,'8000.00');
 await identity(B);assert.equal((await db.query('select * from public.arbor_portfolio_history')).rows.length,0);
 await add();assert.equal(await capture(),false);
});
test('mixed manual, ETF/FX and BTC snapshots preserve exact accounting',async()=>{
 await fresh();await add();await value('8000.25');await add('gotrade_vt','gotrade');await add('pdax_btc','pdax');
 await db.exec("reset role;insert into public.arbor_market_prices(price_key,value,as_of,source,verified) values('gotrade_vt',100,now(),'fixture',true),('usd_php',50,now(),'fixture',true),('btc_php',1000,now(),'fixture',true)");
 await identity();assert.equal(await capture(),true);
 assert.equal((await db.query('select value_php from public.arbor_portfolio_history')).rows[0].value_php,'68000.25');
 await db.exec("reset role;update public.arbor_market_prices set as_of=now()-interval '11 minutes' where price_key='btc_php'");
 await identity();assert.equal(await capture(),false);
});
test.after(()=>db.close());
for(const [product] of funds)test(`${product}: value-only creation, NAV cannot invent units, later units activate NAV`,async()=>{
 await fresh();
 await db.query('insert into public.arbor_portfolio_holdings(product_id,provider,manual_value_php) values($1,$2,8000)',[product,product.split('_')[0]]);
 const row=(await db.query('select * from public.arbor_portfolio_holding_values')).rows[0];
 assert.equal(row.units,null);assert.equal(row.manual_value_php,'8000');
 await assert.rejects(value(null),/check constraint/);
 assert.equal(await capture(),true);
 await db.exec('reset role;delete from public.arbor_portfolio_snapshots');
 const unit=funds.find(x=>x[0]===product)[1],host=product.startsWith('gcash')?'atram.com.ph':'bpi.com.ph';
 await db.query("insert into public.arbor_market_prices(price_key,value,as_of,source,verified,currency,kind,unit_class,provenance) values($1,100,now(),'official_nav',true,'PHP','nav',$2,$3)",[product,unit,`https://${host}/fund`]);
 await identity();assert.equal(await capture(),true);
 assert.equal((await db.query('select value_php from public.arbor_portfolio_history')).rows[0].value_php,'8000.00');
 await db.exec('update public.arbor_portfolio_holdings set units=10');
 await value(null);
 await db.exec('reset role;delete from public.arbor_portfolio_snapshots');
 await identity();assert.equal(await capture(),true);
 assert.equal((await db.query('select value_php from public.arbor_portfolio_history')).rows[0].value_php,'1000.00');
 await assert.rejects(db.exec('update public.arbor_portfolio_holdings set units=null'),/check constraint/);
});
test('null units require a manual fund value, never ETF/BTC',async()=>{
 await fresh();
 for(const [product,provider] of [['gcash_global_equity','gcash'],['dragonfi_defensive','dragonfi'],['gotrade_vt','gotrade'],['pdax_btc','pdax']]){
  await assert.rejects(db.query('insert into public.arbor_portfolio_holdings(product_id,provider) values($1,$2)',[product,provider]),/check constraint/);
 }
 for(const [product,provider] of [['gotrade_vt','gotrade'],['pdax_btc','pdax']])
  await assert.rejects(db.query('insert into public.arbor_portfolio_holdings(product_id,provider,manual_value_php) values($1,$2,8000)',[product,provider]),/check constraint/);
});
