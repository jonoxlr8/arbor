// Real, independent-session qualification. Refuses anything except the
// disposable task-owned localhost fixture; never connect to hosted Supabase.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import test from 'node:test';

const expected = {PGHOST:'127.0.0.1', PGPORT:'55439',
  PGDATABASE:'arbor_marketstack_test', PGUSER:'arbor_test'};
for(const [key,value] of Object.entries(expected))
  if(process.env[key] !== value) throw new Error(`Refusing database connection: ${key} must be ${value}`);
if(process.env.ARBOR_LOCAL_MARKETSTACK_TEST !== '1')
  throw new Error('Set ARBOR_LOCAL_MARKETSTACK_TEST=1 for the disposable local database');

const args=['-w','-X','-A','-t','-q','-v','ON_ERROR_STOP=1','-h',expected.PGHOST,
  '-p',expected.PGPORT,'-U',expected.PGUSER,'-d',expected.PGDATABASE];
function attempt(statement){
  return new Promise(resolve=>execFile('psql',[...args,'-c',statement],
    {timeout:30000,maxBuffer:1024*1024},
    (error,stdout,stderr)=>resolve({ok:!error,output:stdout.trim(),error:stderr.trim()})));
}
async function sql(statement){
  const result=await attempt(statement);
  assert.equal(result.ok,true,result.error);
  return result.output;
}
async function fresh(){await sql("delete from public.arbor_market_refresh where source_id='marketstack'");}
const claim=(source,seconds)=>attempt(`begin;set local role service_role;select public.arbor_claim_market_refresh('${source}',${seconds});commit`);

test('PostgreSQL 17 applies the intended invoker function and preserves narrow grants',async()=>{
  assert.match(await sql('show server_version'),/^17\./);
  const row=(await sql(`select prosecdef,proconfig[1]='search_path=""',
    has_function_privilege('service_role','public.arbor_claim_market_refresh(text,integer)','execute'),
    has_function_privilege('authenticated','public.arbor_claim_market_refresh(text,integer)','execute'),
    has_function_privilege('anon','public.arbor_claim_market_refresh(text,integer)','execute')
    from pg_proc where oid='public.arbor_claim_market_refresh(text,integer)'::regprocedure`)).split('|');
  assert.deepEqual(row,['f','t','t','f','f']);
});
test('short Marketstack claims fail; six-hour claim succeeds once',async()=>{
  await fresh();
  const short=await claim('marketstack',21599);
  assert.equal(short.ok,false);
  assert.match(short.error,/Invalid refresh cadence/);
  assert.equal(await sql("select count(*) from public.arbor_market_refresh where source_id='marketstack'"),'0');
  assert.match((await claim('marketstack',21600)).output,/t/);
  assert.match((await claim('marketstack',21600)).output,/f/);
});
test('existing lease denies early retry and admits retry past six hours',async()=>{
  await fresh();
  await sql("insert into public.arbor_market_refresh values('marketstack',now()-interval '21599 seconds')");
  assert.match((await claim('marketstack',21600)).output,/f/);
  await sql("update public.arbor_market_refresh set attempted_at=now()-interval '21601 seconds' where source_id='marketstack'");
  assert.match((await claim('marketstack',21600)).output,/t/);
});
test('independent concurrent sessions grant exactly one Marketstack claim',async()=>{
  await fresh();
  const sessions=await Promise.all(Array.from({length:8},()=>sql('select pg_backend_pid(),pg_sleep(0.2)')));
  assert.equal(new Set(sessions.map(row=>row.split('|')[0])).size,8);
  const results=await Promise.all(Array.from({length:8},()=>claim('marketstack',21600)));
  assert.ok(results.every(row=>row.ok));
  assert.equal(results.filter(row=>row.output.includes('t')).length,1);
});
test('untrusted roles cannot claim or write shared market state',async()=>{
  for(const role of ['authenticated','anon']){
    for(const statement of [
      "select public.arbor_claim_market_refresh('marketstack',21600)",
      "update public.arbor_market_refresh set attempted_at=now()",
      "update public.arbor_market_prices set value=1",
    ]){
      const result=await attempt(`begin;set local role ${role};${statement};rollback`);
      assert.equal(result.ok,false);
      assert.match(result.error,/permission denied/);
    }
  }
  const trusted=await attempt("begin;set local role service_role;insert into public.arbor_market_prices(price_key,value,as_of,source,currency,kind,verified) values('gotrade_vt',100,now(),'marketstack','USD','etf_eod',true);rollback");
  assert.equal(trusted.ok,true,trusted.error);
});
test('Coinranking, FX and NAV minimums retain their existing rules',async()=>{
  for(const [source,minimum] of [['coinranking',540],['exchangerate_api',86400],
    ['atram_nav',86400],['bpi_nav',86400]]){
    const short=await claim(source,minimum-1);
    assert.equal(short.ok,false);
    assert.match(short.error,/Invalid refresh cadence/);
  }
});
