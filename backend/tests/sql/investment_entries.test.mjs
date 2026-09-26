// Isolated PostgreSQL/WASM contract tests; no hosted credentials or writes.
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
const {PGlite}=createRequire(import.meta.url)(process.env.ARBOR_PGLITE_PATH);
const db=new PGlite();
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002';
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as
 $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to authenticated;insert into auth.users values('${A}'),('${B}');`);
for(const file of ['3u_b_live_portfolio.sql','20260924070525_3u_b_5_manual_fund_values.sql',
 '20260925114901_toap_nav_ingestion.sql','20260925204248_allow_coinranking_540s_refresh.sql',
 '20260926111500_dated_investment_entries.sql'])
 await db.exec(await readFile(new URL(`../../migrations/${file}`,import.meta.url),'utf8'));
async function identity(id=A){await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);}
async function record(product='gotrade_vt',provider='gotrade',units='1',paid='100',key='00000000-0000-0000-0000-000000000011',extras={}){
 return (await db.query(`select public.arbor_record_investment($1,$2,(now() at time zone 'Asia/Manila')::date,$3,$4,$5,$6,$7,$8) as result`,
 [product,provider,units,paid,key,extras.opening??null,extras.openingCost??null,extras.confirm??false])).rows[0].result;
}
async function revise(id,rev,units='1',paid='100',voided=false,date='2026-09-25'){
 return db.query('select public.arbor_revise_investment($1,$2,$3,$4,$5,$6)',[id,rev,date,units,paid,voided]);
}
async function holding(product='gotrade_vt'){
 return (await db.query('select * from public.arbor_portfolio_holding_values where product_id=$1',[product])).rows[0];
}
test('first and repeated addition, idempotency, complete cost, different providers',async()=>{
 await identity();const first=await record();assert.equal(first.replayed,false);
 assert.equal((await holding()).units,'1');assert.equal((await holding()).cost_basis_php,'100');
 assert.equal((await record()).replayed,true);
 await assert.rejects(record('gotrade_vt','gotrade','2','100'),/idempotency_conflict/);
 await record('gotrade_vt','gotrade','1','100','00000000-0000-0000-0000-000000000012');
 assert.equal((await holding()).units,'2');assert.equal((await holding()).cost_basis_php,'200');
 await record('pdax_btc','pdax','0.001','10','00000000-0000-0000-0000-000000000013');
 await record('coins_btc','coins_ph','0.001','10','00000000-0000-0000-0000-000000000014');
 assert.equal((await db.query('select count(*)::int as n from public.arbor_portfolio_holdings')).rows[0].n,3);
});
test('legacy view keeps the deployed SELECT * contract; ledger view alone exposes metadata',async()=>{
 const columns=async name=>(await db.query('select column_name from information_schema.columns where table_schema=$1 and table_name=$2 order by ordinal_position',['public',name])).rows.map(r=>r.column_name);
 const legacyColumns=['id','user_id','product_id','provider','units','cost_basis_php','created_at','updated_at','manual_value_php','manual_value_updated_at'];
 assert.deepEqual(await columns('arbor_portfolio_holding_values'),legacyColumns);
 assert.deepEqual(await columns('arbor_portfolio_holding_ledger_values'),['id','user_id','opening_units','opening_cost_php','has_entries']);
 await identity(A);
 const row=(await db.query("select * from public.arbor_portfolio_holding_values where product_id='gotrade_vt'")).rows[0];
 assert.deepEqual(Object.keys(row),legacyColumns);
 assert.equal(row.units,'2');assert.equal(row.cost_basis_php,'200');
 const meta=(await db.query("select * from public.arbor_portfolio_holding_ledger_values where id=$1",[row.id])).rows[0];
 assert.equal(meta.opening_units,'0');assert.equal(meta.has_entries,true);
 await identity(B);
 assert.equal((await db.query('select * from public.arbor_portfolio_holding_values')).rows.length,0);
 assert.equal((await db.query('select * from public.arbor_portfolio_holding_ledger_values')).rows.length,0);
 await db.exec('reset role;set role anon');
 await assert.rejects(db.query('select * from public.arbor_portfolio_holding_ledger_values'),/permission denied/);
});
test('edit revision, void, zero archive and preserved history',async()=>{
 await identity();const h=await holding();const entries=(await db.query('select * from public.arbor_investment_entry_values where holding_id=$1 order by investment_date desc,recorded_at desc,id desc',[h.id])).rows;
 await revise(entries[0].id,1,'2','200');assert.equal((await holding()).units,'3');
 await assert.rejects(revise(entries[0].id,1,'3','300'),/stale_entry_revision/);
 await revise(entries[0].id,2,null,null,true);assert.equal((await holding()).units,'1');
 await revise(entries[1].id,1,null,null,true);assert.equal(await holding(),undefined);
 assert.equal((await db.query('select count(*)::int as n from public.arbor_investment_entry_values where holding_id=$1',[h.id])).rows[0].n,2);
 await assert.rejects(db.query('delete from public.arbor_portfolio_holdings where id=$1',[h.id]),/ledger_managed_holding/);
});
test('legacy opening position, unknown cost, no direct ledger bypass',async()=>{
 await identity();await db.exec("insert into public.arbor_portfolio_holdings(product_id,provider,units,cost_basis_php) values('gotrade_vgt','gotrade',10,1000)");
 await record('gotrade_vgt','gotrade','10','1000','00000000-0000-0000-0000-000000000021');
 assert.equal((await holding('gotrade_vgt')).units,'20');assert.equal((await holding('gotrade_vgt')).cost_basis_php,'2000');
 await assert.rejects(db.exec("update public.arbor_portfolio_holdings set units=99 where product_id='gotrade_vgt'"),/ledger_managed_holding/);
 await record('gotrade_bnd','gotrade','1',null,'00000000-0000-0000-0000-000000000022');
 assert.equal((await holding('gotrade_bnd')).cost_basis_php,null);
});
test('manual-only fund needs explicit opening units; manual value is not an addition',async()=>{
 await identity();await db.exec("insert into public.arbor_portfolio_holdings(product_id,provider,manual_value_php) values('gcash_global_equity','gcash',8000)");
 await assert.rejects(record('gcash_global_equity','gcash','1','50','00000000-0000-0000-0000-000000000031'),/opening_position_confirmation_required/);
 assert.equal((await holding('gcash_global_equity')).units,null);
 await record('gcash_global_equity','gcash','1','50','00000000-0000-0000-0000-000000000032',{opening:'10',confirm:true});
 assert.equal((await holding('gcash_global_equity')).units,'11');assert.equal((await holding('gcash_global_equity')).cost_basis_php,null);
 assert.equal((await holding('gcash_global_equity')).manual_value_php,null);
 await db.exec("update public.arbor_portfolio_holdings set manual_value_php=9000 where product_id='gcash_global_equity'");
 assert.equal((await holding('gcash_global_equity')).units,'11');
});
test('cross-owner and anonymous entry writes denied',async()=>{
 await identity(B);assert.equal((await db.query('select * from public.arbor_investment_entry_values')).rows.length,0);
 await assert.rejects(revise((await db.query(`select id from public.arbor_investment_entries where user_id='${A}'`)).rows[0]?.id,1),/entry_not_found|invalid input/);
 await assert.rejects(db.exec("insert into public.arbor_investment_entries(user_id,holding_id,idempotency_key,payload_digest,investment_date,units) values(null,null,null,'x',current_date,1)"),/permission denied/);
 await assert.rejects(db.exec('update public.arbor_investment_entries set units=2'),/permission denied/);
 await assert.rejects(db.exec('delete from public.arbor_investment_entries'),/permission denied/);
 await db.exec('reset role;set role anon');await assert.rejects(db.exec("select public.arbor_record_investment('gotrade_vt','gotrade',current_date,1,100,gen_random_uuid())"),/permission denied/);
});
test('failed write leaves no orphan; stale opening correction is rejected',async()=>{
 await identity(A);
 const before=(await db.query('select count(*)::int as n from public.arbor_investment_entries')).rows[0].n;
 await assert.rejects(record('gotrade_vgt','gotrade','0','10','00000000-0000-0000-0000-000000000041'),/invalid_investment_entry/);
 assert.equal((await db.query('select count(*)::int as n from public.arbor_investment_entries')).rows[0].n,before);
 const h=await holding('gotrade_vgt');
 const fixed=await db.query('select public.arbor_correct_opening_position($1,$2,5,500)',[h.id,h.updated_at]);
 assert.ok(fixed.rows.length);assert.equal((await holding('gotrade_vgt')).units,'15');
 await assert.rejects(db.query('select public.arbor_correct_opening_position($1,$2,6,600)',[h.id,h.updated_at]),/stale_entry_revision/);
});
test('late aggregate-limit failure rolls back inserted entry and holding changes',async()=>{
 await identity(A);
 await db.exec("insert into public.arbor_portfolio_holdings(product_id,provider,units) values('gcrypto_btc','gcrypto',999999999999)");
 const before=(await db.query("select count(*)::int as n from public.arbor_investment_entries where user_id=$1",[A])).rows[0].n;
 await assert.rejects(record('gcrypto_btc','gcrypto','1',null,'00000000-0000-0000-0000-000000000061'),/position_limit/);
 assert.equal((await db.query("select count(*)::int as n from public.arbor_investment_entries where user_id=$1",[A])).rows[0].n,before);
 assert.equal((await holding('gcrypto_btc')).units,'999999999999');
});
test('archived position is excluded from snapshot valuation',async()=>{
 await identity(B);
 const entry=await record('pdax_btc','pdax','0.001','100','00000000-0000-0000-0000-000000000051');
 await db.exec("reset role;insert into public.arbor_market_prices(price_key,value,as_of,source,verified) values('btc_php',1000000,now(),'fixture',true)");
 await identity(B);
 assert.equal((await db.query('select public.arbor_capture_portfolio() as ok')).rows[0].ok,true);
 assert.equal((await db.query('select value_php::text as v from public.arbor_portfolio_snapshots')).rows[0].v,'1000.00');
 await revise(entry.entry_id,1,null,null,true);
 assert.equal((await db.query('select count(*)::int as n from public.arbor_portfolio_holding_values')).rows[0].n,0);
 assert.equal((await db.query('select public.arbor_capture_portfolio() as ok')).rows[0].ok,false);
 assert.equal((await db.query('select count(*)::int as n from public.arbor_investment_entry_values')).rows[0].n,1);
 assert.equal((await db.query('select value_php::text as v from public.arbor_portfolio_snapshots')).rows[0].v,'1000.00');
});
test('Manila date boundary accepts local today and rejects the following day',async()=>{
 await identity(A);
 const boundary=await db.query("select ('2026-09-26 16:05:00+00'::timestamptz at time zone 'Asia/Manila')::date::text as manila, ('2026-09-26 16:05:00+00'::timestamptz at time zone 'UTC')::date::text as utc");
 assert.equal(boundary.rows[0].manila,'2026-09-27');assert.equal(boundary.rows[0].utc,'2026-09-26');
 const today=(await db.query("select (now() at time zone 'Asia/Manila')::date::text as today")).rows[0].today;
 const tomorrow=(await db.query("select ((now() at time zone 'Asia/Manila')::date+1)::text as tomorrow")).rows[0].tomorrow;
 const added=await db.query("select public.arbor_record_investment('gotrade_vt','gotrade',$1,1,100,$2) as result",[today,'00000000-0000-0000-0000-000000000071']);
 assert.ok(added.rows[0].result.entry_id);
 await assert.rejects(db.query("select public.arbor_record_investment('gotrade_vt','gotrade',$1,1,100,$2)",[tomorrow,'00000000-0000-0000-0000-000000000072']),/invalid_investment_entry/);
 await db.query('select public.arbor_revise_investment($1,1,$2,1,100,false)',[added.rows[0].result.entry_id,today]);
 await assert.rejects(db.query('select public.arbor_revise_investment($1,2,$2,1,100,false)',[added.rows[0].result.entry_id,tomorrow]),/invalid_investment_entry/);
});
test('composite owner link and archive state fail closed',async()=>{
 await db.exec('reset role');
 const hold=(await db.query(`select id from public.arbor_portfolio_holdings where user_id='${A}' and product_id='gotrade_vt'`)).rows[0].id;
 await assert.rejects(db.query(`insert into public.arbor_investment_entries(user_id,holding_id,idempotency_key,payload_digest,investment_date,units) values($1,$2,$3,'x',(now() at time zone 'Asia/Manila')::date,1)`,[B,hold,'00000000-0000-0000-0000-000000000073']),/foreign key/);
 await assert.rejects(db.query(`update public.arbor_portfolio_holdings set units=0,is_archived=false where id=$1`,[hold]),/arbor_archived_units_check/);
 await assert.rejects(db.query(`update public.arbor_portfolio_holdings set units=1,is_archived=true where id=$1`,[hold]),/arbor_archived_units_check/);
 assert.equal((await db.query(`select count(*)::int as n from public.arbor_investment_entries where holding_id=$1`,[hold])).rows[0].n,3);
});
test.after(()=>db.close());
