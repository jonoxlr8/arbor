// Actual unapplied migration, independent PostgreSQL 17 sessions, localhost only.
// The disposable database is provisioned separately by the local test runner.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

const expected = { PGHOST: '127.0.0.1', PGPORT: '55432',
  PGDATABASE: 'arbor_reminder_test_final', PGUSER: 'arbor_test' };
for (const [key, value] of Object.entries(expected)) {
  if (process.env[key] !== value) throw new Error(`Refusing non-disposable database: ${key} must be ${value}`);
}
if (process.env.ARBOR_LOCAL_REMINDER_TEST !== '1') throw new Error('Local reminder test opt-in required');
const args = ['-w', '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-h', expected.PGHOST,
  '-p', expected.PGPORT, '-U', expected.PGUSER, '-d', expected.PGDATABASE];
function attempt(statement) {
  return new Promise(resolve => execFile('psql', [...args, '-c', statement],
    { timeout: 30000, maxBuffer: 1024 * 1024 },
    (error, stdout, stderr) => resolve({ ok: !error, output: stdout.trim(), error: stderr.trim() })));
}
async function sql(statement) {
  const result = await attempt(statement);
  assert.equal(result.ok, true, result.error);
  return result.output;
}
function userSql(user, statement, role = 'authenticated') {
  return `begin; set local role ${role}; set local request.jwt.claim.sub='${user}'; ${statement}; commit;`;
}
const call = (user, statement, role = 'authenticated') => attempt(userSql(user, statement, role));
async function good(user, statement, role = 'authenticated') {
  const result = await call(user, statement, role);
  assert.equal(result.ok, true, result.error);
  return result.output;
}
async function owner() {
  const id = randomUUID();
  await sql(`insert into auth.users(id) values('${id}')`);
  return id;
}
const start = (product, provider) => `select public.arbor_start_pending_recording('${product}','${provider}')::text`;
const resolve = (id, status) => `select public.arbor_resolve_pending_recording('${id}','${status}')::text`;
const claim = () => call('', 'select public.arbor_claim_pending_recording_reminder()::text', 'service_role');
async function claimed() {
  const result = await claim();
  assert.equal(result.ok, true, result.error);
  return result.output ? JSON.parse(result.output) : null;
}
function prepare(item, fingerprint = 'a'.repeat(64)) {
  return `select public.arbor_prepare_pending_recording_reminder('${item.id}', '${item.claim_token}', '${fingerprint}')`;
}
function finish(item, result, message = null) {
  return `select public.arbor_finish_pending_recording_reminder('${item.id}', '${item.claim_token}',
    '${result}', ${message ? `'${message}'` : 'null'})`;
}
async function due(id, age = '24 hours 1 minute') {
  await sql(`update public.arbor_pending_investment_recordings set started_at=now()-interval '${age}' where id='${id}'`);
}

test('actual migration installed; eight independent PostgreSQL sessions overlap', async () => {
  assert.equal(await sql("select to_regclass('public.arbor_pending_recording_reminders') is not null"), 't');
  const sessions = await Promise.all(Array.from({ length: 8 }, () => sql('select pg_backend_pid(), pg_sleep(0.2)')));
  assert.equal(new Set(sessions.map(row => row.split('|')[0])).size, 8);
});

test('concurrent first pending starts deduplicate; resolved cycle can restart', async () => {
  for (let n = 0; n < 8; n++) {
    const user = await owner();
    const starts = await Promise.all([call(user, start('gotrade_vt', 'gotrade')),
      call(user, start('gotrade_vt', 'gotrade'))]);
    starts.forEach(result => assert.equal(result.ok, true, result.error));
    const first = JSON.parse(starts[0].output);
    assert.equal(JSON.parse(starts[1].output).id, first.id);
    assert.equal(await sql(`select count(*) from public.arbor_pending_investment_recordings
      where user_id='${user}' and status='pending'`), '1');
    await good(user, resolve(first.id, 'recorded'));
    const later = JSON.parse(await good(user, start('gotrade_vt', 'gotrade')));
    assert.notEqual(later.id, first.id);
  }
});

test('23h59 is ineligible; 24h eligible; one owner with three products yields one claim', async () => {
  const user = await owner();
  const ids = [];
  for (const [product, provider] of [['gotrade_vt', 'gotrade'],
    ['gotrade_vgt', 'gotrade'], ['pdax_btc', 'pdax']]) {
    ids.push(JSON.parse(await good(user, start(product, provider))).id);
  }
  await Promise.all(ids.map(id => due(id, '23 hours 59 minutes')));
  assert.equal(await claimed(), null);
  await Promise.all(ids.map(id => due(id)));
  const raced = await Promise.all([claim(), claim()]);
  raced.forEach(result => assert.equal(result.ok, true, result.error));
  assert.equal(raced.filter(result => result.output).length, 1);
  const item = JSON.parse(raced.find(result => result.output).output);
  assert.equal(await sql(`select count(*) from public.arbor_pending_investment_recordings
    where user_id='${user}' and reminder_delivery_id='${item.id}'`), '3');
  assert.equal(await good('', prepare(item), 'service_role'), 't');
  assert.equal(await good('', finish(item, 'sent', 'fake-provider-message'), 'service_role'), 't');
  assert.equal(await sql(`select count(*) from public.arbor_pending_investment_recordings
    where user_id='${user}' and reminder_sent_at is not null and status='pending'`), '3');
  assert.equal(await claimed(), null);
});

test('two eligible owners get separate claims; sent work does not re-claim', async () => {
  const owners = [await owner(), await owner()];
  for (const user of owners) {
    const id = JSON.parse(await good(user, start('gotrade_vt', 'gotrade'))).id;
    await due(id);
  }
  const first = await claimed();
  const second = await claimed();
  assert.notEqual(first.user_id, second.user_id);
  for (const item of [first, second]) {
    assert.equal(await good('', prepare(item), 'service_role'), 't');
    await good('', finish(item, 'sent', 'fake-id'), 'service_role');
  }
  assert.equal(await claimed(), null);
});

test('resolution and dismissal before preparation prevent a send', async () => {
  for (const resolution of ['recorded', 'dismissed']) {
    const user = await owner();
    const id = JSON.parse(await good(user, start('gotrade_vt', 'gotrade'))).id;
    await due(id);
    const item = await claimed();
    await good(user, resolve(id, resolution));
    assert.equal(await good('', prepare(item), 'service_role'), 'f');
    assert.equal(await sql(`select stopped_at is not null from public.arbor_pending_recording_reminders
      where id='${item.id}'`), 't');
    assert.equal(await claimed(), null);
  }
});

test('independent claim/resolve and claim/dismiss races never prepare a resolved item', async () => {
  for (const resolution of ['recorded', 'dismissed']) {
    for (let n = 0; n < 6; n++) {
      const user = await owner();
      const id = JSON.parse(await good(user, start('gotrade_vt', 'gotrade'))).id;
      await due(id);
      const [claimResult, resolveResult] = await Promise.all([
        claim(), call(user, resolve(id, resolution)),
      ]);
      assert.equal(claimResult.ok, true, claimResult.error);
      assert.equal(resolveResult.ok, true, resolveResult.error);
      if (claimResult.output) {
        const item = JSON.parse(claimResult.output);
        assert.equal(await good('', prepare(item), 'service_role'), 'f');
      }
      assert.equal(await sql(`select status from public.arbor_pending_investment_recordings
        where id='${id}'`), resolution);
      assert.equal(await sql(`select reminder_sent_at is null from public.arbor_pending_investment_recordings
        where id='${id}'`), 't');
    }
  }
});

test('failed and ambiguous attempts retain identity, delay retry, and stop after safe window', async () => {
  const user = await owner();
  const id = JSON.parse(await good(user, start('gotrade_vt', 'gotrade'))).id;
  await due(id);
  const first = await claimed();
  assert.equal(await good('', prepare(first), 'service_role'), 't');
  await good('', finish(first, 'retry'), 'service_role');
  assert.equal(await claimed(), null);
  await sql(`update public.arbor_pending_recording_reminders
    set next_attempt_at=now()-interval '1 second' where id='${first.id}'`);
  const second = await claimed();
  assert.equal(second.id, first.id);
  assert.notEqual(second.claim_token, first.claim_token);
  assert.equal(await good('', prepare(second), 'service_role'), 't');
  await good('', finish(second, 'retry'), 'service_role');
  await sql(`update public.arbor_pending_recording_reminders
    set next_attempt_at=now()-interval '1 second', first_attempt_at=now()-interval '23 hours 1 minute'
    where id='${first.id}'`);
  assert.equal(await claimed(), null);
  assert.equal(await sql(`select stopped_at is not null from public.arbor_pending_recording_reminders
    where id='${first.id}'`), 't');
  assert.equal(await sql(`select reminder_sent_at is null from public.arbor_pending_investment_recordings
    where id='${id}'`), 't');
});

test('payload changes stop retry; owner isolation and trusted grants hold', async () => {
  const a = await owner();
  const b = await owner();
  const id = JSON.parse(await good(a, start('gotrade_vt', 'gotrade'))).id;
  await due(id);
  assert.match((await call(b, resolve(id, 'dismissed'))).error, /pending_recording_conflict/);
  assert.equal(await good(b, `select count(*) from public.arbor_pending_investment_recordings
    where id='${id}'`), '0');
  assert.match((await call(a, 'select public.arbor_claim_pending_recording_reminder()')).error, /permission denied/);
  assert.match((await call(a, `update public.arbor_pending_investment_recordings
    set reminder_sent_at=now() where id='${id}'`)).error, /permission denied/);
  assert.match((await call(a, 'select * from public.arbor_pending_recording_reminders')).error, /permission denied/);
  assert.match((await call('', 'select * from public.arbor_pending_investment_recordings', 'anon')).error, /permission denied/);
  const first = await claimed();
  assert.equal(await good('', prepare(first, 'a'.repeat(64)), 'service_role'), 't');
  await good('', finish(first, 'retry'), 'service_role');
  await sql(`update public.arbor_pending_recording_reminders set next_attempt_at=now()-interval '1 second'
    where id='${first.id}'`);
  const second = await claimed();
  assert.equal(await good('', prepare(second, 'b'.repeat(64)), 'service_role'), 'f');
  assert.equal(await sql(`select stopped_at is not null from public.arbor_pending_recording_reminders
    where id='${first.id}'`), 't');
});

test('database constraints protect statuses, reminder ownership, and metadata', async () => {
  const a = await owner();
  const b = await owner();
  const aId = JSON.parse(await good(a, start('gotrade_vt', 'gotrade'))).id;
  const bId = JSON.parse(await good(b, start('gotrade_vt', 'gotrade'))).id;
  await due(aId);
  const item = await claimed();
  assert.match((await attempt(`update public.arbor_pending_investment_recordings
    set reminder_delivery_id='${item.id}' where id='${bId}'`)).error,
  /arbor_pending_reminder_owner_fk/);
  assert.match((await attempt(`update public.arbor_pending_investment_recordings
    set status='unknown' where id='${aId}'`)).error, /check constraint/);
  assert.match((await attempt(`update public.arbor_pending_investment_recordings
    set reminder_sent_at=now(), reminder_delivery_id=null where id='${aId}'`)).error,
  /arbor_pending_reminder_sent_check/);
  const grants = await sql(`select has_function_privilege('authenticated',
    'public.arbor_prepare_pending_recording_reminder(uuid,uuid,text)', 'execute'),
    has_function_privilege('anon', 'public.arbor_claim_pending_recording_reminder()', 'execute'),
    has_function_privilege('service_role', 'public.arbor_claim_pending_recording_reminder()', 'execute')`);
  assert.equal(grants, 'f|f|t');
});
