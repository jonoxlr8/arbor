// Real multi-session qualification of the actual Arbor migration functions.
// Run ONLY against disposable localhost arbor_ledger_test after applying the
// repository migrations. Authentication is supplied by the local .pgpass file.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

const expected = { PGHOST: '127.0.0.1', PGPORT: '5432', PGDATABASE: 'arbor_ledger_test', PGUSER: 'arbor_test' };
for (const [key, value] of Object.entries(expected)) {
  if (process.env[key] !== value) throw new Error(`Refusing database connection: ${key} must be ${value}`);
}
if (process.env.ARBOR_LOCAL_LEDGER_TEST !== '1') throw new Error('Set ARBOR_LOCAL_LEDGER_TEST=1 for the disposable local database');

const args = ['-w', '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-h', expected.PGHOST,
  '-p', expected.PGPORT, '-U', expected.PGUSER, '-d', expected.PGDATABASE];
function attempt(statement) {
  return new Promise(resolve => {
    execFile('psql', [...args, '-c', statement], { timeout: 30000, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => resolve({ ok: !error, output: stdout.trim(), error: stderr.trim() }));
  });
}
async function sql(statement) {
  const result = await attempt(statement);
  assert.equal(result.ok, true, result.error);
  return result.output;
}
function auth(owner, statement, extra = '') {
  return `begin; set local role authenticated; set local request.jwt.claim.sub = '${owner}'; ${extra} ${statement}; commit;`;
}
const call = (owner, statement, extra = '') => attempt(auth(owner, statement, extra));
async function good(owner, statement, extra = '') {
  const result = await call(owner, statement, extra);
  assert.equal(result.ok, true, result.error);
  return result.output;
}
async function owner() {
  const id = randomUUID();
  await sql(`insert into auth.users(id) values ('${id}')`);
  return id;
}
function record(product, units, cost, key = randomUUID()) {
  return `select public.arbor_record_investment('${product}',
    '${product.startsWith('gotrade') ? 'gotrade' : product.startsWith('pdax') ? 'pdax' : 'gcrypto'}',
    (now() at time zone 'Asia/Manila')::date, ${units}, ${cost ?? 'null'}, '${key}')::text`;
}
function revise(entry, revision, units, cost, voided = false) {
  return `select public.arbor_revise_investment('${entry}', ${revision}, (now() at time zone 'Asia/Manila')::date,
    ${units ?? 'null'}, ${cost ?? 'null'}, ${voided})::text`;
}
async function position(user, product) {
  const row = await sql(`select h.id, h.units::text, coalesce(h.cost_basis_php::text,'NULL'),
    h.is_archived, (select count(*) from public.arbor_investment_entries e
      where e.holding_id=h.id and e.voided_at is null)
    from public.arbor_portfolio_holdings h where h.user_id='${user}' and h.product_id='${product}'`);
  return row ? row.split('|') : null;
}
async function entryIds(user, product) {
  const rows = await sql(`select e.id from public.arbor_investment_entries e
    join public.arbor_portfolio_holdings h on h.id=e.holding_id
    where e.user_id='${user}' and h.product_id='${product}' order by e.recorded_at,e.id`);
  return rows ? rows.split('\n') : [];
}
async function invariant(user) {
  const result = await sql(`with checked as (
    select h.id, h.units = h.opening_units + x.active_units as units_ok,
      h.cost_basis_php is not distinct from
        (case when h.opening_units + x.active_units=0 or
          (h.opening_units>0 and h.opening_cost_php is null) or x.unknown_cost
          then null else coalesce(h.opening_cost_php,0)+x.active_cost end) as cost_ok,
      h.is_archived = (h.units=0) as archive_ok
    from public.arbor_portfolio_holdings h
    cross join lateral (select coalesce(sum(e.units),0) active_units,
      coalesce(sum(e.amount_paid_php),0) active_cost,
      coalesce(bool_or(e.amount_paid_php is null),false) unknown_cost
      from public.arbor_investment_entries e where e.holding_id=h.id and e.voided_at is null) x
    where h.user_id='${user}'
  ) select count(*), coalesce(bool_and(units_ok),true), coalesce(bool_and(cost_ok),true),
    coalesce(bool_and(archive_ok),true),
    (select count(*) from public.arbor_investment_entries e
      left join public.arbor_portfolio_holdings h on h.id=e.holding_id
      where e.user_id='${user}' and h.id is null) from checked`);
  const parts = result.split('|');
  assert.deepEqual(parts.slice(1), ['t', 't', 't', '0'], `aggregate invariant: ${result}`);
  return Number(parts[0]);
}

test('actual migration is loaded and eight independent PostgreSQL sessions overlap', async () => {
  assert.equal(await sql("select to_regclass('public.arbor_investment_entries') is not null"), 't');
  const sessions = await Promise.all(Array.from({ length: 8 }, () =>
    sql('select pg_backend_pid(), pg_sleep(0.3)')));
  assert.equal(new Set(sessions.map(s => s.split('|')[0])).size, 8);
});

test('12 concurrent first-addition races create one exact position and two entries', async () => {
  for (let n = 0; n < 12; n++) {
    const user = await owner();
    const results = await Promise.all([
      call(user, record('gotrade_vt', '1.234567890123', '100.12')),
      call(user, record('gotrade_vt', '0.765432109877', '75.25')),
    ]);
    for (const result of results) assert.equal(result.ok, true, result.error);
    const row = await position(user, 'gotrade_vt');
    assert.equal(row[1], '2.000000000000');
    assert.equal(row[2], '175.37');
    assert.equal(row[4], '2');
    assert.equal(await invariant(user), 1);
  }
});

test('eight concurrent repeat additions preserve every unit and cost', async () => {
  const user = await owner();
  await good(user, record('gotrade_vgt', '1', '100'));
  const results = await Promise.all(Array.from({ length: 8 }, () =>
    call(user, record('gotrade_vgt', '0.125', '10.01'))));
  for (const result of results) assert.equal(result.ok, true, result.error);
  const row = await position(user, 'gotrade_vgt');
  assert.equal(row[1], '2.000');
  assert.equal(row[2], '180.08');
  assert.equal(row[4], '9');
  assert.equal(await invariant(user), 1);
});

test('same-key retry races mutate once; conflicting payload races preserve the winner', async () => {
  const user = await owner();
  const key = randomUUID();
  const results = await Promise.all([call(user, record('pdax_btc', '0.001', '50', key)),
    call(user, record('pdax_btc', '0.001', '50', key))]);
  const replies = results.map(r => { assert.equal(r.ok, true, r.error); return JSON.parse(r.output); });
  assert.equal(replies[0].entry_id, replies[1].entry_id);
  assert.deepEqual(replies.map(r => r.replayed).sort(), [false, true]);
  assert.equal((await position(user, 'pdax_btc'))[4], '1');
  for (let n = 0; n < 8; n++) {
    const other = await owner();
    const conflictKey = randomUUID();
    const race = await Promise.all([
      call(other, record('pdax_btc', '0.002', '20', conflictKey)),
      call(other, record('pdax_btc', '0.003', '30', conflictKey)),
    ]);
    assert.equal(race.filter(r => r.ok).length, 1);
    assert.match(race.find(r => !r.ok).error, /idempotency_conflict/);
    const winningUnits = race[0].ok ? '0.002' : '0.003';
    const row = await position(other, 'pdax_btc');
    assert.equal(row[1], winningUnits);
    assert.equal(row[4], '1');
    await invariant(other);
  }
  await invariant(user);
});

test('edit/edit and edit/void reject stale revisions; add/void reconciles exactly', async () => {
  const a = await owner();
  await good(a, record('gotrade_bnd', '1', '100'));
  const [entry] = await entryIds(a, 'gotrade_bnd');
  const edits = await Promise.all([
    call(a, revise(entry, 1, '2', '200')),
    call(a, revise(entry, 1, '3', '300')),
  ]);
  assert.equal(edits.filter(r => r.ok).length, 1);
  assert.match(edits.find(r => !r.ok).error, /stale_entry_revision/);
  assert.equal((await position(a, 'gotrade_bnd'))[1], edits[0].ok ? '2' : '3');
  await invariant(a);

  const b = await owner();
  await good(b, record('gotrade_bnd', '1', '100'));
  const [toChange] = await entryIds(b, 'gotrade_bnd');
  const mixed = await Promise.all([
    call(b, revise(toChange, 1, '4', '400')),
    call(b, revise(toChange, 1, null, null, true)),
  ]);
  assert.equal(mixed.filter(r => r.ok).length, 1);
  assert.match(mixed.find(r => !r.ok).error, /stale_entry_revision/);
  assert.equal((await position(b, 'gotrade_bnd'))[1], mixed[0].ok ? '4' : '0');
  await invariant(b);

  const c = await owner();
  await good(c, record('gotrade_bnd', '1', '100'));
  const [prior] = await entryIds(c, 'gotrade_bnd');
  const addVoid = await Promise.all([
    call(c, record('gotrade_bnd', '2', '200')),
    call(c, revise(prior, 1, null, null, true)),
  ]);
  for (const result of addVoid) assert.equal(result.ok, true, result.error);
  const row = await position(c, 'gotrade_bnd');
  assert.equal(row[1], '2');
  assert.equal(row[2], '200');
  assert.equal(row[4], '1');
  assert.equal((await entryIds(c, 'gotrade_bnd')).length, 2);
  await invariant(c);
});

test('post-ledger forced failures roll back create, edit, void and opening correction', async () => {
  await sql(`create function public.arbor_local_fail_reconcile() returns trigger language plpgsql as $$
    begin if current_setting('arbor.local_fail_reconcile',true)='on' and
      (new.units is distinct from old.units or new.cost_basis_php is distinct from old.cost_basis_php
       or new.is_archived is distinct from old.is_archived) then
      raise exception 'local_forced_reconcile_failure'; end if; return new; end $$`);
  await sql(`create trigger arbor_local_fail_reconcile before update on public.arbor_portfolio_holdings
    for each row execute function public.arbor_local_fail_reconcile()`);
  const fail = "set local arbor.local_fail_reconcile='on';";
  try {
    const a = await owner();
    const key = randomUUID();
    const first = await call(a, record('gotrade_vt', '1', '100', key), fail);
    assert.match(first.error, /local_forced_reconcile_failure/);
    assert.equal(await position(a, 'gotrade_vt'), null);
    assert.equal((await entryIds(a, 'gotrade_vt')).length, 0);
    const retry = await good(a, record('gotrade_vt', '1', '100', key));
    assert.equal(JSON.parse(retry).replayed, false);
    const [entry] = await entryIds(a, 'gotrade_vt');
    const edit = await call(a, revise(entry, 1, '2', '200'), fail);
    assert.match(edit.error, /local_forced_reconcile_failure/);
    const unchanged = await sql(`select revision,units::text,amount_paid_php::text,voided_at is null
      from public.arbor_investment_entries where id='${entry}'`);
    assert.equal(unchanged, '1|1|100|t');
    const voided = await call(a, revise(entry, 1, null, null, true), fail);
    assert.match(voided.error, /local_forced_reconcile_failure/);
    assert.equal((await position(a, 'gotrade_vt'))[1], '1');
    const h = await position(a, 'gotrade_vt');
    const timestamp = await sql(`select updated_at::text from public.arbor_portfolio_holdings where id='${h[0]}'`);
    const correction = await call(a, `select public.arbor_correct_opening_position('${h[0]}',
      '${timestamp}', 5, 500)`, fail);
    assert.match(correction.error, /local_forced_reconcile_failure/);
    assert.equal((await position(a, 'gotrade_vt'))[1], '1');
    assert.equal(await invariant(a), 1);
  } finally {
    await sql('drop trigger arbor_local_fail_reconcile on public.arbor_portfolio_holdings');
    await sql('drop function public.arbor_local_fail_reconcile()');
  }
});

test('unknown cost, RLS, direct-write denial and RPC grants preserve owner boundaries', async () => {
  const a = await owner();
  const b = await owner();
  await good(a, record('gotrade_vt', '1', '100'));
  await good(a, record('gotrade_vt', '1', null));
  assert.equal((await position(a, 'gotrade_vt'))[2], 'NULL');
  await invariant(a);
  const [entry] = await entryIds(a, 'gotrade_vt');
  assert.equal(await good(b, 'select count(*) from public.arbor_investment_entry_values'), '0');
  assert.equal(await good(b, 'select count(*) from public.arbor_portfolio_holding_values'), '0');
  assert.match((await call(b, revise(entry, 1, '9', '900'))).error, /entry_not_found/);
  assert.match((await call(b, `insert into public.arbor_investment_entries
    (user_id,holding_id,idempotency_key,payload_digest,investment_date,units)
    values ('${a}', '${(await position(a, 'gotrade_vt'))[0]}', '${randomUUID()}', 'x', current_date, 1)`)).error, /permission denied/);
  assert.match((await call(a, 'update public.arbor_investment_entries set units=9')).error, /permission denied/);
  assert.match((await call(a, 'delete from public.arbor_investment_entries')).error, /permission denied/);
  assert.match((await call(b, `insert into public.arbor_portfolio_holdings
    (user_id,product_id,provider,units) values ('${a}','gotrade_vgt','gotrade',1)`)).error, /permission denied/);
  const anon = await attempt('begin; set local role anon; select * from public.arbor_investment_entry_values; commit;');
  assert.match(anon.error, /permission denied/);
  const anonRpc = await attempt(`begin; set local role anon; ${record('gotrade_vt','1','100')}; commit;`);
  assert.match(anonRpc.error, /permission denied/);
  const grants = await sql(`select has_function_privilege('authenticated',
      'public.arbor_record_investment(text,text,date,numeric,numeric,uuid,numeric,numeric,boolean)', 'EXECUTE'),
    has_function_privilege('anon',
      'public.arbor_record_investment(text,text,date,numeric,numeric,uuid,numeric,numeric,boolean)', 'EXECUTE'),
    has_function_privilege('authenticated','public.arbor_reconcile_investment_holding(uuid)','EXECUTE')`);
  assert.equal(grants, 't|f|f');
});

test('ordinary holding removal cannot erase dated history; invalid negative correction rolls back', async () => {
  const user = await owner();
  await good(user, record('gotrade_vt', '1', '100'));
  const [entry] = await entryIds(user, 'gotrade_vt');
  const holdingId = (await position(user, 'gotrade_vt'))[0];
  assert.match((await call(user, `delete from public.arbor_portfolio_holdings where id='${holdingId}'`)).error,
    /ledger_managed_holding/);
  assert.match((await call(user, revise(entry, 1, '-1', '100'))).error, /invalid_investment_entry/);
  assert.equal((await position(user, 'gotrade_vt'))[1], '1');
  await good(user, revise(entry, 1, null, null, true));
  assert.equal((await position(user, 'gotrade_vt'))[1], '0');
  assert.equal((await entryIds(user, 'gotrade_vt')).length, 1);
  assert.equal(await invariant(user), 1);
});

test('Manila date, composite owner, archive, and auth deletion contracts hold in real PostgreSQL', async () => {
  const a = await owner(), b = await owner();
  const boundary = await sql("select ('2026-09-26 16:05:00+00'::timestamptz at time zone 'Asia/Manila')::date, ('2026-09-26 16:05:00+00'::timestamptz at time zone 'UTC')::date");
  assert.equal(boundary, '2026-09-27|2026-09-26');
  const today = "(now() at time zone 'Asia/Manila')::date";
  const tomorrow = `(${today}+1)`;
  const added = JSON.parse(await good(a, `select public.arbor_record_investment('gotrade_vt','gotrade',${today},1,100,'${randomUUID()}')::text`));
  assert.match((await call(a, `select public.arbor_record_investment('gotrade_vt','gotrade',${tomorrow},1,100,'${randomUUID()}')`)).error, /invalid_investment_entry/);
  await good(a, `select public.arbor_revise_investment('${added.entry_id}',1,${today},1,100,false)`);
  assert.match((await call(a, `select public.arbor_revise_investment('${added.entry_id}',2,${tomorrow},1,100,false)`)).error, /invalid_investment_entry/);
  const h = (await position(a,'gotrade_vt'))[0];
  assert.match((await attempt(`insert into public.arbor_investment_entries(user_id,holding_id,idempotency_key,payload_digest,investment_date,units) values ('${b}','${h}','${randomUUID()}','x',${today},1)`)).error,/foreign key/);
  assert.match((await call(a, `update public.arbor_portfolio_holdings set units=0 where id='${h}'`)).error,/ledger_managed_holding|arbor_archived_units_check/);
  assert.match((await attempt(`update public.arbor_portfolio_holdings set units=0,is_archived=false where id='${h}'`)).error,/arbor_archived_units_check/);
  assert.match((await attempt(`update public.arbor_portfolio_holdings set units=1,is_archived=true where id='${h}'`)).error,/arbor_archived_units_check/);
  await attempt(`delete from public.arbor_portfolio_holdings where id='${h}'`);
  assert.equal((await position(a,'gotrade_vt'))[0],h);
  assert.match((await attempt(`begin; alter table public.arbor_portfolio_holdings disable trigger arbor_guard_legacy_holding_write;
    delete from public.arbor_portfolio_holdings where id='${h}'; rollback;`)).error,/foreign key/);
  assert.match((await attempt(`delete from auth.users where id='${a}'`)).error,/foreign key/);
  assert.equal(await sql(`select count(*) from auth.users where id='${a}'`),'1');
  assert.equal(await invariant(a),1);
});

test('manual-only nullable units and archived zero-unit positions are the only valid zero states', async () => {
  const a=await owner();
  await good(a, `insert into public.arbor_portfolio_holdings(product_id,provider,manual_value_php) values('gcash_global_equity','gcash',100)`);
  assert.equal(await sql(`select units is null and not is_archived from public.arbor_portfolio_holdings where user_id='${a}' and product_id='gcash_global_equity'`),'t');
  assert.match((await call(a, `insert into public.arbor_portfolio_holdings(product_id,provider,units) values('gotrade_vt','gotrade',0)`)).error,/arbor_archived_units_check/);
  await good(a, record('gotrade_vt','1','100'));
  const [entry]=await entryIds(a,'gotrade_vt');
  await good(a,revise(entry,1,null,null,true));
  assert.equal((await position(a,'gotrade_vt'))[1],'0');
  assert.equal((await position(a,'gotrade_vt'))[3],'t');
  assert.equal((await entryIds(a,'gotrade_vt')).length,1);
});
