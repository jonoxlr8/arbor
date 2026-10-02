"""Opt-in Auth v2.197.0 metadata-copy simulation; local disposable DB only."""
import json,os,subprocess,uuid
assert os.environ.get('ARBOR_LOCAL_TERMS_SCRUB_TEST')=='1'
DB='arbor_terms_qualification_v6'
P=['/opt/homebrew/opt/postgresql@17/bin/psql','-w','-X','-q','-At','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','55433','-U','arbor_export_test','-d',DB]
checks=0
def sql(q,ok=True):
 global checks
 r=subprocess.run(P+['-c',q],capture_output=True,text=True,timeout=20)
 assert (r.returncode==0)==ok, 'Local SQL check failed (details withheld)'
 checks+=1;return r.stdout.strip() if ok else r.stderr
assert sql('select current_database()')==DB
assert sql("select current_setting('data_directory')") in ('/tmp/arbor-export-pg','/private/tmp/arbor-export-pg')
u,i,other=[str(uuid.uuid4()) for _ in range(3)]
email='scrub-'+u+'@example.test'
d=json.loads(sql('select public.arbor_terms_current_v1()'))
assert d['enforcement_enabled'] is True
intent=json.loads(sql("select public.arbor_terms_signup_intent_v1('"+email+"','"+d['version']+"','"+d['digest']+"',true)"))['intent_token']
meta={'arbor_terms_intent':intent,'preferred_name':'Synthetic','nested':{'keep':True},'email_verified':False,'numeric':0}
encoded=json.dumps(meta).replace("'","''")
# Actual Auth admin-like role inserts user; AFTER INSERT consumes receipt/nonce.
sql(f"begin;set local role supabase_auth_admin;insert into auth.users(id,email,raw_user_meta_data) values('{u}','{email}','{encoded}');commit")
assert sql(f"select not(raw_user_meta_data ? 'arbor_terms_intent') from auth.users where id='{u}'")=='t'
receipt=sql(f"select to_jsonb(a)::text from arbor_private.terms_acceptances a where user_id='{u}'")
assert json.loads(receipt)['source']=='signup'
# Model signup.go copying original params.Data to identity, then user.go
# copying that identity metadata back to user. No hosted Auth calls.
sql(f"begin;set local role supabase_auth_admin;insert into auth.identities(id,user_id,identity_data) values('{i}','{u}','{encoded}');update auth.users set raw_user_meta_data=(select identity_data from auth.identities where id='{i}') where id='{u}';commit")
expected={k:v for k,v in meta.items() if k!='arbor_terms_intent'}
assert json.loads(sql(f"select identity_data from auth.identities where id='{i}'"))==expected
assert json.loads(sql(f"select raw_user_meta_data from auth.users where id='{u}'"))==expected
assert sql(f"select to_jsonb(a)::text from arbor_private.terms_acceptances a where user_id='{u}'")==receipt
# Even a later raw original-metadata rewrite cannot restore the capability.
sql(f"begin;set local role supabase_auth_admin;update auth.identities set identity_data='{encoded}' where id='{i}';update auth.users set raw_user_meta_data='{encoded}' where id='{u}';commit")
assert json.loads(sql(f"select identity_data from auth.identities where id='{i}'"))==expected
assert json.loads(sql(f"select raw_user_meta_data from auth.users where id='{u}'"))==expected
assert sql(f"select to_jsonb(a)::text from arbor_private.terms_acceptances a where user_id='{u}'")==receipt
# Consumption rejects reuse independently of where metadata happens to reside.
event=json.dumps({'user':{'email':email,'user_metadata':meta}}).replace("'","''")
assert 'error' in json.loads(sql(f"select public.arbor_terms_before_user_created_v1('{event}')"))
assert sql(f"select count(*) from arbor_private.terms_signup_intents where token_hash=encode(sha256(convert_to('{intent}','UTF8')),'hex')")=='0'
assert 'terms_signup_intent_invalid' in sql(f"insert into auth.users(id,email,raw_user_meta_data) values('{other}','{email}','{encoded}')",False)
# Other metadata and NULL remain intact; no fabricated empty metadata.
sql(f"update auth.users set raw_user_meta_data=null where id='{u}';update auth.identities set identity_data=null where id='{i}'")
assert sql(f"select raw_user_meta_data is null from auth.users where id='{u}'")=='t'
assert sql(f"select identity_data is null from auth.identities where id='{i}'")=='t'
assert sql(f"select to_jsonb(a)::text from arbor_private.terms_acceptances a where user_id='{u}'")==receipt
for role in ('anon','authenticated','service_role','supabase_auth_admin'):
 assert sql(f"select has_function_privilege('{role}','arbor_private.terms_scrub_intent_metadata()','EXECUTE')")=='f'
assert sql("select prosecdef and 'search_path=\"\"'=any(proconfig) from pg_proc where oid='arbor_private.terms_scrub_intent_metadata()'::regprocedure")=='t'
assert sql(f"select count(*) from arbor_private.terms_acceptances where user_id='{u}'")=='1'
# Existing users without matching signup evidence retain the reserved key.
legacy,legacy_identity=[str(uuid.uuid4()) for _ in range(2)]
sql("update arbor_private.terms_control set enforcement_enabled=false")
sql(f"insert into auth.users(id,email,raw_user_meta_data) values('{legacy}','legacy-{legacy}@example.test','{{}}')")
sql("update arbor_private.terms_control set enforcement_enabled=true")
legacy_meta=json.dumps({'arbor_terms_intent':'unrelated_legacy_field','keep':'unchanged'})
sql(f"insert into auth.identities(id,user_id,identity_data) values('{legacy_identity}','{legacy}','{legacy_meta}');update auth.users set raw_user_meta_data='{legacy_meta}' where id='{legacy}'")
assert json.loads(sql(f"select raw_user_meta_data from auth.users where id='{legacy}'"))==json.loads(legacy_meta)
assert json.loads(sql(f"select identity_data from auth.identities where id='{legacy_identity}'"))==json.loads(legacy_meta)
# An account acceptance is not signup evidence and cannot authorize scrubbing.
sql(f"insert into arbor_private.terms_acceptances(user_id,version,content_digest,source) values('{legacy}','{d['version']}','{d['digest']}','account')")
sql(f"update auth.identities set identity_data='{legacy_meta}' where id='{legacy_identity}';update auth.users set raw_user_meta_data='{legacy_meta}' where id='{legacy}'")
assert json.loads(sql(f"select raw_user_meta_data from auth.users where id='{legacy}'"))==json.loads(legacy_meta)
assert json.loads(sql(f"select identity_data from auth.identities where id='{legacy_identity}'"))==json.loads(legacy_meta)
# Non-object legacy JSON is not interpreted as a reserved object field.
for value in ('["arbor_terms_intent","keep"]','42','"unchanged"'):
 sql(f"update auth.users set raw_user_meta_data='{value}' where id='{u}'")
 assert json.loads(sql(f"select raw_user_meta_data from auth.users where id='{u}'"))==json.loads(value)
# Contrived malformed signup evidence must not authorize any metadata removal.
bad,bad_identity=[str(uuid.uuid4()) for _ in range(2)]
sql("update arbor_private.terms_control set enforcement_enabled=false")
sql(f"insert into auth.users(id,email,raw_user_meta_data) values('{bad}','bad-{bad}@example.test','{{}}')")
sql("update arbor_private.terms_control set enforcement_enabled=true")
assert 'foreign key' in sql(f"insert into arbor_private.terms_acceptances(user_id,version,content_digest,source) values('{bad}','{d['version']}','{'0'*64}','signup')",False)
sql(f"insert into auth.identities(id,user_id,identity_data) values('{bad_identity}','{bad}','{legacy_meta}');update auth.users set raw_user_meta_data='{legacy_meta}' where id='{bad}'")
assert json.loads(sql(f"select raw_user_meta_data from auth.users where id='{bad}'"))==json.loads(legacy_meta)
assert json.loads(sql(f"select identity_data from auth.identities where id='{bad_identity}'"))==json.loads(legacy_meta)
assert sql("select s.proowner=r.proowner from pg_proc s join pg_proc r on r.oid='arbor_private.terms_signup_record()'::regprocedure where s.oid='arbor_private.terms_scrub_intent_metadata()'::regprocedure")=='t'
assert sql("select has_table_privilege('authenticated','arbor_private.terms_acceptances','SELECT')")=='f'
# The identity's own user_id controls evidence, not metadata copied from A.
cross=str(uuid.uuid4())
sql(f"insert into auth.identities(id,user_id,identity_data) values('{cross}','{legacy}','{encoded}')")
assert json.loads(sql(f"select identity_data from auth.identities where id='{cross}'"))==meta
print(json.dumps({'checks':checks,'auth_v2197_copy_sequence':True,'identity_insert_update_scrub':True,'user_update_scrub':True,'other_metadata_preserved':True,'null_preserved':True,'receipt_unchanged':True,'consumed_nonce_replay_denied':True,'no_function_privilege_expansion':True,'restricted_definer_empty_search_path':True,'hosted_requests':0}))
