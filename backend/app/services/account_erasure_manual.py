"""Explicit operator SQL renderer; never connects or performs provider actions.

zero_sessions remains the default. banned_barrier must be selected deliberately
and independently qualified against the deployed Auth service before use.
"""
import json
from dataclasses import dataclass
from datetime import datetime,timedelta,timezone
from uuid import UUID

PHASES=('review','begin','sessions_ready','database','auth_ready','auth_confirm','complete')
TABLES={'admin_owner','arbor_investment_request_reviews','arbor_investment_requests','arbor_investment_entries','arbor_portfolio_holdings','arbor_portfolio_snapshots','arbor_portfolio_history_changes','arbor_monthly_checkins','arbor_pending_investment_recordings','arbor_pending_recording_reminders','holdings','profiles','arbor_ask_usage_monthly'}
@dataclass(frozen=True)
class Binding:
    project_ref:str
    owner:UUID
    operation:UUID
    request:UUID
    request_version:int
    created_at:datetime
    expected_counts:dict

def render(b,phase,issued_at,expires_at,*,approved=False,commit=False,admission_mode="zero_sessions"):
    if admission_mode not in ("zero_sessions", "banned_barrier"):
        raise ValueError("Explicit reviewed admission mode required")
    if not isinstance(b,Binding) or b.project_ref not in ('gnjjtlswwhkpiabyayvi','snvtjfkegpflfkfhmgef'):raise ValueError('Reviewed project required')
    for v in (b.owner,b.operation,b.request):
        if not isinstance(v,UUID):raise ValueError('UUID binding required')
    if type(b.request_version) is not int or b.request_version<0:raise ValueError('Version required')
    if phase not in PHASES or type(approved) is not bool or type(commit) is not bool:raise ValueError('Fixed phase/flags required')
    for d in (b.created_at,issued_at,expires_at):
        if not isinstance(d,datetime) or d.tzinfo is None:raise ValueError('Aware timestamps required')
    if not timedelta(0)<expires_at-issued_at<=timedelta(seconds=180):raise ValueError('Max180s approval required')
    if set(b.expected_counts) not in (TABLES,TABLES|{'terms_acceptances'},TABLES|{'arbor_ask_feedback'},TABLES|{'terms_acceptances','arbor_ask_feedback'}) or any(v is None and k!='arbor_ask_usage_monthly' or v is not None and (type(v) is not int or v<0) for k,v in b.expected_counts.items()) or sum(v or 0 for v in b.expected_counts.values())>10000:raise ValueError('Complete bounded counts required')
    owner,op,req=map(str,(b.owner,b.operation,b.request));created=b.created_at.isoformat();counts=json.dumps(b.expected_counts,sort_keys=True,separators=(',',':'))
    common=f"""BEGIN;
SET LOCAL statement_timeout='8s'; SET LOCAL lock_timeout='2s';
-- External tool target MUST be project_id={b.project_ref}; SQL cannot infer project ref.
-- No writes to managed Auth/Storage tables; one operator/operation at a time.
DO $manual$ DECLARE
 owner_id uuid:='{owner}'; operation_id uuid:='{op}'; request_id uuid:='{req}';
 original_created timestamptz:='{created}'; request_version bigint:={b.request_version};
 expected_counts jsonb:='{counts}'; issued timestamptz:='{issued_at.isoformat()}'; expiry timestamptz:='{expires_at.isoformat()}';
 phase text:='{phase}'; admission_mode text:='{admission_mode}'; execution_approved boolean:={'true' if approved else 'false'};
 o arbor_private.account_erasure_operations%rowtype; current_counts jsonb; banned_until timestamptz; t text;
BEGIN
 IF NOT execution_approved THEN RAISE EXCEPTION 'manual_execution_not_approved'; END IF;
 IF session_user<>pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid='arbor_private.erasure_data(uuid)'::regprocedure)) THEN RAISE EXCEPTION 'manual_operator_owner_mismatch'; END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('arbor-account-lifecycle:'||owner_id::text,0)) THEN RAISE EXCEPTION 'manual_operation_busy'; END IF;
 IF clock_timestamp()<issued OR clock_timestamp()>=expiry OR expiry-issued>interval '180 seconds' THEN RAISE EXCEPTION 'manual_approval_expired'; END IF;
 SELECT * INTO o FROM arbor_private.account_erasure_operations WHERE id=operation_id FOR UPDATE;
 IF FOUND AND (o.owner_id<>owner_id OR o.request_id<>request_id OR o.request_version<>request_version OR o.holds<>'[]'::jsonb) THEN RAISE EXCEPTION 'manual_operation_changed_or_held'; END IF;
 IF phase<>'review' AND NOT FOUND THEN RAISE EXCEPTION 'manual_operation_missing'; END IF;
 -- Reconciliation is read-only: never repeat an already committed destructive phase.
 IF (phase='begin' AND o.state IN ('erasing','data_erased','auth_erased','completed'))
 OR (phase='database' AND o.state IN ('data_erased','auth_erased','completed'))
 OR (phase='auth_confirm' AND o.state IN ('auth_erased','completed'))
 OR (phase='complete' AND o.state='completed') THEN RETURN; END IF;
 IF phase IN ('review','begin','sessions_ready','database','auth_ready') THEN
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=owner_id AND created_at=original_created) THEN RAISE EXCEPTION 'manual_original_identity_changed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM arbor_private.account_lifecycle l JOIN arbor_private.account_deletion_requests q USING(user_id)
   WHERE l.user_id=owner_id AND q.request_id=request_id AND q.status='pending'
   AND l.state=CASE WHEN phase IN ('review','begin') THEN 'deletion_pending' ELSE 'erasing' END
   AND l.version=request_version+CASE WHEN phase IN ('review','begin') THEN 0 ELSE 1 END) THEN RAISE EXCEPTION 'manual_request_or_barrier_changed'; END IF;
 END IF;
 current_counts:=arbor_private.erasure_inventory(owner_id);
 IF phase IN ('review','begin','sessions_ready','database') AND (current_counts IS DISTINCT FROM expected_counts OR (phase<>'review' AND o.counts IS DISTINCT FROM expected_counts)) THEN RAISE EXCEPTION 'manual_inventory_changed'; END IF;
 IF phase IN ('database','auth_ready','auth_confirm','complete') AND
 (EXISTS(SELECT 1 FROM storage.objects WHERE owner_id=owner_id::text)
 OR ((admission_mode='zero_sessions' OR phase IN ('auth_confirm','complete')) AND EXISTS(SELECT 1 FROM auth.sessions WHERE user_id=owner_id)))
 THEN RAISE EXCEPTION 'manual_sessions_or_storage_remain'; END IF;
 -- Optional reviewed feedback storage must remain a closed RPC-only surface.
 IF to_regclass('public.arbor_ask_feedback') IS NOT NULL AND (
 NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=to_regclass('public.arbor_ask_feedback') AND c.relkind='r' AND c.relrowsecurity
  AND c.relowner=(SELECT proowner FROM pg_proc WHERE oid='arbor_private.erasure_data(uuid)'::regprocedure))
 OR (SELECT count(*) FROM pg_attribute WHERE attrelid=to_regclass('public.arbor_ask_feedback') AND attnum>0 AND NOT attisdropped)<>7
 OR (SELECT count(*) FROM pg_attribute WHERE attrelid=to_regclass('public.arbor_ask_feedback') AND attnum>0 AND NOT attisdropped AND attname IN ('id','user_id','helpful','reason','intent','answer_version','created_at'))<>7
 OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=to_regclass('public.arbor_ask_feedback'))
 OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.arbor_ask_feedback') AND NOT tgisinternal)
 OR has_table_privilege('authenticated','public.arbor_ask_feedback','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
 OR has_table_privilege('anon','public.arbor_ask_feedback','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
 OR has_table_privilege('service_role','public.arbor_ask_feedback','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
 OR EXISTS(SELECT 1 FROM information_schema.column_privileges WHERE table_schema='public' AND table_name='arbor_ask_feedback' AND grantee IN ('PUBLIC','anon','authenticated','service_role'))
 OR NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=to_regclass('public.arbor_ask_feedback') AND k.contype='f' AND k.confrelid='auth.users'::regclass
  AND k.confdeltype='c' AND k.convalidated
  AND k.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=k.conrelid AND attname='user_id')]::smallint[])
 ) THEN RAISE EXCEPTION 'manual_feedback_security_changed'; END IF;
 IF admission_mode='banned_barrier' AND phase IN ('sessions_ready','database','auth_ready') THEN
  -- Ban is NOT session revocation. Lock identity to prevent concurrent unban/
  -- replacement during this transaction; cached JWTs meet DB erasing guards.
  SELECT u.banned_until INTO banned_until FROM auth.users u
   WHERE u.id=owner_id AND u.created_at=original_created FOR UPDATE;
  IF banned_until IS NULL OR banned_until<=clock_timestamp() OR banned_until<expiry
  THEN RAISE EXCEPTION 'manual_current_ban_required'; END IF;
  -- This lane supports the verified no-Storage-feature configuration only.
  -- New buckets/policies need a new admission design, never silent fallback.
  IF to_regclass('storage.buckets') IS NULL OR EXISTS(SELECT 1 FROM storage.buckets)
   OR EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage')
  THEN RAISE EXCEPTION 'manual_storage_configuration_changed'; END IF;
  IF EXISTS(SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
   JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
   AND c.relkind IN ('r','p','v','m') AND a.attname IN ('user_id','owner_id') AND NOT a.attisdropped
   AND c.relname NOT IN ('arbor_investment_request_reviews','arbor_investment_requests','arbor_investment_entries','arbor_portfolio_holdings','arbor_portfolio_snapshots','arbor_portfolio_history_changes','arbor_monthly_checkins','arbor_pending_investment_recordings','arbor_pending_recording_reminders','holdings','profiles','arbor_ask_usage_monthly','arbor_ask_feedback','arbor_budget_versions','arbor_plan_versions','arbor_portfolio_history','arbor_investment_entry_values','arbor_portfolio_observed_history_status','arbor_portfolio_holding_ledger_values','arbor_portfolio_holding_values'))
  THEN RAISE EXCEPTION 'manual_unreviewed_owner_surface'; END IF;
  -- Histories are read-only owner surfaces erased through the profile FK.
  -- Keep the legacy inventory's category counts; this is supplemental coverage.
  IF (to_regclass('public.arbor_budget_versions') IS NULL) IS DISTINCT FROM
     (to_regclass('public.arbor_plan_versions') IS NULL)
  THEN RAISE EXCEPTION 'manual_history_schema_changed'; END IF;
  FOREACH t IN ARRAY ARRAY['arbor_budget_versions','arbor_plan_versions'] LOOP
   IF to_regclass('public.'||t) IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=to_regclass('public.'||t)
       AND c.relkind='r' AND c.relrowsecurity
       AND c.relowner=(SELECT proowner FROM pg_proc WHERE oid='arbor_private.erasure_data(uuid)'::regprocedure))
     OR NOT EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=to_regclass('public.'||t)
       AND NOT p.polpermissive AND p.polname='arbor_lifecycle_active'
       AND (SELECT oid FROM pg_roles WHERE rolname='authenticated')=ANY(p.polroles)
       AND pg_get_expr(p.polqual,p.polrelid) LIKE '%arbor_account_active_v1%')
     OR NOT EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=to_regclass('public.'||t)
       AND p.polpermissive AND p.polcmd='r'
       AND (SELECT oid FROM pg_roles WHERE rolname='authenticated')=ANY(p.polroles)
       AND regexp_replace(pg_get_expr(p.polqual,p.polrelid),'[[:space:]]','','g')='((SELECTauth.uid()ASuid)=user_id)')
     OR (SELECT count(*) FROM pg_policy p WHERE p.polrelid=to_regclass('public.'||t))<>2
     OR has_table_privilege('authenticated','public.'||t,'INSERT,UPDATE,DELETE,TRUNCATE')
     OR has_table_privilege('anon','public.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
     OR has_table_privilege('service_role','public.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
     OR NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=to_regclass('public.'||t)
       AND k.contype='f' AND k.confrelid='public.profiles'::regclass
       AND k.confdeltype='c' AND k.convalidated
       AND k.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=k.conrelid AND attname='user_id')]::smallint[]
       AND k.confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=k.confrelid AND attname='user_id')]::smallint[])
    THEN RAISE EXCEPTION 'manual_history_security_changed'; END IF;
   END IF;
  END LOOP;
  IF to_regclass('public.arbor_plan_versions') IS NOT NULL AND (
   to_regclass('public.arbor_plan_versions_id_seq') IS NULL
   OR has_sequence_privilege('authenticated','public.arbor_plan_versions_id_seq','USAGE,SELECT,UPDATE')
   OR has_sequence_privilege('anon','public.arbor_plan_versions_id_seq','USAGE,SELECT,UPDATE')
   OR has_sequence_privilege('service_role','public.arbor_plan_versions_id_seq','USAGE,SELECT,UPDATE'))
  THEN RAISE EXCEPTION 'manual_history_security_changed'; END IF;
  IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname IN ('arbor_portfolio_history','arbor_investment_entry_values','arbor_portfolio_observed_history_status','arbor_portfolio_holding_ledger_values','arbor_portfolio_holding_values')
   AND (c.relkind<>'v' OR NOT coalesce(c.reloptions @> ARRAY['security_invoker=true'],false)))
  THEN RAISE EXCEPTION 'manual_view_security_changed'; END IF;
  FOREACH t IN ARRAY ARRAY['profiles','holdings','arbor_portfolio_holdings','arbor_investment_entries','arbor_portfolio_snapshots','arbor_portfolio_history_changes','arbor_monthly_checkins','arbor_pending_investment_recordings','arbor_ask_usage_monthly'] LOOP
   IF to_regclass('public.'||t) IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_policy p ON p.polrelid=c.oid WHERE n.nspname='public' AND c.relname=t
    AND c.relrowsecurity AND p.polname='arbor_lifecycle_active' AND NOT p.polpermissive
    AND (SELECT oid FROM pg_roles WHERE rolname='authenticated')=ANY(p.polroles)
    AND pg_get_expr(p.polqual,p.polrelid) LIKE '%arbor_account_active_v1%'
    AND pg_get_expr(p.polwithcheck,p.polrelid) LIKE '%arbor_account_active_v1%')
   THEN RAISE EXCEPTION 'manual_lifecycle_policy_changed'; END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['profiles','holdings','arbor_portfolio_holdings','arbor_investment_entries','arbor_portfolio_snapshots','arbor_portfolio_history_changes','arbor_monthly_checkins','arbor_ask_usage_monthly'] LOOP
   IF to_regclass('public.'||t) IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM pg_trigger g WHERE g.tgrelid=to_regclass('public.'||t)
    AND g.tgname='arbor_lifecycle_write' AND g.tgenabled IN ('O','A')
    AND g.tgfoid='arbor_private.guard_lifecycle_write()'::regprocedure)
   THEN RAISE EXCEPTION 'manual_lifecycle_trigger_changed'; END IF;
  END LOOP;
 END IF;
 IF to_regclass('public.arbor_investment_requests') IS NULL
 OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid='public.arbor_investment_requests'::regclass AND c.relkind='r' AND c.relrowsecurity)
 OR (SELECT count(*) FROM pg_attribute a WHERE a.attrelid='public.arbor_investment_requests'::regclass AND a.attnum>0 AND NOT a.attisdropped AND a.attname IN ('id','user_id','investment_name','provider','idempotency_key','received_at'))<>6
 OR (SELECT count(*) FROM pg_attribute a WHERE a.attrelid='public.arbor_investment_requests'::regclass AND a.attnum>0 AND NOT a.attisdropped)<>6
 OR (SELECT count(*) FROM pg_policy p WHERE p.polrelid='public.arbor_investment_requests'::regclass)<>3
 OR NOT EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid='public.arbor_investment_requests'::regclass AND p.polname='arbor_lifecycle_active' AND NOT p.polpermissive AND (SELECT oid FROM pg_roles WHERE rolname='authenticated')=ANY(p.polroles) AND pg_get_expr(p.polqual,p.polrelid) LIKE '%arbor_account_active_v1%' AND pg_get_expr(p.polwithcheck,p.polrelid) LIKE '%arbor_account_active_v1%')
 OR NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid='public.arbor_investment_requests'::regclass AND k.contype='f' AND k.confrelid='auth.users'::regclass AND k.confdeltype='c' AND k.convalidated AND k.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=k.conrelid AND attname='user_id')]::smallint[])
 OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid='public.arbor_investment_requests'::regclass AND c.relowner=(SELECT proowner FROM pg_proc WHERE oid='arbor_private.erasure_data(uuid)'::regprocedure))
 OR NOT EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid='public.arbor_investment_requests'::regclass AND p.polname='investment_request_read' AND p.polpermissive AND p.polcmd='r' AND (SELECT oid FROM pg_roles WHERE rolname='authenticated')=ANY(p.polroles) AND regexp_replace(pg_get_expr(p.polqual,p.polrelid),'[[:space:]]','','g')='((SELECTauth.uid()ASuid)=user_id)')
 OR NOT EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid='public.arbor_investment_requests'::regclass AND p.polname='investment_request_insert' AND p.polpermissive AND p.polcmd='a' AND (SELECT oid FROM pg_roles WHERE rolname='authenticated')=ANY(p.polroles) AND regexp_replace(pg_get_expr(p.polwithcheck,p.polrelid),'[[:space:]]','','g')='((SELECTauth.uid()ASuid)=user_id)')
 OR has_table_privilege('authenticated','public.arbor_investment_requests','UPDATE,DELETE,TRUNCATE')
 OR has_column_privilege('authenticated','public.arbor_investment_requests','user_id','INSERT')
 OR has_column_privilege('authenticated','public.arbor_investment_requests','id','INSERT')
 OR has_column_privilege('authenticated','public.arbor_investment_requests','received_at','INSERT')
 OR has_table_privilege('anon','public.arbor_investment_requests','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
 OR has_table_privilege('service_role','public.arbor_investment_requests','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
 OR NOT EXISTS(SELECT 1 FROM pg_trigger g WHERE g.tgrelid='public.arbor_investment_requests'::regclass AND g.tgname='arbor_lifecycle_write' AND g.tgenabled IN ('O','A') AND g.tgfoid='arbor_private.guard_lifecycle_write()'::regprocedure)
 THEN RAISE EXCEPTION 'manual_request_security_changed'; END IF;
 -- Explicit new Admin surfaces; unknown-surface denial remains above.
 IF to_regclass('public.arbor_investment_request_reviews') IS NULL
 OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.arbor_investment_request_reviews'::regclass AND relkind='r' AND relrowsecurity)
 OR (SELECT count(*) FROM pg_attribute WHERE attrelid='public.arbor_investment_request_reviews'::regclass AND attnum>0 AND NOT attisdropped)<>5
 OR (SELECT count(*) FROM pg_attribute WHERE attrelid='public.arbor_investment_request_reviews'::regclass AND attnum>0 AND NOT attisdropped AND attname IN ('request_'||'id','user_id','status','revision','updated_at'))<>5
 OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.arbor_investment_request_reviews'::regclass)
 OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.arbor_investment_request_reviews'::regclass AND relowner=(SELECT proowner FROM pg_proc WHERE oid='arbor_private.erasure_data(uuid)'::regprocedure))
 OR has_any_column_privilege('authenticated','public.arbor_investment_request_reviews','SELECT,INSERT,UPDATE,REFERENCES')
 OR has_any_column_privilege('anon','public.arbor_investment_request_reviews','SELECT,INSERT,UPDATE,REFERENCES')
 OR has_any_column_privilege('service_role','public.arbor_investment_request_reviews','SELECT,INSERT,UPDATE,REFERENCES')
 OR has_table_privilege('authenticated','public.arbor_investment_request_reviews','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
 OR has_table_privilege('anon','public.arbor_investment_request_reviews','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
 OR has_table_privilege('service_role','public.arbor_investment_request_reviews','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
 OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.arbor_investment_request_reviews'::regclass AND confrelid='public.arbor_investment_requests'::regclass AND contype='f' AND confdeltype='c' AND convalidated)
 OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.arbor_investment_request_reviews'::regclass AND confrelid='auth.users'::regclass AND contype='f' AND confdeltype='c' AND convalidated)
 OR EXISTS(SELECT 1 FROM public.arbor_investment_request_reviews w JOIN public.arbor_investment_requests r ON r.id=w.request_id WHERE w.user_id<>r.user_id)
 OR to_regclass('arbor_private.admin_owner') IS NULL
 OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='arbor_private.admin_owner'::regclass AND relkind='r' AND relrowsecurity)
 OR (SELECT count(*) FROM pg_attribute WHERE attrelid='arbor_private.admin_owner'::regclass AND attnum>0 AND NOT attisdropped)<>2
 OR (SELECT count(*) FROM pg_attribute WHERE attrelid='arbor_private.admin_owner'::regclass AND attnum>0 AND NOT attisdropped AND attname IN ('user_id','singleton'))<>2
 OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='arbor_private.admin_owner'::regclass)
 OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='arbor_private.admin_owner'::regclass AND relowner=(SELECT proowner FROM pg_proc WHERE oid='arbor_private.erasure_data(uuid)'::regprocedure))
 OR has_any_column_privilege('authenticated','arbor_private.admin_owner','SELECT,INSERT,UPDATE,REFERENCES')
 OR has_any_column_privilege('anon','arbor_private.admin_owner','SELECT,INSERT,UPDATE,REFERENCES')
 OR has_any_column_privilege('service_role','arbor_private.admin_owner','SELECT,INSERT,UPDATE,REFERENCES')
 OR has_table_privilege('authenticated','arbor_private.admin_owner','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
 OR has_table_privilege('anon','arbor_private.admin_owner','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
 OR has_table_privilege('service_role','arbor_private.admin_owner','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
 OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='arbor_private.admin_owner'::regclass AND confrelid='auth.users'::regclass AND contype='f' AND confdeltype='c' AND convalidated)
 THEN RAISE EXCEPTION 'manual_admin_security_changed'; END IF;
 IF phase IN ('auth_ready','auth_confirm','complete') AND EXISTS(SELECT 1 FROM jsonb_each(current_counts) e WHERE e.value<>'null'::jsonb AND e.value<>'0'::jsonb) THEN RAISE EXCEPTION 'manual_primary_rows_remain'; END IF;
 IF clock_timestamp()>=expiry THEN RAISE EXCEPTION 'manual_approval_expired'; END IF;
 IF phase='review' THEN PERFORM arbor_private.erasure_review(owner_id,request_id,request_version,operation_id,true,'[]'::jsonb);
 ELSIF phase='begin' THEN
  IF o.state<>'reviewed' THEN RAISE EXCEPTION 'manual_wrong_checkpoint'; END IF;
  PERFORM arbor_private.erasure_begin(operation_id);
 ELSIF phase='sessions_ready' THEN
  IF o.state<>'erasing' THEN RAISE EXCEPTION 'manual_wrong_checkpoint'; END IF;
  -- No provider call. Zero-session mode uses supported global signout;
  -- banned-barrier mode requires separately approved supported Ban, not logout.
  NULL;
 ELSIF phase='database' THEN
  IF o.state<>'erasing' THEN RAISE EXCEPTION 'manual_wrong_checkpoint'; END IF;
  PERFORM arbor_private.erasure_data(operation_id);
 ELSIF phase='auth_ready' THEN
  IF o.state<>'data_erased' THEN RAISE EXCEPTION 'manual_wrong_checkpoint'; END IF;
  NULL; -- No Auth DELETE here. Owner must separately approve and act via supported console/API.
 ELSIF phase='auth_confirm' THEN
  IF EXISTS(SELECT 1 FROM auth.users WHERE id=owner_id) THEN RAISE EXCEPTION 'manual_auth_identity_still_present'; END IF;
  PERFORM arbor_private.erasure_auth_confirm(operation_id);
 ELSIF phase='complete' THEN
  IF o.state<>'auth_erased' OR EXISTS(SELECT 1 FROM auth.users WHERE id=owner_id) THEN RAISE EXCEPTION 'manual_wrong_checkpoint'; END IF;
  PERFORM arbor_private.erasure_finish(operation_id,'pending_copies');
 END IF;
END $manual$;
SELECT jsonb_build_object('operation',id,'state',state,'held',holds<>'[]'::jsonb,'provider_status',provider_status,'completed_at',completed_at,'whole_account_erasure_claim',false) result
 FROM arbor_private.account_erasure_operations journal WHERE journal.id='{op}' AND journal.owner_id='{owner}';
{'COMMIT' if commit else 'ROLLBACK'};
"""
    # Qualify columns to avoid PL/pgSQL owner_id variable ambiguity.
    common=common.replace('FROM storage.objects WHERE owner_id=owner_id::text','FROM storage.objects s WHERE s.owner_id=owner_id::text')
    import re
    for name in ('owner_id','operation_id','request_id','request_version','original_created','expected_counts'):
        common=re.sub(r'(?<![.a-zA-Z0-9_])'+name+r'\b','bound_'+name,common)
    return common.strip()
