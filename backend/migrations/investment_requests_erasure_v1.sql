-- LOCAL REVIEW EXTENSION ONLY. No hosted execution is authorized here.
-- Include request rows in existing reviewed inventory/deletion, preserving admission.
begin;
do $patch$ declare fn regprocedure; d text; begin
 foreach fn in array array['arbor_private.erasure_inventory(uuid)'::regprocedure,'arbor_private.erasure_data(uuid)'::regprocedure] loop
  d:=pg_get_functiondef(fn);
  if d not like '%FOREACH t IN ARRAY ARRAY[%'
     or d not like '%arbor_investment_entries%'
     or d like '%arbor_investment_requests%'
  then raise exception 'request_erasure_body_incompatible'; end if;
  d:=replace(d,'FOREACH t IN ARRAY ARRAY[','FOREACH t IN ARRAY ARRAY[''arbor_investment_requests'',');
  execute d;
 end loop;
end $patch$;
commit;
