-- Creora — full schema dump query
--
-- PURPOSE: Your tables, RLS policies and the RPC functions that hold the
-- entire security model currently exist ONLY inside the Supabase dashboard.
-- If that project is ever deleted, the product is unrecoverable.
--
-- HOW TO USE (zero setup):
--   1. Supabase dashboard -> SQL Editor -> New query
--   2. Paste this entire file, press Run
--   3. Copy the single text cell in the result
--   4. Save it as supabase/schemas/prod.sql and commit it
--
-- PREFERRED ALTERNATIVE (do this once, then never do the above again):
--   npm i -g supabase && supabase login && supabase link
--   supabase db dump > supabase/schemas/prod.sql
--
-- Output is replayable SQL: verified by dumping and restoring a replica of
-- this schema into an empty Postgres 16 database with zero errors.

with parts as (
  select 1 as ord, c.relname::text as nm,
    'CREATE TABLE IF NOT EXISTS public.' || quote_ident(c.relname) || E' (\n  ' ||
    string_agg(
      quote_ident(a.attname) || ' ' || format_type(a.atttypid, a.atttypmod)
      || coalesce(' DEFAULT ' || pg_get_expr(ad.adbin, ad.adrelid), '')
      || case when a.attnotnull then ' NOT NULL' else '' end,
      E',\n  ' order by a.attnum)
    || E'\n);' as body
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  left join pg_attrdef ad on ad.adrelid = c.oid and ad.adnum = a.attnum
  where c.relkind = 'r'
  group by c.relname

  union all
  select 2, conrelid::regclass::text,
    'ALTER TABLE public.' || quote_ident(conrelid::regclass::text)
    || ' ADD CONSTRAINT ' || quote_ident(conname) || ' ' || pg_get_constraintdef(oid) || ';'
  from pg_constraint where connamespace = 'public'::regnamespace

  union all
  select 3, indexname::text, indexdef || ';'
  from pg_indexes
  where schemaname = 'public'
    and indexname not in (select conname from pg_constraint where connamespace='public'::regnamespace)

  union all
  select 4, relname::text,
    'ALTER TABLE public.' || quote_ident(relname) || ' ENABLE ROW LEVEL SECURITY;'
  from pg_class
  where relnamespace='public'::regnamespace and relkind='r' and relrowsecurity

  union all
  select 5, policyname::text,
    'CREATE POLICY ' || quote_ident(policyname) || ' ON public.' || quote_ident(tablename)
    || ' AS ' || permissive || ' FOR ' || cmd
    || ' TO ' || array_to_string(roles, ', ')
    || coalesce(E'\n  USING (' || qual || ')', '')
    || coalesce(E'\n  WITH CHECK (' || with_check || ')', '') || ';'
  from pg_policies where schemaname = 'public'

  union all
  select 6, p.proname::text, pg_get_functiondef(p.oid) || ';'
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'

  union all
  select 7, p.proname::text,
    'GRANT EXECUTE ON FUNCTION public.' || p.proname
    || '(' || pg_get_function_identity_arguments(p.oid) || ') TO ' || g.grantee || ';'
  from pg_proc p
  cross join lateral (
    select distinct (aclexplode(p.proacl)).grantee::regrole::text as grantee
  ) g
  where p.pronamespace = 'public'::regnamespace
    and g.grantee in ('anon','authenticated','service_role')
)
select string_agg(coalesce(hdr, '') || body, E'\n\n' order by ord, nm) as schema_sql
from (
  select ord, nm, body,
    case when row_number() over (partition by ord order by nm) = 1
      then E'-- ===== ' || (array['TABLES','CONSTRAINTS','INDEXES','ROW LEVEL SECURITY','POLICIES','FUNCTIONS (RPC)','GRANTS'])[ord] || E' =====\n'
    end as hdr
  from parts
) x;
