# Supabase schema — version control

## Why this folder exists

Creora's entire security model — Row Level Security plus eight `SECURITY DEFINER`
RPC functions (`get_page`, `list_pages`, `save_page`, `create_page`,
`list_database_rows`, `add_database_row`, `update_database_row`,
`delete_database_row`) — lived **only inside the Supabase dashboard**.

Nothing in this repository described it. Deleting or losing that Supabase
project would have made the product unrecoverable, and there is no backup on
the free tier. This folder closes that gap.

## The workflow, once (recommended)

Supabase's CLI supports declarative schemas: `.sql` files in `supabase/schemas/`
are the source of truth, and the CLI generates versioned migrations by diffing
them.

```bash
npm i -g supabase
supabase login
supabase link                              # select the Creora project
supabase db dump > supabase/schemas/prod.sql
git add supabase/schemas && git commit -m "Capture production schema"
```

From then on:

```bash
# edit supabase/schemas/*.sql, then:
supabase db diff -f describe_your_change   # writes supabase/migrations/<ts>_describe_your_change.sql
supabase db push                           # applies it to the linked project
```

**The one rule:** once you are on this workflow, edit the files in
`supabase/schemas/`, never the dashboard SQL Editor. `db diff` compares schema
files against migrations — it does not read the live database, so any change
made directly in the dashboard is invisible to it and will be silently reverted
by the next push.

This also retires the note in `PROJECT_STATE.md` about having no local
credentials and needing to run DDL by hand in the dashboard. `supabase link`
is what was missing.

## The fallback, if the CLI is a hassle right now

Run `dump_schema.sql` in the dashboard SQL Editor and save the single text cell
it returns to `supabase/schemas/prod.sql`. It produces the same replayable SQL —
tables, constraints, indexes, RLS, policies, functions and grants — verified by
restoring it into an empty Postgres 16 database with zero errors.

It is a stopgap. It has to be re-run by hand every time the schema changes,
which is exactly the failure mode that lost the schema in the first place.

## After any DDL change

PostgREST caches the schema. Run this or new functions return 404:

```sql
NOTIFY pgrst, 'reload schema';
```
