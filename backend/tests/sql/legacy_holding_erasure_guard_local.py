"""Opt-in disposable PostgreSQL regression checks. No hosted credentials."""
import json,os,subprocess,time,uuid
assert os.environ.get('ARBOR_LOCAL_LEGACY_GUARD_TEST')=='1'
P=['/opt/homebrew/opt/postgresql@17/bin/psql','-w','-X','-q','-At','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','55433','-U','arbor_export_test','-d','arbor_tracker_qualification']
checks=0
def sql(q,ok=True):
 global checks
 r=subprocess.run(P+['-c',q],capture_output=True,text=True,timeout=20);assert (r.returncode==0)==ok,r.stderr;checks+=1;return r.stdout.strip() if ok else r.stderr
assert sql('select current_database()')=='arbor_tracker_qualification'
assert sql("select current_setting('data_directory')") in ('/tmp/arbor-export-pg','/private/tmp/arbor-export-pg')
u,v,h,other,op,req=[str(uuid.uuid4()) for _ in range(6)]
sql(f"insert into auth.users(id) values('{u}'),('{v}');insert into auth.sessions(id,user_id,created_at) values('{u}','{u}',clock_timestamp()),('{v}','{v}',clock_timestamp());insert into public.arbor_portfolio_holdings(id,user_id,product_id,provider,units,cost_basis_php,opening_units,opening_cost_php) values('{h}','{u}','gotrade_vt','gotrade',1,5000,1,5000),('{other}','{v}','gotrade_vt','gotrade',2,10000,2,10000)")
def owner(w,q,ok=True):
 claims=json.dumps({'sub':w,'session_id':w,'role':'authenticated','aud':'authenticated','iat':int(time.time()),'exp':int(time.time())+3600})
 return sql(f"begin;set local request.jwt.claims='{claims}';set local request.jwt.claim.sub='{w}';set local role authenticated;{q};commit",ok)
assert owner(u,"insert into public.arbor_portfolio_holdings(product_id,provider,units,cost_basis_php) values('gotrade_bnd','gotrade',1,5000) returning opening_units")=='1'
owner(u,f"update public.arbor_portfolio_holdings set units=3 where id='{h}'")
assert sql(f"select opening_units from public.arbor_portfolio_holdings where id='{h}'")=='3'
owner(u,f"delete from public.arbor_portfolio_holdings where id='{other}'")
assert sql(f"select units from public.arbor_portfolio_holdings where id='{other}'")=='2'
sql(f"insert into public.arbor_portfolio_snapshots(user_id,day,value_php,captured_at) values('{u}','2026-09-20',5000,clock_timestamp())")
owner(u,f"delete from public.arbor_portfolio_holdings where id='{h}'")
assert owner(u,"select superseded from public.arbor_portfolio_observed_history_status where day='2026-09-20'")=='t'
assert sql(f"select count(*) from public.arbor_portfolio_holdings where id='{h}'")=='0'
for role in ('anon','authenticated','service_role'):
 assert sql(f"select has_function_privilege('{role}','arbor_private.erasure_context(uuid)','EXECUTE')")=='f'
assert sql("select not prosecdef and 'search_path=\"\"'=any(proconfig) from pg_proc where oid='public.arbor_guard_legacy_holding_write()'::regprocedure")=='t'
entry=json.loads(owner(v,f"select public.arbor_record_investment('gotrade_bnd','gotrade','2026-09-20',1,5000,'{uuid.uuid4()}')"))
assert 'ledger_managed_holding' in owner(v,f"delete from public.arbor_portfolio_holdings where id='{entry['holding_id']}'",False)
owner(v,f"select public.arbor_revise_investment('{entry['entry_id']}',1,'2026-09-21',2,6000,false)")
owner(v,f"select public.arbor_revise_investment('{entry['entry_id']}',2,null,null,null,true)")
sql(f"insert into arbor_private.account_lifecycle(user_id,state,version) values('{u}','deletion_pending',1);insert into arbor_private.account_deletion_requests(user_id,request_id,status,requested_at) values('{u}','{req}','pending',clock_timestamp());select arbor_private.erasure_review('{u}','{req}',1,'{op}',true);select arbor_private.erasure_begin('{op}')")
assert 'account_restricted' in owner(u,"insert into public.arbor_portfolio_holdings(product_id,provider,units,cost_basis_php) values('gotrade_vt','gotrade',1,5000)",False)
owner(u,"update public.arbor_portfolio_holdings set units=99")
owner(u,"delete from public.arbor_portfolio_holdings")
assert sql(f"select units from public.arbor_portfolio_holdings where user_id='{u}'")=='1'
assert 'account_restricted' in sql(f"update public.arbor_portfolio_holdings set units=99 where user_id='{u}'",False)
assert json.loads(sql(f"select arbor_private.erasure_data('{op}')"))['state']=='data_erased'
assert sql(f"select count(*) from public.arbor_portfolio_holdings where user_id='{u}'")=='0'
assert sql(f"select units from public.arbor_portfolio_holdings where id='{other}'")=='2'
print(json.dumps({'checks':checks,'active_legacy_crud':True,'cross_owner_isolation':True,'history_invalidation':True,'ledger_guard':True,'dated_correction_void':True,'erasing_blocked':True,'maintenance_erasure_preserved':True,'private_acl_unchanged':True,'guard_invoker_empty_search_path':True,'hosted_requests':0}))
