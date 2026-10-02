"""Synthetic requests erased through the real bounded manual pipeline; localhost only."""
import os,json,subprocess,uuid,time
from datetime import datetime,timedelta,timezone
from app.services.account_erasure_manual import Binding,render,TABLES
assert os.environ.get('ARBOR_LOCAL_REQUEST_TEST')=='1'
P=['/opt/homebrew/opt/postgresql@17/bin/psql','-w','-X','-q','-At','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','55448','-U','arbor_requests_test','-d','postgres']
def sql(q,good=True):
 r=subprocess.run(P+['-c',q],text=True,capture_output=True)
 if good:assert r.returncode==0,r.stderr;return r.stdout.strip()
 assert r.returncode!=0;return r.stderr
assert '/arbor-requests-pg' in sql("select current_setting('data_directory')")
A,B,S,T,Q,O=[str(uuid.uuid4())for _ in range(6)]
sql(f"insert into auth.users(id,email)values('{A}','erase-request-a@example.test'),('{B}','erase-request-b@example.test');insert into auth.sessions(id,user_id,created_at)values('{S}','{A}',now()),('{T}','{B}',now());insert into arbor_private.account_lifecycle(user_id,state)values('{A}','active'),('{B}','active');insert into arbor_investment_requests(user_id,investment_name,provider,idempotency_key)values('{A}','Request A','Provider','{uuid.uuid4()}'),('{B}','Request B','Provider','{uuid.uuid4()}');")
other=sql(f"select row_to_json(r) from arbor_investment_requests r where user_id='{B}'")
counts=json.loads(sql(f"select arbor_private.erasure_inventory('{A}')"));assert counts['arbor_investment_requests']==1
assert set(counts)==TABLES|{'terms_acceptances'}
sql(f"update arbor_private.account_lifecycle set state='deletion_pending',version=1 where user_id='{A}';insert into arbor_private.account_deletion_requests(user_id,request_id,status,requested_at)values('{A}','{Q}','pending',now());")
created=datetime.fromisoformat(sql(f"select created_at from auth.users where id='{A}'"));binding=Binding('gnjjtlswwhkpiabyayvi',uuid.UUID(A),uuid.UUID(O),uuid.UUID(Q),1,created,counts)
def phase(name,approve=True):
 n=datetime.now(timezone.utc);return render(binding,name,n,n+timedelta(seconds=180),approved=approve,commit=True)
assert 'manual_execution_not_approved' in sql(phase('review',False),False)
# A changed policy is still rejected rather than broadening an owner-surface allowlist.
sql('grant update on public.arbor_investment_requests to authenticated')
failure=sql(phase('review'),False);assert 'manual_request_security_changed' in failure,failure
sql('revoke update on public.arbor_investment_requests from authenticated')
for column in ['user_id','id','received_at']:
 sql(f'grant insert({column}) on public.arbor_investment_requests to authenticated')
 failure=sql(phase('review'),False);assert 'manual_request_security_changed' in failure,failure
 sql(f'revoke insert({column}) on public.arbor_investment_requests from authenticated')
sql('alter table public.arbor_investment_requests disable trigger arbor_lifecycle_write')
failure=sql(phase('review'),False);assert 'manual_request_security_changed' in failure,failure
sql('alter table public.arbor_investment_requests enable trigger arbor_lifecycle_write')
sql('drop policy investment_request_read on public.arbor_investment_requests;create policy investment_request_read on public.arbor_investment_requests for select to authenticated using(true)')
failure=sql(phase('review'),False);assert 'manual_request_security_changed' in failure,failure
sql('drop policy investment_request_read on public.arbor_investment_requests;create policy investment_request_read on public.arbor_investment_requests for select to authenticated using((select auth.uid())=user_id)')
sql(phase('review'));sql(phase('begin'))
assert 'manual_sessions_or_storage_remain' in sql(phase('database'),False)
# Simulate supported session removal only on this synthetic local Auth fixture.
sql(f"delete from auth.sessions where user_id='{A}'")
sql(phase('sessions_ready'));sql(phase('database'))
assert sql(f"select count(*) from arbor_investment_requests where user_id='{A}'")=='0'
assert sql(f"select row_to_json(r) from arbor_investment_requests r where user_id='{B}'")==other
assert all(v in (0,None)for v in json.loads(sql(f"select arbor_private.erasure_inventory('{A}')")).values())
sql(phase('auth_ready'))
assert 'manual_auth_identity_still_present' in sql(phase('auth_confirm'),False)
sql(f"delete from auth.users where id='{A}'")
sql(phase('auth_confirm'));sql(phase('complete'))
assert sql(f"select state from arbor_private.account_erasure_operations where id='{O}'")=='completed'
# App roles cannot execute private erasure maintenance functions.
for role in ['anon','authenticated','service_role']:
 assert sql(f"select has_function_privilege('{role}','arbor_private.erasure_data(uuid)','EXECUTE')")=='f'
print(json.dumps({'manualInventoryIncludesRequest':True,'explicitApprovalRequired':True,'sessionsRequiredAbsent':True,'ownerOnlyErasure':True,'otherOwnerBytesUnchanged':True,'policyGrantTriggerDriftDenied':True,'authIdentityCheckpointPreserved':True,'privateErasureDeniedToAppRoles':True,'completeSyntheticLocalPipeline':True,'hostedWrites':0,'wholeAccountErasureClaim':False}))
