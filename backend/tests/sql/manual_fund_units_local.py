"""Synthetic canonical correction qualification; fixed loopback, rolled back."""
import os,subprocess
from uuid import uuid4
assert os.environ.get('ARBOR_LOCAL_MANUAL_UNITS_TEST')=='1'
args=['psql','-w','-X','-q','-At','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','55433','-U','arbor_export_test','-d','arbor_usd_standalone']
def run(sql):
 r=subprocess.run(args+['-c',sql],capture_output=True,text=True,timeout=15)
 if r.returncode:
  print(r.stderr.splitlines()[0] if r.stderr else 'Local SQL error')
  raise RuntimeError('Local correction qualification failed; fixture transaction rolled back.')
 return r.stdout.strip()
assert run("select current_setting('data_directory')") in ('/tmp/arbor-export-pg','/private/tmp/arbor-export-pg')
a,b,h,k=[str(uuid4()) for _ in range(4)]
sql=f"""begin;
set statement_timeout='8s';set lock_timeout='2s';
insert into public.arbor_portfolio_products(product_id,provider,price_key) values('gcash_global_equity','gcash','gcash_global_equity') on conflict do nothing;
insert into auth.users(id,email) values('{a}','units-a@example.test'),('{b}','units-b@example.test');
insert into public.arbor_portfolio_holdings(id,user_id,product_id,provider,units,cost_basis_php,opening_units,opening_cost_php,manual_value_php,updated_at)
values('{h}','{a}','gcash_global_equity','gcash',null,500,0,500,1000,now()-interval '1 day'),('{k}','{b}','gcash_global_equity','gcash',5,500,5,500,null,now()-interval '1 day');
select set_config('request.jwt.claims','{{"sub":"{a}","role":"authenticated"}}',true);
select set_config('request.jwt.claim.sub','{a}',true);
set local role authenticated;
do $$ declare original timestamptz; n integer; begin
 select updated_at into original from public.arbor_portfolio_holdings where id='{h}';
 perform public.arbor_correct_opening_position('{h}',original,10,500);
 if not exists(select 1 from public.arbor_portfolio_holdings where id='{h}' and units=10 and cost_basis_php=500 and opening_cost_php=500 and manual_value_php=1000) then raise exception 'cost_or_units_changed';end if;
 select count(*) into n from public.arbor_investment_entries where holding_id='{h}';if n<>0 then raise exception 'invented_contribution';end if;
 -- Same-transaction retry is permitted because now() is transaction-stable; it must not add units or cost.
 perform public.arbor_correct_opening_position('{h}',original,10,500);
 if not exists(select 1 from public.arbor_portfolio_holdings where id='{h}' and units=10 and cost_basis_php=500) then raise exception 'retry_changed_position';end if;
 begin perform public.arbor_correct_opening_position('{h}',original-interval '1 second',10,500);raise exception 'stale_accepted';exception when others then if sqlerrm not like '%stale_entry_revision%' then raise;end if;end;
 begin perform public.arbor_correct_opening_position('{k}',original,10,500);raise exception 'cross_owner_accepted';exception when others then if sqlerrm not like '%holding_not_found%' then raise;end if;end;
 end $$;
reset role;
do $$begin if not exists(select 1 from public.arbor_portfolio_holdings where id='{k}' and units=5 and cost_basis_php=500) then raise exception 'other_owner_changed';end if;end $$;
rollback;
select 'PASS: canonical correction cost/contribution/owner/retry invariants; all fixtures rolled back';"""
print(run(sql).splitlines()[-1])
