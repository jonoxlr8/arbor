"""Disposable localhost cached-JWT barrier checks, with exact fixture cleanup.

Actual PostgreSQL and PostgREST, not a managed Auth Ban test. No hosted settings,
credential loading or provider calls. The lifecycle barrier is tested even without
Ban, which is a separate required operator condition for the manual Ban mode.
"""
import json
import os
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from uuid import uuid4
import jwt

assert os.environ.get('ARBOR_LOCAL_ERASURE_TEST') == '1'
ARGS = ['psql','-w','-X','-q','-At','-v','ON_ERROR_STOP=1','-h','127.0.0.1',
        '-p','55433','-U','arbor_export_test','-d','arbor_lifecycle_qualification']
ORIGIN = 'http://127.0.0.1:55435'
SECRET = 'arbor-synthetic-local-test-only-not-a-hosted-credential'


def sql(text, expected=True):
    result = subprocess.run(ARGS, input=text, text=True, capture_output=True, timeout=15)
    assert (result.returncode == 0) == expected, 'Local SQL classification mismatch'
    return result.stdout.strip() if expected else result.stderr


assert sql("select current_setting('data_directory');") in ('/tmp/arbor-export-pg','/private/tmp/arbor-export-pg')
owner, other, session, other_session, operation, request = [str(uuid4()) for _ in range(6)]
now = int(time.time())
claims = {'sub':owner,'session_id':session,'role':'authenticated', 'aud':'authenticated','iat':now,'exp':now+3600}
token = jwt.encode(claims, SECRET, algorithm='HS256')
control_token = jwt.encode({**claims,'sub':other,'session_id':other_session}, SECRET, algorithm='HS256')
checks = []


def api(path, method='POST', body=None, bearer=token):
    headers = {'Content-Type':'application/json','Authorization':'Bearer '+bearer}
    req = Request(ORIGIN+path, method=method, headers=headers,
                  data=None if method=='GET' else json.dumps(body or {}).encode())
    try:
        with urlopen(req, timeout=10) as result:
            raw = result.read(); return result.status, json.loads(raw) if raw else None
    except HTTPError as error:
        return error.code, json.load(error)


try:
    sql(f"""BEGIN;
INSERT INTO auth.users(id,email) VALUES('{owner}','barrier-owner@example.test'),('{other}','barrier-control@example.test');
INSERT INTO auth.sessions(id,user_id,created_at) VALUES('{session}','{owner}',clock_timestamp()),('{other_session}','{other}',clock_timestamp());
INSERT INTO holdings(user_id,ticker,quantity) VALUES('{owner}','SYNTHETIC-BARRIER',1),('{other}','SYNTHETIC-CONTROL',2);
INSERT INTO arbor_private.account_lifecycle(user_id,state,version) VALUES('{owner}','deletion_pending',1);
INSERT INTO arbor_private.account_deletion_requests(user_id,request_id,status,requested_at) VALUES('{owner}','{request}','pending',clock_timestamp());
SELECT arbor_private.erasure_review('{owner}','{request}',1,'{operation}',true);
SELECT arbor_private.erasure_begin('{operation}'); COMMIT;""")
    before = sql(f"select md5(to_jsonb(h)::text) from holdings h where user_id='{other}';")
    assert sql(f"select count(*) from auth.sessions where user_id='{owner}';") == '1'
    assert api('/rpc/arbor_account_active_v1') == (200, False)
    for table in ('profiles','holdings','arbor_portfolio_holdings','arbor_investment_entries',
                  'arbor_portfolio_snapshots','arbor_portfolio_history_changes',
                  'arbor_monthly_checkins','arbor_pending_investment_recordings','arbor_ask_usage_monthly',
                  'arbor_portfolio_history','arbor_investment_entry_values',
                  'arbor_portfolio_observed_history_status','arbor_portfolio_holding_ledger_values',
                  'arbor_portfolio_holding_values'):
        assert api('/'+table,'GET') == (200, []), table
    assert api('/holdings','POST',{'user_id':owner,'ticker':'BLOCKED','quantity':1})[0] == 403
    assert api('/holdings?user_id=eq.'+owner,'PATCH',{'quantity':99})[0] in (200, 204, 403)
    assert sql(f"select quantity from holdings where user_id='{owner}';") == '1'
    for name, params in (
        ('arbor_record_investment',{'p_product_id':'gotrade_vt','p_provider':'gotrade','p_investment_date':'2026-09-30','p_units':1,'p_amount_paid_php':100,'p_idempotency_key':str(uuid4())}),
        ('arbor_revise_investment',{'p_entry_id':str(uuid4()),'p_expected_revision':1,'p_investment_date':'2026-09-30','p_units':1,'p_amount_paid_php':100,'p_void':False}),
        ('arbor_correct_opening_position',{'p_holding_id':str(uuid4()),'p_expected_updated_at':'2026-09-30T00:00:00Z','p_opening_units':1,'p_opening_cost_php':100}),
        ('arbor_capture_portfolio',{}), ('arbor_monthly_checkin',{}),
        ('arbor_reconstructed_portfolio_history',{}),
        ('arbor_start_pending_recording',{'p_product_id':'gotrade_vt','p_provider':'gotrade'}),
        ('arbor_resolve_pending_recording',{'p_id':str(uuid4()),'p_resolution':'dismissed'})):
        assert api('/rpc/'+name,body=params)[0] == 403, name
    assert api('/rpc/arbor_account_export_current_v1')[0] == 403
    status_code, status = api('/rpc/arbor_account_lifecycle_v1',body={'p_action':'status'})
    assert status_code == 200 and status['state']=='erasing' and not status['access_allowed']
    assert api('/rpc/arbor_account_lifecycle_v1',body={'p_action':'login'})[0] == 409
    time.sleep(1.05)  # Existing one-second lifecycle admission cooldown.
    assert api('/rpc/arbor_account_lifecycle_v1',body={'p_action':'cancel_deletion','p_confirm':True,'p_expected_version':2,'p_action_id':str(uuid4())})[0] == 409
    assert sql(f"select public.arbor_reminders_allowed_v1('{owner}');") == 'f'
    assert api('/holdings?user_id=eq.'+other,'GET')[1] == []
    assert api('/holdings?user_id=eq.'+other,'GET',bearer=control_token)[1][0]['ticker']=='SYNTHETIC-CONTROL'
    checks.append('valid_cached_JWT_cannot_read_write_export_reopen_cancel_or_admit_reminders')
    # Existing service/definer writes also hit the trigger, independently of JWT.
    assert 'account_restricted' in sql(f"update holdings set quantity=100 where user_id='{owner}';",False)
    checks.append('late_privileged_owner_write_rejected')
    # A transaction holding admission serializes with a late writer. Sleep is
    # confined to localhost; it is never part of managed qualification.
    holder = subprocess.Popen(ARGS, stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    holder.stdin.write(f"BEGIN; SELECT pg_advisory_xact_lock(hashtextextended('arbor-account-lifecycle:{owner}',0)); SELECT 'locked'; SELECT pg_sleep(1.2); ROLLBACK;\n")
    holder.stdin.close()
    while holder.stdout.readline().strip() != 'locked':
        assert holder.poll() is None, 'Local lock admission failed'
    started = time.monotonic()
    assert 'account_restricted' in sql(f"SET lock_timeout='2s';update holdings set quantity=100 where user_id='{owner}';",False)
    assert time.monotonic()-started > .7
    assert holder.wait(timeout=5) == 0
    assert sql(f"select md5(to_jsonb(h)::text) from holdings h where user_id='{other}';") == before
    assert sql(f"select quantity from holdings where user_id='{owner}';") == '1'
    checks.append('concurrent_operator_lock_serializes_then_rejects_late_write')
finally:
    # Exactly these local task-created rows only; never a managed Auth command.
    sql(f"""BEGIN;
DELETE FROM arbor_private.account_erasure_operations WHERE id='{operation}' AND owner_id='{owner}';
DELETE FROM arbor_private.account_deletion_requests WHERE user_id='{owner}' AND request_id='{request}';
DELETE FROM arbor_private.account_lifecycle WHERE user_id='{owner}';
DELETE FROM holdings WHERE user_id IN ('{owner}','{other}');
DELETE FROM auth.sessions WHERE user_id IN ('{owner}','{other}');
DELETE FROM auth.users WHERE id IN ('{owner}','{other}');COMMIT;""")
assert sql(f"select not exists(select 1 from auth.users where id in ('{owner}','{other}'));")=='t'
print(json.dumps({'actual_local_PostgreSQL':True,'actual_local_PostgREST':True,'checks':checks,'fixture_cleanup_verified':True,'managed_Auth_Ban_qualified':False,'hosted_actions':0}))
