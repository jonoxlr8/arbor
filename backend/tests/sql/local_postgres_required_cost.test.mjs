// Applies the additive migration only to disposable localhost arbor_ledger_test.
// Run after the production-relevant baseline migrations, before the concurrency suite.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const expected = {PGHOST:'127.0.0.1',PGPORT:process.env.PGPORT === '55432' ? '55432' : '5432',
  PGDATABASE:'arbor_ledger_test',PGUSER:'arbor_test'};
for (const [key,value] of Object.entries(expected)) {
  if (process.env[key] !== value) throw new Error(`Refusing database connection: ${key} must be ${value}`);
}
if (process.env.ARBOR_LOCAL_LEDGER_TEST !== '1') throw new Error('Set ARBOR_LOCAL_LEDGER_TEST=1 for the disposable local database');
const args=['-w','-X','-A','-t','-q','-v','ON_ERROR_STOP=1','-h',expected.PGHOST,
  '-p',expected.PGPORT,'-U',expected.PGUSER,'-d',expected.PGDATABASE];
function attempt(statement) {
  return new Promise(resolve => execFile('psql',[...args,'-c',statement],
    {timeout:30000,maxBuffer:1024*1024},
    (error,stdout,stderr)=>resolve({ok:!error,output:stdout.trim(),error:stderr.trim()})));
}
async function sql(statement) {
  const result=await attempt(statement);
  assert.equal(result.ok,true,result.error);
  return result.output;
}
const call=(owner,statement)=>attempt(`begin; set local role authenticated;
  set local request.jwt.claim.sub='${owner}'; ${statement}; commit;`);
async function good(owner,statement) {
  const result=await call(owner,statement);
  assert.equal(result.ok,true,result.error);
  return result.output;
}
async function owner() {
  const id=randomUUID();
  await sql(`insert into auth.users(id) values ('${id}')`);
  return id;
}
const today="(now() at time zone 'Asia/Manila')::date";
function record(product,provider,units,cost,key=randomUUID(),extra='') {
  return `select public.arbor_record_investment('${product}','${provider}',${today},
    ${units},${cost === null ? 'null' : cost},'${key}'${extra})::text`;
}
function revise(id,revision,units,cost,voided=false,date=today) {
  return `select public.arbor_revise_investment('${id}',${revision},${date},
    ${units === null ? 'null' : units},${cost === null ? 'null' : cost},${voided})::text`;
}
async function entry(id) {
  const result=await sql(`select revision,units::text,coalesce(amount_paid_php::text,'NULL'),
    voided_at is not null,investment_date::text from public.arbor_investment_entries where id='${id}'`);
  return result.split('|');
}
async function invariant(user) {
  const result=await sql(`with checked as (
    select h.units = h.opening_units + x.active_units as units_ok,
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
  ) select count(*),coalesce(bool_and(units_ok),true),coalesce(bool_and(cost_ok),true),
    coalesce(bool_and(archive_ok),true) from checked`);
  const parts=result.split('|');
  assert.deepEqual(parts.slice(1),['t','t','t'],result);
  return Number(parts[0]);
}

// The old RPC creates real legacy payload digests before the new rule exists.
const legacyOwner=await owner();
const legacy={};
for (const [name,cost] of [['nullEdit',null],['nullVoid',null],['nullRace',null],
  ['zeroEdit','0'],['zeroVoid','0']]) {
  const key=randomUUID();
  const result=JSON.parse(await good(legacyOwner,record('gotrade_vt','gotrade','1',cost,key)));
  legacy[name]={...result,key,cost};
}
const before=await sql(`select md5(string_agg(row_to_json(e)::text,',' order by e.id::text))
  from public.arbor_investment_entries e where user_id='${legacyOwner}'`);
const migration=fileURLToPath(new URL('../../migrations/20260929015400_require_recorded_investment_cost.sql',import.meta.url));
const applied=await new Promise(resolve=>execFile('psql',[...args,'-f',migration],
  {timeout:30000,maxBuffer:1024*1024},
  (error,stdout,stderr)=>resolve({ok:!error,output:stdout.trim(),error:stderr.trim()})));
assert.equal(applied.ok,true,applied.error);
assert.equal(await sql(`select md5(string_agg(row_to_json(e)::text,',' order by e.id::text))
  from public.arbor_investment_entries e where user_id='${legacyOwner}'`),before,
  'migration must not change existing rows');

test('additive migration preserves signatures, owner, hardened search_path, and grants',async()=>{
  const metadata=await sql(`select p.proname,pg_get_userbyid(p.proowner),p.prosecdef,
    'search_path=""'=any(p.proconfig),
    has_function_privilege('authenticated',p.oid,'EXECUTE'),
    has_function_privilege('anon',p.oid,'EXECUTE')
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('arbor_record_investment','arbor_revise_investment')
    order by p.proname`);
  assert.deepEqual(metadata.split('\n'),[
    'arbor_record_investment|arbor_test|t|t|t|f',
    'arbor_revise_investment|arbor_test|t|t|t|f']);
  assert.equal(await sql("select to_regprocedure('public.arbor_record_investment(text,text,date,numeric,numeric,uuid,numeric,numeric,boolean)') is not null"),'t');
  assert.equal(await sql("select to_regprocedure('public.arbor_revise_investment(uuid,integer,date,numeric,numeric,boolean)') is not null"),'t');
});

test('positive additions replay exactly and changed payloads conflict',async()=>{
  const user=await owner(), key=randomUUID();
  const first=JSON.parse(await good(user,record('gotrade_vt','gotrade','0.5','125.25',key)));
  const retry=JSON.parse(await good(user,record('gotrade_vt','gotrade','0.5','125.25',key)));
  assert.equal(first.replayed,false);assert.equal(retry.replayed,true);
  assert.equal(first.entry_id,retry.entry_id);
  assert.match((await call(user,record('gotrade_vt','gotrade','0.5','126',key))).error,/idempotency_conflict/);
  assert.equal(await sql(`select count(*) from public.arbor_investment_entries where user_id='${user}'`),'1');
  assert.equal(await sql(`select units::text,cost_basis_php::text from public.arbor_portfolio_holdings where user_id='${user}'`),'0.5|125.25');
  await invariant(user);
});

test('preexisting NULL and zero requests replay; changed legacy keys conflict',async()=>{
  for (const name of ['nullEdit','zeroEdit']) {
    const prior=legacy[name];
    const replay=JSON.parse(await good(legacyOwner,record('gotrade_vt','gotrade','1',prior.cost,prior.key)));
    assert.equal(replay.replayed,true);
    assert.equal(replay.entry_id,prior.entry_id);
    assert.match((await call(legacyOwner,record('gotrade_vt','gotrade','2',prior.cost,prior.key))).error,/idempotency_conflict/);
  }
  assert.equal(await sql(`select count(*) from public.arbor_investment_entries where user_id='${legacyOwner}'`),'5');
  assert.equal((await entry(legacy.nullEdit.entry_id))[2],'NULL');
  assert.equal((await entry(legacy.zeroEdit.entry_id))[2],'0');
  await invariant(legacyOwner);
});

test('new NULL, zero, negative, excessive and over-precision costs are denied before writes',async()=>{
  const user=await owner();
  for (const cost of [null,'0','-1','10000000000000000','1.001']) {
    const result=await call(user,record('gotrade_vt','gotrade','1',cost));
    assert.match(result.error,/invalid_investment_entry/,String(cost));
  }
  assert.equal(await sql(`select count(*) from public.arbor_investment_entries where user_id='${user}'`),'0');
  assert.equal(await sql(`select count(*) from public.arbor_portfolio_holdings where user_id='${user}'`),'0');
});

test('known cost cannot be cleared; legacy NULL and zero may persist exactly or upgrade',async()=>{
  const user=await owner();
  const created=JSON.parse(await good(user,record('gotrade_vt','gotrade','1','100')));
  await good(user,revise(created.entry_id,1,'2','200'));
  for (const cost of [null,'0','-1']) {
    assert.match((await call(user,revise(created.entry_id,2,'3',cost))).error,/invalid_investment_entry/);
  }
  assert.match((await call(user,revise(created.entry_id,1,'3','300'))).error,/stale_entry_revision/);
  assert.deepEqual((await entry(created.entry_id)).slice(0,3),['2','2','200']);
  const nullId=legacy.nullEdit.entry_id, zeroId=legacy.zeroEdit.entry_id;
  assert.match((await call(legacyOwner,revise(nullId,1,'2','0'))).error,/invalid_investment_entry/);
  assert.match((await call(legacyOwner,revise(zeroId,1,'2',null))).error,/invalid_investment_entry/);
  await good(legacyOwner,revise(nullId,1,'2',null,false,`(${today}-1)`));
  await good(legacyOwner,revise(zeroId,1,'2','0',false,`(${today}-1)`));
  assert.deepEqual((await entry(nullId)).slice(0,3),['2','2','NULL']);
  assert.deepEqual((await entry(zeroId)).slice(0,3),['2','2','0']);
  await good(legacyOwner,revise(nullId,2,'2','125'));
  await good(legacyOwner,revise(zeroId,2,'2','125'));
  assert.equal((await entry(nullId))[2],'125');
  assert.equal((await entry(zeroId))[2],'125');
  assert.match((await call(legacyOwner,revise(nullId,3,'2',null))).error,/invalid_investment_entry/);
  await invariant(user);await invariant(legacyOwner);
});

test('void preserves positive, NULL and zero historical cost and never invents an amount',async()=>{
  const user=await owner();
  const positive=JSON.parse(await good(user,record('pdax_btc','pdax','0.001','100')));
  for (const id of [positive.entry_id,legacy.nullVoid.entry_id,legacy.zeroVoid.entry_id]) {
    const ownerId=id===positive.entry_id ? user : legacyOwner;
    const previous=await entry(id);
    await good(ownerId,revise(id,1,null,null,true));
    const after=await entry(id);
    assert.deepEqual(after.slice(1,3),previous.slice(1,3));
    assert.equal(after[4],previous[4]);
    assert.equal(after[0],'2');assert.equal(after[3],'t');
  }
  await invariant(user);await invariant(legacyOwner);
});

test('all 12 canonical product/provider combinations accept positive cost',async()=>{
  const user=await owner();
  const pairs=[
    ['gcash_global_equity','gcash'],['gcash_technology','gcash'],['gcash_defensive','gcash'],
    ['dragonfi_global_equity','dragonfi'],['dragonfi_technology','dragonfi'],['dragonfi_defensive','dragonfi'],
    ['gotrade_vt','gotrade'],['gotrade_vgt','gotrade'],['gotrade_bnd','gotrade'],
    ['gcrypto_btc','gcrypto'],['coins_btc','coins_ph'],['pdax_btc','pdax']];
  for (const [product,provider] of pairs) {
    const result=JSON.parse(await good(user,record(product,provider,'1','10')));
    assert.equal(result.replayed,false);
  }
  assert.equal(await sql(`select count(*) from public.arbor_investment_entries where user_id='${user}'`),'12');
  assert.equal(await invariant(user),12);
  assert.equal(await sql(`select count(*) from public.arbor_portfolio_holdings
    where user_id='${user}' and units=1 and cost_basis_php=10`),'12');
});

test('unknown opening cost remains valid; authenticated and anon callers cannot bypass RPC ownership',async()=>{
  const user=await owner(), other=await owner();
  await good(user,`insert into public.arbor_portfolio_holdings(product_id,provider,manual_value_php)
    values('gcash_global_equity','gcash',8000)`);
  const addition=JSON.parse(await good(user,record('gcash_global_equity','gcash','1','50',
    randomUUID(),',5,null,true')));
  assert.equal((await entry(addition.entry_id))[2],'50');
  assert.equal(await sql(`select opening_units::text,opening_cost_php is null,cost_basis_php is null
    from public.arbor_portfolio_holdings where id='${addition.holding_id}'`),'5|t|t');
  assert.equal(await good(other,'select count(*) from public.arbor_investment_entry_values'),'0');
  assert.match((await call(other,revise(addition.entry_id,1,'9','900'))).error,/entry_not_found/);
  assert.match((await call(user,`update public.arbor_investment_entries set amount_paid_php=null
    where id='${addition.entry_id}'`)).error,/permission denied/);
  assert.match((await attempt(`begin;set local role anon;${record('gotrade_vt','gotrade','1','10')};commit;`)).error,/permission denied/);
  await invariant(user);
});

test('independent-session NULL/add and revision races preserve the authoritative aggregate',async()=>{
  const user=await owner();
  const first=await Promise.all([
    call(user,record('gotrade_vt','gotrade','1',null)),
    call(user,record('gotrade_vt','gotrade','2','200')),
  ]);
  assert.match(first[0].error,/invalid_investment_entry/);
  assert.equal(first[1].ok,true,first[1].error);
  const id=JSON.parse(first[1].output).entry_id;
  assert.equal(await sql(`select units::text,cost_basis_php::text from public.arbor_portfolio_holdings
    where user_id='${user}' and product_id='gotrade_vt'`),'2|200');
  const clearRace=await Promise.all([
    call(user,revise(id,1,'3','300')),
    call(user,revise(id,1,'3',null)),
  ]);
  assert.equal(clearRace[0].ok,true,clearRace[0].error);
  assert.match(clearRace[1].error,/invalid_investment_entry|stale_entry_revision/);
  assert.equal((await entry(id))[2],'300');
  const voidRace=await Promise.all([
    call(user,revise(id,2,'4','400')),
    call(user,revise(id,2,null,null,true)),
  ]);
  assert.equal(voidRace.filter(result=>result.ok).length,1);
  assert.match(voidRace.find(result=>!result.ok).error,/stale_entry_revision/);
  await invariant(user);
  const nullId=legacy.nullRace.entry_id;
  const legacyRace=await Promise.all([
    call(legacyOwner,revise(nullId,1,'2',null)),
    call(legacyOwner,revise(nullId,1,'2','75')),
  ]);
  assert.equal(legacyRace.filter(result=>result.ok).length,1);
  assert.match(legacyRace.find(result=>!result.ok).error,/stale_entry_revision/);
  assert.ok(['NULL','75'].includes((await entry(nullId))[2]));
  await invariant(legacyOwner);
});
