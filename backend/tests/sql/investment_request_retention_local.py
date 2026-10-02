"""Proposed cleanup policy qualified in a rollback-only disposable local fixture."""
import os,uuid,subprocess
from pathlib import Path
assert os.environ.get('ARBOR_LOCAL_REQUEST_TEST')=='1'
P=['/opt/homebrew/opt/postgresql@17/bin/psql','-w','-X','-q','-At','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','55448','-U','arbor_requests_test','-d','postgres']
def sql(q,good=True):
 r=subprocess.run(P,input=q,text=True,capture_output=True)
 if good:assert r.returncode==0,r.stderr;return r.stdout.strip()
 assert r.returncode!=0;return r.stderr
assert '/arbor-requests-pg' in sql("select current_setting('data_directory');")
owner=str(uuid.uuid4())
sql(f"insert into auth.users(id,email)values('{owner}','retention-fixture@example.test');insert into arbor_private.account_lifecycle(user_id,state)values('{owner}','active');insert into arbor_investment_requests(user_id,investment_name,provider,idempotency_key,received_at)select '{owner}','Old sample fund '||i,'Provider',gen_random_uuid(),now()-interval '91 days'from generate_series(1,251)i;insert into arbor_investment_requests(user_id,investment_name,provider,idempotency_key)values('{owner}','Recent sample fund','Provider',gen_random_uuid());")
proposal=Path('docs/investment-request-retention-operator-proposal.sql').read_text()
assert 'request_retention_policy_not_approved' in sql(proposal,False)
enabled=proposal.replace("-- SET LOCAL arbor.request_retention_policy_reviewed='90-days';","SET LOCAL arbor.request_retention_policy_reviewed='90-days';")
result=sql(enabled);assert result.split('|')[0]=='250',result
assert sql(f"select count(*)from arbor_investment_requests where user_id='{owner}';")=='252'
# A non-active account is excluded; its data belongs to reviewed erasure/hold handling.
sql(f"update arbor_private.account_lifecycle set state='deactivated',deactivated_at=now()where user_id='{owner}';")
assert sql(enabled).split('|')[0]=='0'
print('{"proposedPolicyOnly":true,"explicitPolicyApprovalRequired":true,"batchLimit250":true,"oldVersusRecent":true,"inactiveExcluded":true,"rollbackPreservesRows":true,"hostedWrites":0,"cronAdded":false,"policyAccepted":false}')
