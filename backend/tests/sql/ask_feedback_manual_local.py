"""Local-only manual export/erasure adapter compatibility and drift rejection."""
import json,subprocess,uuid
from datetime import datetime,timedelta,timezone
from app.services.account_erasure_manual import Binding,render
P=['/opt/homebrew/opt/postgresql@17/bin/psql','-w','-X','-q','-At','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','55448','-U','arbor_requests_test','-d','arbor_ask_feedback_local']
def sql(q):
 r=subprocess.run(P,input=q,capture_output=True,text=True,timeout=15);assert r.returncode==0,r.stderr;return r.stdout.strip()
assert sql('select current_database();')=='arbor_ask_feedback_local'
assert sql("select current_setting('data_directory');")in['/tmp/arbor-requests-pg','/private/tmp/arbor-requests-pg']
owner,operation,request=[uuid.uuid4()for _ in range(3)]
sql(f"insert into auth.users(id,email)values('{owner}','feedback-manual@example.test');insert into arbor_private.account_lifecycle(user_id,state,version)values('{owner}','deletion_pending',1);insert into arbor_private.account_deletion_requests(user_id,request_id,status,requested_at)values('{owner}','{request}','pending',now());")
created=datetime.fromisoformat(sql(f"select created_at from auth.users where id='{owner}';"));counts=json.loads(sql(f"select arbor_private.erasure_inventory('{owner}');"))
b=Binding('gnjjtlswwhkpiabyayvi',owner,operation,request,1,created,counts)
def attempt(expected=None):
 now=datetime.now(timezone.utc);command=render(b,'review',now,now+timedelta(seconds=120),approved=True,commit=False)
 r=subprocess.run(P,input=command,capture_output=True,text=True,timeout=15)
 if expected:assert r.returncode!=0 and expected in r.stderr,r.stderr
 else:assert r.returncode==0,r.stderr
attempt()
try:
 sql('GRANT SELECT ON public.arbor_ask_feedback TO authenticated;');attempt('manual_feedback_security_changed')
finally:sql('REVOKE SELECT ON public.arbor_ask_feedback FROM authenticated;')
try:
 sql('ALTER TABLE public.arbor_ask_feedback ADD COLUMN unexpected_text text;');attempt('manual_feedback_security_changed')
finally:sql('ALTER TABLE public.arbor_ask_feedback DROP COLUMN unexpected_text;')
attempt()
assert sql(f"select count(*) from arbor_private.account_erasure_operations where id='{operation}';")=='0'
print(json.dumps({'checks':5,'schemaCompatible':True,'grantDriftRejected':True,'extraColumnRejected':True,'allManualReviewTransactionsRolledBack':True,'destructivePhasesExecuted':0,'hostedWrites':0}))
