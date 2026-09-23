// Run with ARBOR_PGLITE_PATH pointing at an isolated @electric-sql/pglite install.
// Executes the actual unapplied migration in local PostgreSQL/WASM, never Supabase.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { PGlite } = require(process.env.ARBOR_PGLITE_PATH);
const A = '00000000-0000-0000-0000-000000000001';
const B = '00000000-0000-0000-0000-000000000002';
const db = new PGlite();
await db.exec(`create role anon; create role authenticated;
  create schema auth; create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated;
  insert into auth.users values ('${A}'), ('${B}');`);
await db.exec(await readFile(new URL('../../migrations/3u_a_ask_usage.sql', import.meta.url), 'utf8'));
async function identity(id) {
  await db.exec('reset role; set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
}
async function usage(consume = false) {
  return (await db.query('select public.arbor_ask_usage($1) as result', [consume])).rows[0].result;
}
test('read is owner scoped and does not create a row', async () => {
  await identity(A);
  assert.equal((await usage()).used, 0);
  assert.equal((await db.query('select * from public.arbor_ask_usage_monthly')).rows.length, 0);
});
test('atomic admission permits exactly ten successes, then denies without increment', async () => {
  await identity(A);
  const results = await Promise.all(Array.from({length:30}, () => usage(true)));
  assert.equal(results.filter(x => x.allowed).length, 10);
  assert.equal(results[9].remaining, 0);
  assert.equal(results[9].allowed, true); // The completed tenth response is retained.
  assert.deepEqual((await usage()).used, 10);
  assert.equal((await usage()).allowed, false);
});
test('another owner starts independently and cannot see the first owner', async () => {
  await identity(B);
  assert.equal((await usage()).used, 0);
  assert.equal((await usage(true)).used, 1);
  const rows = (await db.query('select * from public.arbor_ask_usage_monthly')).rows;
  assert.equal(rows.length, 1); assert.equal(rows[0].user_id, B);
});
test('authenticated users cannot insert, reset, delete or truncate usage', async () => {
  await identity(B);
  for (const sql of [
    'update public.arbor_ask_usage_monthly set successful_count=0',
    'delete from public.arbor_ask_usage_monthly',
    'truncate public.arbor_ask_usage_monthly',
    `insert into public.arbor_ask_usage_monthly values ('${A}', '2000-01-01', 0)`,
  ]) await assert.rejects(db.exec(sql), /permission denied/);
  assert.equal((await usage()).used, 1);
});
test('anonymous and missing identity denied; null operation denied', async () => {
  await db.exec('reset role; set role anon');
  await assert.rejects(usage(), /permission denied/);
  await identity(''); await assert.rejects(usage(), /Authentication required/);
  await identity(B); await assert.rejects(usage(null), /Invalid operation/);
});
test('period computed in UTC, old months do not consume this month', async () => {
  await db.exec(`reset role; insert into public.arbor_ask_usage_monthly values ('${B}', '2000-01-01', 10)`);
  await identity(B);
  await db.exec("set timezone='Pacific/Kiritimati'");
  const result = await usage();
  const now = (await db.query("select to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-01') as month")).rows[0].month;
  assert.equal(result.period, now); assert.equal(result.used, 1);
});
test('transaction rollback restores count; account deletion cascades', async () => {
  await identity(B);
  await db.exec('begin'); assert.equal((await usage(true)).used, 2); await db.exec('rollback');
  assert.equal((await usage()).used, 1);
  await db.exec(`reset role; delete from auth.users where id='${B}'`);
  assert.equal((await db.query(`select * from public.arbor_ask_usage_monthly where user_id='${B}'`)).rows.length, 0);
});
test.after(async () => { await db.close(); });
