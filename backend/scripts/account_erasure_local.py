"""Local-only operator rehearsal. Never connects to hosted Supabase/providers.

Run from backend with ARBOR_LOCAL_ERASURE_TEST=1 and PYTHONPATH=.
No secrets or arbitrary connection configuration are accepted.
"""
import argparse
import json
import os
import subprocess
from uuid import UUID

ARGS=['psql','-w','-X','-q','-At','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','55433','-U','arbor_export_test','-d','arbor_lifecycle_qualification']
def query(sql):
    result=subprocess.run(ARGS+['-c',"set statement_timeout='8s';set lock_timeout='2s';"+sql],capture_output=True,text=True,timeout=12)
    if result.returncode:raise RuntimeError('Local operation failed; review its state before retrying.')
    return result.stdout.strip()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=['inventory','queue','review','begin','data','auth-confirm','complete','retention'])
    parser.add_argument('--owner',type=UUID)
    parser.add_argument('--operation',type=UUID)
    parser.add_argument('--request',type=UUID)
    parser.add_argument('--version',type=int)
    parser.add_argument('--identity-verified',action='store_true')
    parser.add_argument('--confirm-operation',type=UUID)
    parser.add_argument('--provider-status',choices=['pending_copies','confirmed'])
    parser.add_argument('--confirm-retention',action='store_true')
    args=parser.parse_args()
    if os.environ.get('ARBOR_LOCAL_ERASURE_TEST')!='1':parser.error('Synthetic local qualification flag required.')
    if query("select current_setting('data_directory')") not in ('/tmp/arbor-export-pg','/private/tmp/arbor-export-pg'):parser.error('Unexpected database; stop.')
    if args.action=='queue':
        print(query("select coalesce(jsonb_agg(jsonb_build_object('request_id',request_id,'requested_at',requested_at)),'[]') from (select request_id,requested_at from arbor_private.account_deletion_requests where status='pending' order by requested_at limit 100) q"));return
    if args.action=='inventory':
        if not args.owner:parser.error('--owner required')
        print(query(f"select arbor_private.erasure_inventory('{args.owner}')"));return
    if args.action=='retention':
        if not args.confirm_retention:parser.error('--confirm-retention required for synthetic removal')
        print(query('select arbor_private.erasure_retention(100)'));return
    if not args.operation or args.confirm_operation!=args.operation:parser.error('Matching --operation and --confirm-operation required.')
    if args.action=='review':
        if not args.owner or not args.request or args.version is None or not args.identity_verified:parser.error('Owner/request/version and verified identity required.')
        print(query(f"select arbor_private.erasure_review('{args.owner}','{args.request}',{args.version},'{args.operation}',true)"));return
    if args.action=='complete':
        if not args.provider_status:parser.error('Explicit provider assessment required')
        sql=f"select arbor_private.erasure_finish('{args.operation}','{args.provider_status}')"
    else:
        name={'begin':'erasure_begin','data':'erasure_data','auth-confirm':'erasure_auth_confirm'}[args.action]
        sql=f"set statement_timeout='8s';select arbor_private.{name}('{args.operation}')"
    print(query(sql))

if __name__=='__main__':
    try:main()
    except (RuntimeError,subprocess.TimeoutExpired):
        raise SystemExit('Local phase not confirmed. Check the durable state; do not assume success or retry blindly.')
