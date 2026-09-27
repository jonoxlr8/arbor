// Isolated PostgreSQL/WASM contract tests. Never connects to hosted Supabase.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const { PGlite } = createRequire(import.meta.url)(process.env.ARBOR_PGLITE_PATH);
const db = new PGlite();
const A = '00000000-0000-0000-0000-000000000001';
const B = '00000000-0000-0000-0000-000000000002';
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as
 $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to authenticated;
 insert into auth.users values('${A}'),('${B}');`);
for (const file of ['3u_b_live_portfolio.sql', '20260927180503_pending_investment_recordings.sql']) {
  await db.exec(await readFile(new URL(`../../migrations/${file}`, import.meta.url), 'utf8'));
}
async function identity(id = A, role = 'authenticated') {
  await db.exec(`reset role; set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
async function start(product = 'gotrade_vt', provider = 'gotrade') {
  return (await db.query('select public.arbor_start_pending_recording($1,$2) as item', [product, provider])).rows[0].item;
}
async function resolve(id, action = 'recorded') {
  return (await db.query('select public.arbor_resolve_pending_recording($1,$2) as item', [id, action])).rows[0].item;
}

test('explicit start deduplicates unresolved item and a later cycle gets a new item', async () => {
  await identity();
  assert.equal((await db.query('select count(*)::int as n from public.arbor_pending_investment_recordings')).rows[0].n, 0);
  const first = await start();
  assert.equal(first.status, 'pending');
  assert.equal((await start()).id, first.id);
  assert.equal((await resolve(first.id)).status, 'recorded');
  assert.equal((await resolve(first.id)).id, first.id);
  const later = await start();
  assert.notEqual(later.id, first.id);
  assert.equal((await resolve(later.id, 'dismissed')).status, 'dismissed');
  assert.equal((await db.query('select count(*)::int as n from public.arbor_portfolio_holdings')).rows[0].n, 0);
});

test('owner isolation, direct writes denied, and unsupported products rejected', async () => {
  await identity();
  const owned = await start('pdax_btc', 'pdax');
  await assert.rejects(start('gotrade_vt', 'pdax'), /unsupported_investment/);
  await assert.rejects(db.query(`insert into public.arbor_pending_investment_recordings(user_id,product_id,provider)
    values ($1,'gotrade_vt','gotrade')`, [A]), /permission denied/);
  await assert.rejects(db.query(`update public.arbor_pending_investment_recordings set status='dismissed' where id=$1`, [owned.id]), /permission denied/);
  await identity(B);
  assert.equal((await db.query('select count(*)::int as n from public.arbor_pending_investment_recordings')).rows[0].n, 0);
  await assert.rejects(resolve(owned.id), /pending_recording_conflict/);
  await identity(B, 'anon');
  await assert.rejects(start(), /permission denied/);
  await assert.rejects(db.query('select * from public.arbor_pending_investment_recordings'), /permission denied/);
});

test('resolution checks and database contract remain narrow', async () => {
  await identity();
  const item = await start('coins_btc', 'coins_ph');
  await assert.rejects(resolve(item.id, 'unknown'), /invalid_resolution/);
  await resolve(item.id, 'dismissed');
  await assert.rejects(resolve(item.id, 'recorded'), /pending_recording_conflict/);
  const details = (await db.query(`select relrowsecurity from pg_class where oid='public.arbor_pending_investment_recordings'::regclass`)).rows[0];
  assert.equal(details.relrowsecurity, true);
  const functions = (await db.query(`select proname, prosecdef, proconfig from pg_proc
    where proname in ('arbor_start_pending_recording','arbor_resolve_pending_recording') order by proname`)).rows;
  assert.equal(functions.length, 2);
  assert.ok(functions.every(row => row.prosecdef && String(row.proconfig).includes('search_path=')), JSON.stringify(functions));
});
