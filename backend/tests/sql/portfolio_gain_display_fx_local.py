"""Fixed disposable loopback PostgreSQL; all migration/fixtures roll back."""
import os
from pathlib import Path
import subprocess
assert os.environ.get("ARBOR_LOCAL_FX_TEST") == "1"
args = ["psql", "-w", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", "55433", "-U", "arbor_export_test", "-d", "arbor_lifecycle_qualification"]
def sql(query):
    r = subprocess.run(args + ["-c", query], capture_output=True, text=True, timeout=30)
    assert r.returncode == 0, r.stderr
    return r.stdout.strip()
assert sql("select current_setting('data_directory')") in ("/tmp/arbor-export-pg", "/private/tmp/arbor-export-pg")
migration = Path("migrations/portfolio_gain_display_fx_v1.sql").read_text().replace("BEGIN;", "", 1)
migration = migration.rsplit("COMMIT;", 1)[0]
fixture = """
CREATE TEMP TABLE fx_expected(acl aclitem[],definition text,before_points jsonb,before_snapshot jsonb);
INSERT INTO fx_expected(acl,definition) SELECT proacl,pg_get_functiondef(oid) FROM pg_proc WHERE oid='public.arbor_reconstructed_portfolio_history(integer,integer)'::regprocedure;
INSERT INTO auth.users(id,email) VALUES('11111111-1111-4111-8111-111111111111','fx-local@example.test'),('22222222-2222-4222-8222-222222222222','other-fx-local@example.test');
INSERT INTO auth.sessions(id,user_id,created_at) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',clock_timestamp());
INSERT INTO public.arbor_portfolio_snapshots(user_id,day,value_php,recorded_cost_php,cost_context_captured,usd_php_rate_at_capture,captured_at)
VALUES('11111111-1111-4111-8111-111111111111',current_date,5000,4000,true,50,clock_timestamp()),('11111111-1111-4111-8111-111111111111',current_date-1,4000,4000,true,null,(current_date-1)::timestamptz+interval '12 hours'),('22222222-2222-4222-8222-222222222222',current_date,999,999,true,99,clock_timestamp());
SELECT set_config('request.jwt.claims',jsonb_build_object('sub','11111111-1111-4111-8111-111111111111','session_id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','role','authenticated','aud','authenticated','iat',floor(extract(epoch from clock_timestamp())),'exp',floor(extract(epoch from clock_timestamp()))+3600)::text,true);
UPDATE fx_expected SET before_points=(SELECT jsonb_agg(p ORDER BY p->>'day') FROM public.arbor_reconstructed_portfolio_history(0,1000) p),before_snapshot=(SELECT jsonb_agg(to_jsonb(s) ORDER BY day) FROM public.arbor_portfolio_snapshots s WHERE user_id='11111111-1111-4111-8111-111111111111');
"""
checks = """
DO $$ DECLARE result jsonb; original jsonb; BEGIN
 SELECT jsonb_agg(p-'display_fx' ORDER BY p->>'day') INTO result FROM public.arbor_reconstructed_portfolio_history(0,1000) p;
 SELECT before_points INTO original FROM fx_expected;
 IF result IS DISTINCT FROM original THEN RAISE EXCEPTION 'financial_output_changed'; END IF;
 SELECT p INTO result FROM public.arbor_reconstructed_portfolio_history(0,1000) p WHERE p->>'day'=current_date::text;
 IF result->'display_fx'->>'rate'<>'50' OR result->'display_fx'->>'source'<>'captured_snapshot' OR result->'display_fx'->'as_of'<>'null'::jsonb OR result->>'recorded_gain_php'<>'1000.00' THEN RAISE EXCEPTION 'observed_fx_metadata_invalid'; END IF;
 IF EXISTS(SELECT 1 FROM public.arbor_reconstructed_portfolio_history(0,1000) p WHERE p->>'day'=(current_date-1)::text AND p->'display_fx'<>'null'::jsonb) THEN RAISE EXCEPTION 'missing_fx_invented'; END IF;
 IF (SELECT jsonb_agg(to_jsonb(s) ORDER BY day) FROM public.arbor_portfolio_snapshots s WHERE user_id='11111111-1111-4111-8111-111111111111') IS DISTINCT FROM (SELECT before_snapshot FROM fx_expected) THEN RAISE EXCEPTION 'snapshot_mutated'; END IF;
 IF (SELECT proacl FROM pg_proc WHERE oid='public.arbor_reconstructed_portfolio_history(integer,integer)'::regprocedure) IS DISTINCT FROM (SELECT acl FROM fx_expected) THEN RAISE EXCEPTION 'acl_changed'; END IF;
END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.arbor_reconstructed_portfolio_history(0,1000) p WHERE p->>'value_php'='999') THEN RAISE EXCEPTION 'cross_owner_leak'; END IF; END $$;
RESET ROLE;
SELECT 'PASS: observed metadata/missing FX/financial equality/snapshot immutability/ACL/owner isolation; rolled back';
"""
output = sql("BEGIN;SET LOCAL statement_timeout='8s';" + fixture + migration + checks + "ROLLBACK;")
print(output.splitlines()[-1])
