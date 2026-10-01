"""Loopback-only synthetic manual phase rehearsal; every case rolls back."""
import runpy,sys,json
from pathlib import Path
from datetime import datetime,timedelta,timezone
from uuid import UUID
from app.services import account_erasure_manual
m=vars(account_erasure_manual)
MODE=sys.argv[1] if len(sys.argv)>1 else 'zero_sessions'
assert MODE in ('zero_sessions','banned_barrier')
# Reuse the established fully rolled-back fixture, including surviving-owner hash.
s=Path('tests/sql/account_erasure_continuation_rollback_local.py').read_text()
s=s.replace('dispatch=database_dispatch_sql(Approval(op,owner,\'database\',expiry),e)', "dispatch=manual_dispatch(owner,op,request,created,expiry)")
# Fixture's original_counts is captured inside this same synthetic transaction.
s=s.replace("dispatch=dispatch.replace(\"'{\\\"profiles\\\":1}'::jsonb\",\"current_setting('arbor.test_counts')::jsonb\")", "dispatch=dispatch.replace(manual_counts_literal,\"current_setting('arbor.test_counts')::jsonb\")")
s=s.replace("dispatch=dispatch.removeprefix('BEGIN;').removesuffix('COMMIT;')", "dispatch=dispatch.removeprefix('BEGIN;').removesuffix('COMMIT;')")
# Raw reviewed counts include an explicitly null inactive usage table. Preserve exact schema semantics.
s=s.replace("jsonb_strip_nulls(arbor_private.erasure_inventory('{owner}'))::text", "arbor_private.erasure_inventory('{owner}')::text")
s=s.replace("IF jsonb_strip_nulls(arbor_private.erasure_inventory('{owner}'))<>current_setting('arbor.test_counts')::jsonb", "IF arbor_private.erasure_inventory('{owner}')<>current_setting('arbor.test_counts')::jsonb")
s=s.replace("if mode=='counts':dispatch=dispatch.replace(\"current_setting('arbor.test_counts')::jsonb\", \"(current_setting('arbor.test_counts')::jsonb || '{\\\"holdings\\\":999}'::jsonb)\")", "if mode=='counts':dispatch=dispatch.replace(\"current_setting('arbor.test_counts')::jsonb\", \"(current_setting('arbor.test_counts')::jsonb || '{\\\"holdings\\\":999}'::jsonb)\")")
for old,new in {'erasure_approval_expired':'manual_approval_expired','erasure_provider_checkpoint_changed':'manual_sessions_or_storage_remain','erasure_inventory_changed':'manual_inventory_changed','erasure_identity_or_request_changed':'manual_original_identity_changed','erasure_checkpoint_changed':'manual_operation_changed_or_held'}.items():s=s.replace(old,new)
def dispatch(owner,op,request,created,expiry):
 counts={k:None if k=='arbor_ask_usage_monthly' else 0 for k in m['TABLES']};counts['profiles']=1
 b=m['Binding']('gnjjtlswwhkpiabyayvi',owner,op,request,1,created,counts)
 issued=expiry-timedelta(seconds=180)
 return m['render'](b,'database',issued,expiry,approved=True,commit=True,admission_mode=MODE)
counts={k:None if k=='arbor_ask_usage_monthly' else 0 for k in m['TABLES']};counts['profiles']=1
literal="'"+json.dumps(counts,sort_keys=True,separators=(',',':'))+"'::jsonb"
# This JSON is only assigned in the manual DECLARE, where its cast is inferred.
# Match the literal without ::jsonb there.
s=s.replace('dispatch=dispatch.replace(manual_counts_literal', 'dispatch=dispatch.replace(manual_counts_literal')
s=s.replace("if mode=='success':assert result.returncode==0", "if mode=='success' and result.returncode:print(result.stderr)\n if mode=='success':assert result.returncode==0")
# remove BEGIN wrapper uses original fixture parser; renderer's trailing COMMIT remains exactly recognized.

def phase_chain(owner,op,request,created,expiry,phase):
    sql=dispatch(owner,op,request,created,expiry).replace("phase text:='database'", "phase text:='"+phase+"'")
    sql=sql.removeprefix('BEGIN;').removesuffix('COMMIT;')
    assert 'COMMIT;' not in sql
    return sql.replace(literal.removesuffix('::jsonb'), "current_setting('arbor.test_counts')::jsonb")
def complete_chain(owner,op,request,created,expiry):
    return phase_chain(owner,op,request,created,expiry,'database')+phase_chain(owner,op,request,created,expiry,'auth_ready')+f"DELETE FROM auth.sessions WHERE user_id='{owner}';DELETE FROM auth.users WHERE id='{owner}';"+phase_chain(owner,op,request,created,expiry,'auth_confirm')+phase_chain(owner,op,request,created,expiry,'complete')+phase_chain(owner,op,request,created,expiry,'complete')+f"""
DO $done$ BEGIN IF NOT EXISTS(SELECT 1 FROM arbor_private.account_erasure_operations WHERE id='{op}' AND state='completed' AND provider_status='pending_copies') THEN RAISE EXCEPTION 'manual_completion_not_demonstrated'; END IF; END $done$;
"""
s=s.replace("'hold']:","'hold','request','not_approved']:")
s=s.replace("'hold':f", "'request':f\"UPDATE arbor_private.account_deletion_requests SET status='withdrawn',withdrawn_at=clock_timestamp() WHERE user_id='{owner}';\",\n 'not_approved':'',\n 'hold':f".replace('\"','"').replace('\n','\n'))
s=s.replace("if mode=='counts':dispatch=", "if mode=='not_approved':dispatch=dispatch.replace('execution_approved boolean:=true','execution_approved boolean:=false')\n if mode=='counts':dispatch=")
s=s.replace("'hold':'manual_operation_changed_or_held'}", "'hold':'manual_operation_changed_or_held','request':'manual_request_or_barrier_changed','not_approved':'manual_execution_not_approved'}")
s=s.replace("'manual_operation_changed_or_held']", "'manual_operation_changed_or_held','manual_request_or_barrier_changed','manual_execution_not_approved']")
# Use rendered review/begin/session preflight phases instead of raw maintenance calls.
s=s.replace("SELECT arbor_private.erasure_review('{owner}','{request}',1,'{op}',true);\nSELECT arbor_private.erasure_begin('{op}');", "SELECT set_config('arbor.test_counts',arbor_private.erasure_inventory('{owner}')::text,true);\n{manual_phase(owner,op,request,created,expiry,'review')}\n{manual_phase(owner,op,request,created,expiry,'begin')}\n{manual_phase(owner,op,request,created,expiry,'sessions_ready')}")
s=s.replace('ROLLBACK TO SAVEPOINT before_dispatch;', "{manual_completion(owner,op,request,created,expiry)}\nROLLBACK TO SAVEPOINT before_dispatch;")

if MODE=='banned_barrier':
    s=s.replace('CREATE TABLE storage.objects(id uuid PRIMARY KEY,owner_id text NOT NULL);', 'CREATE TABLE storage.objects(id uuid PRIMARY KEY,owner_id text NOT NULL);CREATE TABLE storage.buckets(id text PRIMARY KEY);ALTER TABLE auth.users ADD COLUMN banned_until timestamptz;')
    s=s.replace("INSERT INTO profiles(user_id,full_name,country)", "UPDATE auth.users SET banned_until=clock_timestamp()+interval '1 hour' WHERE id='{owner}';INSERT INTO auth.sessions(id,user_id,created_at) VALUES('{uuid4()}','{owner}',clock_timestamp());\nINSERT INTO profiles(user_id,full_name,country)")
    s=s.replace("'hold','request','not_approved']:", "'hold','request','not_approved','ban_expired','ban_short','bucket','policy','surface','recreated','trigger','view','partial_ban_failure']:")
    s=s.replace("'sessions':f\"INSERT INTO auth.sessions(id,user_id,created_at) VALUES('{uuid4()}','{owner}',now());\",", "'sessions':f\"UPDATE auth.users SET banned_until=NULL WHERE id='{owner}';\",\n 'ban_expired':f\"UPDATE auth.users SET banned_until=clock_timestamp()-interval '1 second' WHERE id='{owner}';\",\n 'ban_short':f\"UPDATE auth.users SET banned_until=clock_timestamp()+interval '10 seconds' WHERE id='{owner}';\",\n 'bucket':\"INSERT INTO storage.buckets VALUES('unexpected');\",\n 'policy':\"DROP POLICY arbor_lifecycle_active ON public.profiles;\",\n 'surface':\"CREATE TABLE public.unreviewed_owner_data(user_id uuid);\",\n 'trigger':\"ALTER TABLE public.holdings DISABLE TRIGGER arbor_lifecycle_write;\",\n 'view':\"ALTER VIEW public.arbor_portfolio_history SET (security_invoker=false);\",\n 'recreated':'',\n 'partial_ban_failure':'',")
    s=s.replace("'sessions':'manual_sessions_or_storage_remain'", "'sessions':'manual_current_ban_required'")
    s=s.replace("'not_approved':'manual_execution_not_approved'}", "'not_approved':'manual_execution_not_approved','ban_expired':'manual_current_ban_required','ban_short':'manual_current_ban_required','bucket':'manual_storage_configuration_changed','policy':'manual_lifecycle_policy_changed','surface':'manual_unreviewed_owner_surface','recreated':'manual_auth_identity_still_present','trigger':'manual_lifecycle_trigger_changed','view':'manual_view_security_changed','partial_ban_failure':'manual_current_ban_required'}")
    s=s.replace("'manual_execution_not_approved']", "'manual_execution_not_approved','manual_current_ban_required','manual_storage_configuration_changed','manual_lifecycle_policy_changed','manual_unreviewed_owner_surface','manual_auth_identity_still_present','manual_lifecycle_trigger_changed','manual_view_security_changed']")
    s=s.replace("result=run(seed+change+dispatch+(verify if mode=='success' else 'ROLLBACK;'))", "result=run(seed+change+dispatch+(verify if mode=='success' else manual_recreated(owner,op,request,created,expiry) if mode=='recreated' else manual_partial(owner,op,request,created,expiry) if mode=='partial_ban_failure' else 'ROLLBACK;'))")
def partial(owner,op,request,created,expiry):
    return f"UPDATE auth.users SET banned_until=NULL WHERE id='{owner}';"+phase_chain(owner,op,request,created,expiry,'auth_ready')+'ROLLBACK;'
def recreated(owner,op,request,created,expiry):
    return f"DELETE FROM auth.sessions WHERE user_id='{owner}';DELETE FROM auth.users WHERE id='{owner}';INSERT INTO auth.users(id,email,created_at) VALUES('{owner}','recreated@example.test',clock_timestamp());"+phase_chain(owner,op,request,created,expiry,'auth_confirm')+'ROLLBACK;'
exec(compile(s,__file__,'exec'),{'manual_dispatch':dispatch,'manual_counts_literal':literal.removesuffix('::jsonb'),'manual_phase':phase_chain,'manual_completion':complete_chain,'manual_recreated':recreated,'manual_partial':partial})
