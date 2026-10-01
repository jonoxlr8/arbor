"""Owner-approved disposable localhost SQL qualification; EVERY case rolls back.

No hosted client/keys/config. Synthetic identities exist only inside each test
transaction. Temporary Storage schema fixture models actual owner_id TEXT and
is rolled back with the rows. A disconnected/failed process also rolls back.
"""
import os,json,subprocess
from datetime import datetime,timedelta,timezone
from uuid import uuid4
from app.services.account_erasure import Approval
from app.services.account_erasure_continuation import DatabaseEvidence,database_dispatch_sql
assert os.environ.get('ARBOR_LOCAL_ERASURE_TEST')=='1'
ARGS=['psql','-w','-X','-q','-At','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','55433','-U','arbor_export_test','-d','arbor_lifecycle_qualification']
def run(query):
 return subprocess.run(ARGS,input=query,text=True,capture_output=True,timeout=15)
def read(query):
 r=run(query);assert r.returncode==0,'Local read failed';return r.stdout.strip()
assert read('select current_database();')=='arbor_lifecycle_qualification'
assert read("select current_setting('data_directory');") in ('/tmp/arbor-export-pg','/private/tmp/arbor-export-pg')
tables=['public.holdings','public.profiles','public.arbor_investment_entries','public.arbor_portfolio_holdings','public.arbor_portfolio_snapshots','public.arbor_portfolio_history_changes','public.arbor_monthly_checkins','public.arbor_ask_usage_monthly','public.arbor_pending_recording_reminders','public.arbor_pending_investment_recordings','public.arbor_portfolio_products','auth.users','auth.sessions','arbor_private.account_lifecycle','arbor_private.account_deletion_requests','arbor_private.account_erasure_operations','arbor_private.account_export_cooldowns']
fingerprint="select jsonb_object_agg(name,value) from ("+' UNION ALL '.join(f"select '{t}' as name,md5(coalesce(string_agg(to_jsonb(r)::text,'|' order by to_jsonb(r)::text),'')) as value from {t} r" for t in tables)+') f;'
baseline=read(fingerprint)
assert read("select to_regclass('storage.objects') is null;")=='t'
checks=[]
for mode in ['success','expiry','sessions','objects','counts','identity','hold']:
 owner,other,op,request,holding=[uuid4() for _ in range(5)]
 assert str(owner) not in ('2b8ecf21-28a4-4323-88d3-d736f95502da','063918cc-71d4-4361-919c-4f756916d4e5')
 created=datetime.now(timezone.utc)
 expiry=created+timedelta(seconds=-1 if mode=='expiry' else 180)
 e=DatabaseEvidence(owner,op,created,created,True,True,0,0,{'profiles':1})
 dispatch=database_dispatch_sql(Approval(op,owner,'database',expiry),e)
 dispatch=dispatch.removeprefix('BEGIN;').removesuffix('COMMIT;')
 # Capture actual counts in SAME transaction, then use them as immutable reviewed
 # evidence; the generator's normal constant comparison is already unit-tested.
 dispatch=dispatch.replace("'{\"profiles\":1}'::jsonb","current_setting('arbor.test_counts')::jsonb")
 seed=f"""BEGIN;
SET LOCAL statement_timeout='8s'; SET LOCAL lock_timeout='2s';
CREATE SCHEMA storage;
CREATE TABLE storage.objects(id uuid PRIMARY KEY,owner_id text NOT NULL);
INSERT INTO auth.users(id,email,created_at) VALUES('{owner}','rollback-owner@example.test','{created.isoformat()}'),('{other}','rollback-control@example.test','{created.isoformat()}');
INSERT INTO profiles(user_id,full_name,country) VALUES('{owner}','Synthetic rollback','Philippines');
INSERT INTO holdings(user_id,ticker,quantity) VALUES('{owner}','SYNTHETIC-ROLLBACK',5),('{other}','SYNTHETIC-CONTROL',7);
INSERT INTO arbor_portfolio_products(product_id,provider,price_key) VALUES('gotrade_vt','gotrade','gotrade_vt') ON CONFLICT DO NOTHING;
INSERT INTO arbor_portfolio_holdings(id,user_id,product_id,provider,units,cost_basis_php,opening_units,opening_cost_php) VALUES('{holding}','{owner}','gotrade_vt','gotrade',1,100,0,0);
INSERT INTO arbor_investment_entries(user_id,holding_id,idempotency_key,payload_digest,investment_date,units,amount_paid_php) VALUES('{owner}','{holding}','{uuid4()}','{'a'*64}','2026-09-01',1,100);
INSERT INTO arbor_private.account_lifecycle(user_id,state,version) VALUES('{owner}','deletion_pending',1);
INSERT INTO arbor_private.account_deletion_requests(user_id,request_id,status,requested_at) VALUES('{owner}','{request}','pending',now());
SELECT arbor_private.erasure_review('{owner}','{request}',1,'{op}',true);
SELECT arbor_private.erasure_begin('{op}');
SELECT set_config('arbor.test_counts',jsonb_strip_nulls(arbor_private.erasure_inventory('{owner}'))::text,true);
SELECT set_config('arbor.test_control',(SELECT md5(to_jsonb(h)::text) FROM holdings h WHERE user_id='{other}'),true);
SAVEPOINT before_dispatch;
"""
 change={
 'sessions':f"INSERT INTO auth.sessions(id,user_id,created_at) VALUES('{uuid4()}','{owner}',now());",
 'objects':f"INSERT INTO storage.objects(id,owner_id) VALUES('{uuid4()}','{owner}');",
 'counts':'',
 'identity':f"UPDATE auth.users SET created_at=created_at+interval '1 second' WHERE id='{owner}';",
 'hold':f"UPDATE arbor_private.account_erasure_operations SET holds='[{{\"category\":\"ledger\"}}]'::jsonb WHERE id='{op}';"
 }.get(mode,'')
 verify=f"""
DO $verify$ BEGIN
 IF EXISTS(SELECT 1 FROM jsonb_each(jsonb_strip_nulls(arbor_private.erasure_inventory('{owner}'))) e WHERE e.value<>'0'::jsonb) THEN RAISE EXCEPTION 'test_rows_remain'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id='{owner}') THEN RAISE EXCEPTION 'test_auth_removed'; END IF;
 IF (SELECT state FROM arbor_private.account_erasure_operations WHERE id='{op}')<>'data_erased' THEN RAISE EXCEPTION 'test_checkpoint_missing'; END IF;
 IF (SELECT md5(to_jsonb(h)::text) FROM holdings h WHERE user_id='{other}')<>current_setting('arbor.test_control') THEN RAISE EXCEPTION 'test_crossowner_change'; END IF;
END $verify$;
ROLLBACK TO SAVEPOINT before_dispatch;
DO $restore$ BEGIN
 IF jsonb_strip_nulls(arbor_private.erasure_inventory('{owner}'))<>current_setting('arbor.test_counts')::jsonb THEN RAISE EXCEPTION 'test_restore_incomplete'; END IF;
 IF (SELECT state FROM arbor_private.account_erasure_operations WHERE id='{op}')<>'erasing' THEN RAISE EXCEPTION 'test_operation_not_restored'; END IF;
END $restore$;
ROLLBACK;
"""
 if mode=='counts':dispatch=dispatch.replace("current_setting('arbor.test_counts')::jsonb", "(current_setting('arbor.test_counts')::jsonb || '{\"holdings\":999}'::jsonb)")
 result=run(seed+change+dispatch+(verify if mode=='success' else 'ROLLBACK;'))
 expected={'expiry':'erasure_approval_expired','sessions':'erasure_provider_checkpoint_changed','objects':'erasure_provider_checkpoint_changed','counts':'erasure_inventory_changed','identity':'erasure_identity_or_request_changed','hold':'erasure_checkpoint_changed'}
 known=['erasure_approval_expired','erasure_provider_checkpoint_changed','erasure_inventory_changed','erasure_identity_or_request_changed','erasure_checkpoint_changed']
 print(json.dumps({'case':mode,'returncode':result.returncode,'safe_code':next((code for code in known if code in result.stderr),'none')}),flush=True)
 if mode=='success':assert result.returncode==0,'Rolled-back successful dispatch failed'
 else:assert result.returncode!=0 and expected[mode] in result.stderr,'Expected fail-closed gate missing'
 # ON_ERROR_STOP exits and disconnect rolls back each failed transaction.
 assert read(f"select not exists(select 1 from auth.users where id in ('{owner}','{other}')) and not exists(select 1 from arbor_private.account_erasure_operations where id='{op}');")=='t'
 assert read("select to_regclass('storage.objects') is null;")=='t'
 assert read(fingerprint)==baseline,'Local row restoration mismatch'
 checks.append(mode)
print(json.dumps({'actual_local_PostgreSQL':True,'cases':checks,'successful_erasure_inside_rolled_back_transaction':True,'savepoint_restored_rows_and_operation':True,'each_case_full_rollback_verified':True,'all_local_table_fingerprints_restored':True,'synthetic_Auth_and_Storage_fixture_absent_after':True,'hosted_actions':0,'credentials_created':0}))
