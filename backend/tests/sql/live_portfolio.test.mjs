// Isolated PostgreSQL/WASM only. No hosted credentials or network.
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
 $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
 grant usage on schema auth to authenticated;
 insert into auth.users values ('${A}'),('${B}');`);
await db.exec(await readFile(new URL('../../migrations/3u_b_live_portfolio.sql',import.meta.url),'utf8'));
async function identity(id) {
  await db.exec('reset role; set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
}
async function add(product='gotrade_vt',provider='gotrade',units='7.123456789012') {
  return db.query('insert into public.arbor_portfolio_holdings(product_id,provider,units) values($1,$2,$3)',[product,provider,units]);
}
test('normal owner CRUD, text-decimal precision and same-product duplicates',async()=>{
  await identity(A); await add();
  assert.equal((await db.query('select units from public.arbor_portfolio_holding_values')).rows[0].units,'7.123456789012');
  await assert.rejects(add(),/duplicate/);
  await db.exec("update public.arbor_portfolio_holdings set units=2,cost_basis_php=15.25");
  assert.equal((await db.query('select units from public.arbor_portfolio_holding_values')).rows[0].units,'2');
});
test('owner isolation in tables/views and client owner injection denied',async()=>{
  await identity(B);
  assert.equal((await db.query('select * from public.arbor_portfolio_holding_values')).rows.length,0);
  assert.equal((await db.query('update public.arbor_portfolio_holdings set units=99 returning id')).rows.length,0);
  await db.exec('delete from public.arbor_portfolio_holdings');
  await assert.rejects(db.exec(`insert into public.arbor_portfolio_holdings(user_id,product_id,provider,units) values('${A}','gotrade_vgt','gotrade',1)`),/permission denied/);
  await identity(A); assert.equal((await db.query('select units from public.arbor_portfolio_holding_values')).rows[0].units,'2');
});
test('quantity and allowlist enforced even through direct REST equivalent',async()=>{
  await identity(A);
  for(const amount of ['0','-1','NaN','Infinity','1000000000000','0.0000000000001'])
    await assert.rejects(add('gotrade_vgt','gotrade',amount),/check constraint/);
  await assert.rejects(add('AAPL'),/foreign key/);
  await assert.rejects(add('gotrade_vgt','gcash'),/foreign key/);
});
test('users cannot change shared prices, product universe or snapshots',async()=>{
  await identity(A);
  for(const sql of [
    "insert into public.arbor_market_prices values('usd_php',1,now(),'fake')",
    "update public.arbor_market_prices set value=1",
    "delete from public.arbor_market_prices",
    "insert into public.arbor_portfolio_products values('AAPL','gotrade','AAPL')",
    `insert into public.arbor_portfolio_snapshots values('${A}',current_date,999,now())`,
    "update public.arbor_portfolio_snapshots set value_php=0",
    "delete from public.arbor_portfolio_snapshots",
  ]) await assert.rejects(db.exec(sql),/permission denied/);
});
test('no snapshot for missing prices or empty owner; trusted prices use exact FX',async()=>{
  await identity(A);
  assert.equal((await db.query('select public.arbor_capture_portfolio() as ok')).rows[0].ok,false);
  await db.exec("reset role; insert into public.arbor_market_prices values('gotrade_vt',100.125,now(),'isolated fixture'),('usd_php',56.25,now(),'isolated fixture')");
  await identity(A);
  assert.equal((await db.query('select public.arbor_capture_portfolio() as ok')).rows[0].ok,true);
  const row=(await db.query('select * from public.arbor_portfolio_history')).rows[0];
  assert.equal(row.value_php,'11264.06');
  assert.equal(new Date(row.day).toISOString().slice(0,10),new Date().toISOString().slice(0,10));
  await identity(B);
  assert.equal((await db.query('select public.arbor_capture_portfolio() as ok')).rows[0].ok,false);
  assert.equal((await db.query('select * from public.arbor_portfolio_history')).rows.length,0);
});
test('first complete daily observation is idempotent; edits do not rewrite history',async()=>{
  await identity(A);
  await db.exec('update public.arbor_portfolio_holdings set units=3');
  await Promise.all(Array.from({length:12},()=>db.query('select public.arbor_capture_portfolio()')));
  const rows=(await db.query('select * from public.arbor_portfolio_history')).rows;
  assert.equal(rows.length,1); assert.equal(rows[0].value_php,'11264.06');
});
test('stale, future and partial quotes never create false snapshots',async()=>{
  await identity(B); await add('coins_btc','coins_ph','0.1');
  await db.exec("reset role; insert into public.arbor_market_prices values('btc_php',1000000,now()-interval '6 minutes','fixture')");
  await identity(B); assert.equal((await db.query('select public.arbor_capture_portfolio() as ok')).rows[0].ok,false);
  await db.exec('reset role');
  await assert.rejects(db.exec("update public.arbor_market_prices set as_of=now()+interval '1 hour'"),/check constraint/);
});
test('anonymous functions and missing identity denied; owner deletion cascades',async()=>{
  await db.exec('reset role; set role anon');
  await assert.rejects(db.query('select public.arbor_capture_portfolio()'),/permission denied/);
  await assert.rejects(db.query('select * from public.arbor_portfolio_holding_values'),/permission denied/);
  await identity(''); await assert.rejects(db.query('select public.arbor_capture_portfolio()'),/Authentication required/);
  await db.exec(`reset role; delete from auth.users where id='${A}'`);
  assert.equal((await db.query(`select * from public.arbor_portfolio_snapshots where user_id='${A}'`)).rows.length,0);
  assert.equal((await db.query(`select * from public.arbor_portfolio_holdings where user_id='${A}'`)).rows.length,0);
});
test.after(()=>db.close());
