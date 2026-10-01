"""Production repository dispatch on approved rolled-back localhost fixtures only.

Reuses the established disposable fixture pattern; no network/provider clients.
This executes actual SQL, not a claim about managed Supabase gateway behavior.
"""
from pathlib import Path
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from app.services.account_erasure_operator import SqlOperatorRepository, OperatorTarget
from app.services.account_erasure import Approval

def dispatch(approval, evidence):
    repo=object.__new__(SqlOperatorRepository)
    repo.target=OperatorTarget('gnjjtlswwhkpiabyayvi',evidence.owner_id,
                              approval.operation_id,evidence.created_at)
    issued=approval
    if approval.expires_at <= datetime.now(timezone.utc):
        issued=replace(approval,expires_at=datetime.now(timezone.utc)+timedelta(seconds=180))
    repo._locked=True; repo.approval=issued; queries=[]
    repo._query=lambda q,*a,**k:queries.append(q)
    repo.read=lambda key: {}
    operation={'id':approval.operation_id,'owner_id':approval.owner_id}
    repo.erase_data(operation)
    sql=queries[0].replace(issued.expires_at.isoformat(),approval.expires_at.isoformat())
    return 'BEGIN;'+sql+'COMMIT;'

# Original fixture lives entirely inside BEGIN/ROLLBACK and verifies all baseline
# fingerprints. Adapt only dispatch/error expectations, not guards or permissions.
def completion(owner, op, created, expiry):
    repo=object.__new__(SqlOperatorRepository)
    repo.target=OperatorTarget('gnjjtlswwhkpiabyayvi',owner,op,created)
    repo._locked=True; repo.approval=Approval(op,owner,'auth',expiry); queries=[]
    repo._query=lambda q,*a,**k:queries.append(q)
    repo.read=lambda key: {}
    operation={'id':op,'owner_id':owner,'provider_status':'pending_copies'}
    repo.mark_auth_erased(operation)
    repo.approval=replace(repo.approval,phase='complete')
    repo.complete(operation)
    return f"DELETE FROM auth.users WHERE id='{owner}';"+''.join(queries)+f"""
    DO $receipt$ BEGIN
      IF EXISTS(SELECT 1 FROM auth.users WHERE id='{owner}')
      OR NOT EXISTS(SELECT 1 FROM arbor_private.account_erasure_operations
        WHERE id='{op}' AND state='completed' AND provider_status='pending_copies'
          AND receipt_expires_at IS NOT NULL) THEN RAISE EXCEPTION 'receipt_unconfirmed'; END IF;
    END $receipt$;
    """

s=Path('tests/sql/account_erasure_continuation_rollback_local.py').read_text()
s=s.replace('dispatch=database_dispatch_sql(Approval(op,owner,\'database\',expiry),e)',
            "dispatch=operator_dispatch(Approval(op,owner,'data',expiry),e)")
lifecycle_sql = """
INSERT INTO auth.users(id,email,created_at) VALUES('{third}','operator-lifecycle@example.test',now());
INSERT INTO auth.sessions(id,user_id,created_at) VALUES('{sid}','{third}',now());
SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated','aud','authenticated','sub','{third}','session_id','{sid}','iat',extract(epoch FROM now()),'exp',extract(epoch FROM now())+3600)::text,true);
SELECT public.arbor_account_lifecycle_v1('request_deletion',0,'{action}',true);
UPDATE arbor_private.account_lifecycle SET changed_at=now()-interval '2 seconds',deactivated_at=now()-interval '1 second' WHERE user_id='{third}';
SELECT public.arbor_account_lifecycle_v1('cancel_deletion',1,'{cancel}',true);
DO $cancel$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM arbor_private.account_lifecycle WHERE user_id='{third}' AND state='active' AND version=2) THEN RAISE EXCEPTION 'cancel_unconfirmed'; END IF;
END $cancel$;
SELECT set_config('request.jwt.claims','{{}}',true);
"""
s=s.replace("created=datetime.now(timezone.utc)", "third,sid,action,cancel=[uuid4() for _ in range(4)]\n lifecycle=operator_lifecycle.format(third=third,sid=sid,action=action,cancel=cancel)\n created=datetime.now(timezone.utc)")
s=s.replace("CREATE TABLE storage.objects(id uuid PRIMARY KEY,owner_id text NOT NULL);", "CREATE TABLE storage.objects(id uuid PRIMARY KEY,owner_id text NOT NULL);\n{lifecycle}")
s=s.replace("dispatch=dispatch.removeprefix('BEGIN;').removesuffix('COMMIT;')", "dispatch=dispatch.removeprefix('BEGIN;').removesuffix('COMMIT;')\n completion=operator_completion(owner,op,created,expiry) if mode=='success' else ''")
s=s.replace('END $verify$;\nROLLBACK TO SAVEPOINT before_dispatch;', 'END $verify$;\n{completion}\nROLLBACK TO SAVEPOINT before_dispatch;')
s=s.replace("'erasure_approval_expired'", "'approval_expired'")
s=s.replace("'erasure_provider_checkpoint_changed'", "'provider_checkpoint_changed'")
s=s.replace("'erasure_inventory_changed'", "'inventory_changed'")
s=s.replace("'erasure_identity_or_request_changed'", "'identity_changed'")
s=s.replace("'erasure_checkpoint_changed'", "'bound_operation_changed'")
s=s.replace("if mode=='counts':dispatch=dispatch.replace(\"current_setting('arbor.test_counts')::jsonb\", \"(current_setting('arbor.test_counts')::jsonb || '{\\\"holdings\\\":999}'::jsonb)\")",
            "if mode=='counts':dispatch=dispatch.replace('IS DISTINCT FROM o.counts',\"IS DISTINCT FROM (o.counts || '{\\\"holdings\\\":999}'::jsonb)\")")
assert 'if mode==\'counts\':dispatch=dispatch.replace(\'IS DISTINCT' in s
s=s.replace("if mode=='success':assert result.returncode==0","if mode=='success' and result.returncode:print(result.stderr,flush=True)\n if mode=='success':assert result.returncode==0")
exec(compile(s,__file__,'exec'),{'operator_dispatch':dispatch,'operator_completion':completion,'operator_lifecycle':lifecycle_sql})
