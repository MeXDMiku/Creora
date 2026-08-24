-- ---------------------------------------------------------------------------
-- CREORA -- every migration, in order, in one paste.
--
-- GENERATED FILE. Do not edit it: edit the migration it came from and run
--   node --experimental-strip-types --import ./scripts/register.mjs scripts/bundle-migrations.ts
-- A check compares this against supabase/migrations/ and fails if they differ.
--
-- SAFE TO RUN WHOLE, EVERY TIME. Every migration here is idempotent -- create
-- or replace, drop if exists, create index if not exists -- and each carries
-- its own transaction. The ones already applied to your database are no-ops.
--
-- Supabase -> SQL Editor -> New query -> paste all of this -> Run.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 0001_identity_and_ownership.sql
-- ===========================================================================

-- Creora — Step 3: identity and ownership
--
-- BEFORE THIS MIGRATION
-- RLS was enabled on both tables with no policies, which correctly blocked all
-- direct table access. But all eight RPCs are SECURITY DEFINER (they bypass RLS
-- by design) and every one was granted to `anon` with no caller check. The anon
-- key ships in the browser bundle, so anyone could list every page, read any
-- page, and overwrite any page. Demonstrated against a replica: save_page
-- replaced a page the caller did not own.
--
-- AFTER THIS MIGRATION
-- Every page has an owner. A page is private until explicitly published.
--   read a page      owner, or the page is published
--   list pages       owner only
--   create / save    owner only, and only when signed in
--   publish          owner only
--   read rows        owner, or the page is published
--   add a row        owner, or the page is published   (visitors may submit)
--   update / delete  owner only                        (visitors may not)
--
-- PREREQUISITE: enable anonymous sign-ins
--   Dashboard -> Authentication -> Sign In / Providers -> Anonymous sign-ins -> on
--
-- Safe to run more than once.

begin;

-- ---------------------------------------------------------------------------
-- 1. Ownership and publication columns
-- ---------------------------------------------------------------------------
alter table public.pages add column if not exists owner_id uuid;
alter table public.pages add column if not exists is_published boolean not null default false;
create index if not exists idx_pages_owner on public.pages (owner_id);

-- database_rows had no page, project or owner column: rows were scoped only by
-- database_block_id, so there was no way to authorise a read or a write.
alter table public.database_rows add column if not exists page_id uuid;
create index if not exists idx_database_rows_page on public.database_rows (page_id);

-- Backfill page_id. A page's `blocks` jsonb holds a runtimeStates object keyed
-- by block id, so the owning page is the one whose runtimeStates has that key.
update public.database_rows dr
   set page_id = p.id
  from public.pages p
 where dr.page_id is null
   and p.blocks -> 'runtimeStates' ? dr.database_block_id;

-- ---------------------------------------------------------------------------
-- 2. Helper: may the current caller edit this page?
-- ---------------------------------------------------------------------------
create or replace function public.can_edit_page(p_page_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select exists (
    select 1 from public.pages
     where id = p_page_id
       and owner_id is not null
       and owner_id = auth.uid()
  );
$function$;

create or replace function public.can_read_page(p_page_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select exists (
    select 1 from public.pages
     where id = p_page_id
       and (is_published or (owner_id is not null and owner_id = auth.uid()))
  );
$function$;

-- ---------------------------------------------------------------------------
-- 3. Page functions, now owner-aware
-- ---------------------------------------------------------------------------
create or replace function public.list_pages()
returns table(id uuid, page_name text)
language sql security definer set search_path to 'public' as $function$
  select id, coalesce(blocks->>'pageName', 'Untitled')
    from public.pages
   where owner_id is not null and owner_id = auth.uid()
   order by updated_at asc;
$function$;

create or replace function public.get_page(p_id uuid)
returns table(id uuid, blocks jsonb, workflows jsonb, updated_at timestamp with time zone)
language sql security definer set search_path to 'public' as $function$
  select id, blocks, workflows, updated_at
    from public.pages
   where id = p_id
     and (is_published or (owner_id is not null and owner_id = auth.uid()));
$function$;

create or replace function public.create_page(p_id uuid, p_blocks jsonb)
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  insert into public.pages (id, blocks, workflows, owner_id)
  values (p_id, p_blocks, '[]'::jsonb, auth.uid());
end;
$function$;

create or replace function public.save_page(p_id uuid, p_blocks jsonb, p_workflows jsonb)
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if not public.can_edit_page(p_id) then
    raise exception 'not your page' using errcode = '42501';
  end if;
  update public.pages
     set blocks = p_blocks, workflows = p_workflows, updated_at = now()
   where id = p_id;
end;
$function$;

create or replace function public.set_page_published(p_id uuid, p_published boolean)
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if not public.can_edit_page(p_id) then
    raise exception 'not your page' using errcode = '42501';
  end if;
  update public.pages set is_published = p_published where id = p_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Row functions. Visitors may submit to a published page, nothing more.
-- ---------------------------------------------------------------------------
create or replace function public.list_database_rows(p_block_id text)
returns table(id text, row_data jsonb, created_at timestamp with time zone)
language sql security definer set search_path to 'public' as $function$
  select dr.id, dr.row_data, dr.created_at
    from public.database_rows dr
   where dr.database_block_id = p_block_id
     and dr.page_id is not null
     and public.can_read_page(dr.page_id)
   order by dr.created_at asc;
$function$;

create or replace function public.add_database_row(p_id text, p_block_id text, p_row_data jsonb)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_page_id uuid;
begin
  select p.id into v_page_id
    from public.pages p
   where p.blocks -> 'runtimeStates' ? p_block_id
   limit 1;

  if v_page_id is null then
    raise exception 'unknown block' using errcode = '42501';
  end if;
  if not public.can_read_page(v_page_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  insert into public.database_rows (id, database_block_id, row_data, page_id)
  values (p_id, p_block_id, p_row_data, v_page_id);
end;
$function$;

create or replace function public.update_database_row(p_id text, p_row_data jsonb)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_page_id uuid;
begin
  select page_id into v_page_id from public.database_rows where id = p_id;
  if v_page_id is null or not public.can_edit_page(v_page_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.database_rows set row_data = p_row_data where id = p_id;
end;
$function$;

create or replace function public.delete_database_row(p_id text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_page_id uuid;
begin
  select page_id into v_page_id from public.database_rows where id = p_id;
  if v_page_id is null or not public.can_edit_page(v_page_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from public.database_rows where id = p_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. TEMPORARY: adopt pages that predate identity
--
-- The three existing pages have no owner. The app calls this once on first
-- signed-in load so they are not stranded. It only ever touches rows that
-- belong to nobody. DROP THIS FUNCTION once the pages are claimed — until it
-- is dropped, whoever calls it first inherits any unowned page.
-- ---------------------------------------------------------------------------
create or replace function public.claim_orphan_pages()
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare n integer;
begin
  if auth.uid() is null then
    return 0;
  end if;
  update public.pages set owner_id = auth.uid() where owner_id is null;
  get diagnostics n = row_count;
  update public.database_rows dr set page_id = p.id
    from public.pages p
   where dr.page_id is null
     and p.owner_id = auth.uid()
     and p.blocks -> 'runtimeStates' ? dr.database_block_id;
  return n;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Grants
-- ---------------------------------------------------------------------------
grant execute on function public.can_edit_page(uuid) to anon, authenticated, service_role;
grant execute on function public.can_read_page(uuid) to anon, authenticated, service_role;
grant execute on function public.set_page_published(uuid, boolean) to anon, authenticated, service_role;
grant execute on function public.claim_orphan_pages() to anon, authenticated, service_role;

commit;

notify pgrst, 'reload schema';


-- ===========================================================================
-- 0002_drop_claim_orphan_pages.sql
-- ===========================================================================

-- Creora — drop the temporary orphan-claiming door.
--
-- claim_orphan_pages() existed so the three pages created before ownership
-- were not stranded by the identity migration. They are all claimed now
-- (verified 11 Aug: 3 pages, 0 unowned, all owned by the email account), so
-- the function has done its job. While it exists, any caller holding the
-- public anon key inherits any page that has no owner.
drop function if exists public.claim_orphan_pages();
notify pgrst, 'reload schema';


-- ===========================================================================
-- 0003_publish_state.sql
-- ===========================================================================

-- Creora — expose publish state to the app, and close the temporary door.
--
-- set_page_published() has existed since migration 0001 and worked correctly,
-- but nothing in the interface could call it because the app had no way to
-- know whether a page was already published: get_page did not return
-- is_published. So publishing required calling an RPC by hand.
--
-- Return type changes need a drop, so get_page is dropped and recreated. The
-- new column is additive — existing callers reading .blocks are unaffected.
--
-- Safe to run more than once.

begin;

-- 1. The orphan-claiming door, in case migration 0002 was not run. All pages
--    are claimed; while this exists any caller inherits an unowned page.
drop function if exists public.claim_orphan_pages();

-- 2. get_page now reports publish state.
drop function if exists public.get_page(uuid);

create or replace function public.get_page(p_id uuid)
returns table(
  id uuid,
  blocks jsonb,
  workflows jsonb,
  updated_at timestamp with time zone,
  is_published boolean
)
language sql security definer set search_path to 'public' as $function$
  select id, blocks, workflows, updated_at, is_published
    from public.pages
   where id = p_id
     and (is_published or (owner_id is not null and owner_id = auth.uid()));
$function$;

grant execute on function public.get_page(uuid) to anon, authenticated, service_role;

commit;

notify pgrst, 'reload schema';


-- ===========================================================================
-- 0004_row_ownership.sql
-- ===========================================================================

-- Creora - rows gain an owner, and a collection can be made private.
--
-- WHAT THIS UNLOCKS
-- Until now every row in a Database belonged to the block and to nobody else.
-- That makes "my cart", "my orders", "my saved things" impossible: every
-- visitor to a published page sees every other visitor's rows, because there is
-- nothing on a row saying whose it is.
--
-- THE DECISION THIS MIGRATION MAKES
-- Privacy is enforced HERE, not in the app. A checkbox in the editor that
-- merely asks the browser to show fewer rows is not privacy -- the rows are
-- still one fetch away for anyone who looks. So a collection carries a flag in
-- the database, and list_database_rows itself refuses to hand a visitor rows
-- that are not theirs.
--
-- The page's owner still sees everything, which is what an owner needs: it is
-- their shop, and the orders in it are the point.
--
-- WHAT IT DOES NOT DO
-- A visitor here is an anonymous Supabase session, which lives in one browser.
-- Clear the site data, or open the page on a phone instead of a laptop, and it
-- is a different visitor with a different, empty cart. Real accounts for
-- visitors are the next queue item and this is deliberately not that.
--
-- Additive and safe to run more than once. Existing collections are not
-- private, so nothing that works today changes.

begin;

-- ---------------------------------------------------------------------------
-- 1. Whose row is it?
-- ---------------------------------------------------------------------------
alter table public.database_rows add column if not exists owner_id uuid;

-- The index matches the query: "this collection, this owner, oldest first".
create index if not exists idx_database_rows_block_owner
  on public.database_rows (database_block_id, owner_id, created_at);

-- Existing rows keep a null owner. They belong to nobody, they stay visible
-- exactly as they are today, and no "mine only" query will ever return them.
-- Backfilling a guess would be worse than leaving them honest.

-- ---------------------------------------------------------------------------
-- 2. Which collections are private?
--
-- Keyed by the Database block's id, because that is what a collection is today.
-- When collections gain names of their own this table is where that goes.
-- ---------------------------------------------------------------------------
create table if not exists public.collection_settings (
  block_id text primary key,
  page_id uuid not null,
  per_visitor boolean not null default false,
  updated_at timestamp with time zone not null default now()
);

alter table public.collection_settings enable row level security;
-- No policies, on purpose: every read and write goes through the functions
-- below, exactly like every other table here.

create or replace function public.is_collection_private(p_block_id text)
returns boolean
language sql stable security definer set search_path to 'public' as $function$
  select coalesce(
    (select per_visitor from public.collection_settings where block_id = p_block_id),
    false
  );
$function$;

-- Only the page's owner decides. A visitor who could call this could make a
-- shop's orders private to themselves, or public to everyone.
create or replace function public.set_collection_private(p_block_id text, p_per_visitor boolean)
returns void
language plpgsql security definer set search_path to 'public' as $function$
declare v_page_id uuid;
begin
  select p.id into v_page_id
    from public.pages p
   where p.blocks -> 'runtimeStates' ? p_block_id
   limit 1;

  if v_page_id is null then
    raise exception 'unknown block' using errcode = '42501';
  end if;
  if not public.can_edit_page(v_page_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  insert into public.collection_settings (block_id, page_id, per_visitor, updated_at)
  values (p_block_id, v_page_id, coalesce(p_per_visitor, false), now())
  on conflict (block_id) do update
    set per_visitor = excluded.per_visitor,
        page_id     = excluded.page_id,
        updated_at  = now();
end;
$function$;

create or replace function public.get_collection_private(p_block_id text)
returns boolean
language sql stable security definer set search_path to 'public' as $function$
  select public.is_collection_private(p_block_id);
$function$;

-- ---------------------------------------------------------------------------
-- 3. Every new row remembers who wrote it.
--
-- The only change from migration 0001 is the owner_id column. A caller with no
-- session at all writes a null owner, which is the same as every row written
-- before today, and such a row is invisible to any "mine" query.
-- ---------------------------------------------------------------------------
create or replace function public.add_database_row(p_id text, p_block_id text, p_row_data jsonb)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_page_id uuid;
begin
  select p.id into v_page_id
    from public.pages p
   where p.blocks -> 'runtimeStates' ? p_block_id
   limit 1;

  if v_page_id is null then
    raise exception 'unknown block' using errcode = '42501';
  end if;
  if not public.can_read_page(v_page_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  insert into public.database_rows (id, database_block_id, row_data, page_id, owner_id)
  values (p_id, p_block_id, p_row_data, v_page_id, auth.uid());
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Reading. This is where privacy is actually enforced.
--
-- Three cases, in order:
--   the collection is not private        -> everything, exactly as before
--   the caller can edit the page         -> everything; it is their shop
--   otherwise                            -> only rows this caller owns
--
-- `auth.uid() is not null` is not decoration. Without it, a caller with no
-- session would match every row whose owner_id is null -- which is every row
-- written before this migration -- and a private collection would leak its
-- entire history to anyone signed out.
-- ---------------------------------------------------------------------------
create or replace function public.list_database_rows(p_block_id text)
returns table(id text, row_data jsonb, created_at timestamp with time zone)
language sql security definer set search_path to 'public' as $function$
  select dr.id, dr.row_data, dr.created_at
    from public.database_rows dr
   where dr.database_block_id = p_block_id
     and dr.page_id is not null
     and public.can_read_page(dr.page_id)
     and (
           not public.is_collection_private(p_block_id)
           or public.can_edit_page(dr.page_id)
           or (auth.uid() is not null and dr.owner_id = auth.uid())
         )
   order by dr.created_at asc;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Changing your own row.
--
-- update_database_row and delete_database_row still require can_edit_page, so
-- they remain the owner's tools and are untouched. These two are the visitor's:
-- their own row, on a page they are allowed to read. That is what "change the
-- quantity in my basket" and "remove this from my list" need, and there was no
-- way to say it before.
-- ---------------------------------------------------------------------------
create or replace function public.update_my_database_row(p_id text, p_row_data jsonb)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_page_id uuid; v_owner uuid;
begin
  select page_id, owner_id into v_page_id, v_owner
    from public.database_rows where id = p_id;

  if v_page_id is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if auth.uid() is null or v_owner is null or v_owner <> auth.uid() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not public.can_read_page(v_page_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  update public.database_rows set row_data = p_row_data where id = p_id;
end;
$function$;

create or replace function public.delete_my_database_row(p_id text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_page_id uuid; v_owner uuid;
begin
  select page_id, owner_id into v_page_id, v_owner
    from public.database_rows where id = p_id;

  if v_page_id is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if auth.uid() is null or v_owner is null or v_owner <> auth.uid() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not public.can_read_page(v_page_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  delete from public.database_rows where id = p_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Grants. anon is included deliberately: an anonymous session IS a visitor,
--    and every function above decides for itself what that visitor may see.
-- ---------------------------------------------------------------------------
grant execute on function public.is_collection_private(text) to anon, authenticated, service_role;
grant execute on function public.get_collection_private(text) to anon, authenticated, service_role;
grant execute on function public.set_collection_private(text, boolean) to authenticated, service_role;
grant execute on function public.update_my_database_row(text, jsonb) to anon, authenticated, service_role;
grant execute on function public.delete_my_database_row(text) to anon, authenticated, service_role;

commit;

notify pgrst, 'reload schema';


-- ===========================================================================
-- 0005_delete_page.sql
-- ===========================================================================

-- Creora - a page can be deleted.
--
-- WHY THIS IS NEEDED
-- There was no way to delete a page at all. The database had create_page,
-- save_page, list_pages, get_page and set_page_published, and nothing else, so
-- a page made by accident was permanent. This project reached six pages, five
-- of them called "Untitled", none removable -- and once goToPage shipped with a
-- page picker, that picker listed five identical entries, so the missing delete
-- had started blocking a feature rather than just cluttering a toolbar.
--
-- THE DECISION THIS MIGRATION MAKES, AND WHO MADE IT
-- Deleting a page also deletes the rows collected on it. That is destructive
-- and there is no undo. It was chosen deliberately rather than assumed: the
-- alternative is rows that outlive the page they belonged to, keyed to a block
-- id on a page that no longer exists, invisible in the editor and still
-- counting against the free tier's row limit for ever.
--
-- The app asks first, says how many rows will go, and offers to save them as a
-- CSV before it happens. This function is the half that cannot ask, so it does
-- the destructive thing without hesitating -- by the time it runs, the asking
-- has already happened.
--
-- WHAT IT DELIBERATELY DOES NOT DO
-- Wires on OTHER pages that pointed at this one are left exactly as they are.
-- Rewriting somebody else's page as a side effect of deleting this one is worse
-- than leaving a broken link: it edits work nobody asked to have edited. The
-- Health panel reports them as "points at a page that is gone", so they are
-- named rather than silent, which is the honest half of this trade.
--
-- Safe to run more than once.

begin;

create or replace function public.delete_page(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  -- Ownership, the same check every other writing function uses. A page is
  -- deleted by the person who owns it and by nobody else, and this is enforced
  -- here rather than in the browser for the obvious reason.
  if not public.can_edit_page(p_id) then
    raise exception 'not your page' using errcode = '42501';
  end if;

  -- Rows first. If this errored after the page was gone, the rows would be
  -- orphaned with no page left to authorise reading or removing them -- they
  -- would be unreachable and undeletable, which is the worst of both.
  delete from public.database_rows where page_id = p_id;
  delete from public.pages where id = p_id;
end;
$function$;

grant execute on function public.delete_page(uuid) to anon, authenticated, service_role;

commit;
notify pgrst, 'reload schema';


-- ===========================================================================
-- 0006_save_without_overwriting.sql
-- ===========================================================================

-- Creora - saving cannot silently overwrite somebody else's save.
--
-- WHAT WAS WRONG
-- save_page is an unconditional UPDATE. Two tabs open on the same page, which
-- is the normal way anybody works, and the second one to autosave replaces
-- everything the first one did. No error, no warning, no copy kept: an hour of
-- work disappears and the only evidence is that the page looks older than it
-- was. Nothing in the app could even notice it had happened.
--
-- It is not a two-person problem. One builder with the page open in two tabs
-- hits it, and this project's own autosave runs 500ms after every keystroke,
-- so the losing tab overwrites the winning one as soon as it is touched.
--
-- WHAT THIS DOES
-- The caller says which version it thinks it is editing, and the update only
-- lands if that is still the version on the server. Optimistic locking, the
-- oldest trick there is, and the right one here: writes are rare, conflicts are
-- rarer, and taking a real lock would mean a tab left open all night holding
-- the page hostage.
--
-- WHY p_expected MAY BE NULL, DELIBERATELY
-- Null means "I do not know which version I have" and saves unconditionally --
-- exactly what save_page does today. A caller that cannot supply a stamp must
-- keep working: the alternative is a client that fails to save at all, and
-- LOSING a save is a worse failure than an unnoticed overwrite. The old
-- save_page is left in place untouched for the same reason.
--
-- The new updated_at comes back, so the caller can go straight on to its next
-- save without another round trip to find out where it now stands.
--
-- Safe to run more than once.

begin;

create or replace function public.save_page_if_unchanged(
  p_id uuid,
  p_blocks jsonb,
  p_workflows jsonb,
  p_expected timestamp with time zone default null
)
returns timestamp with time zone
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_now timestamp with time zone;
  v_actual timestamp with time zone;
begin
  if not public.can_edit_page(p_id) then
    raise exception 'not your page' using errcode = '42501';
  end if;

  update public.pages
     set blocks = p_blocks, workflows = p_workflows, updated_at = now()
   where id = p_id
     and (p_expected is null or updated_at = p_expected)
  returning updated_at into v_now;

  if v_now is null then
    -- Nothing updated. Two different reasons, and telling them apart matters:
    -- a page that is GONE cannot be recovered by reloading, and a page that
    -- merely moved on can.
    select updated_at into v_actual from public.pages where id = p_id;
    if v_actual is null then
      raise exception 'page no longer exists' using errcode = 'P0002';
    end if;
    -- The server's version is in the message on purpose: it is the one piece
    -- of evidence that says how far behind this tab actually is.
    raise exception 'page changed elsewhere at %', v_actual using errcode = 'P0001';
  end if;

  return v_now;
end;
$function$;

grant execute on function public.save_page_if_unchanged(uuid, jsonb, jsonb, timestamp with time zone)
  to authenticated, service_role;

commit;
notify pgrst, 'reload schema';


-- ===========================================================================
-- 0007_row_limits.sql
-- ===========================================================================

-- Creora - a published form cannot fill the database on its own.
--
-- WHAT IS UNPROTECTED TODAY
-- A published page's form inserts a row for anyone who submits it, with no
-- limit of any kind. One script pointed at a live page writes rows until the
-- Supabase project stops working -- and the bill and the outage both land on
-- the builder, who did nothing but publish a contact form. There is nothing in
-- the app or the database that would even slow it down.
--
-- WHY A TRIGGER AND NOT A CHANGE TO add_database_row
-- add_database_row has two versions in this repo's history (0001, and 0004
-- with owner_id) and only one of them may be installed. A trigger on the table
-- is independent of which, needs no ordering against those migrations, and
-- covers any future way of writing a row -- including one somebody adds later
-- without remembering this file exists.
--
-- THE TWO LIMITS, AND WHAT THEY ARE NOT
-- These are RUNAWAY PROTECTION, not a pricing tier. The free-tier row
-- allowance is a product decision and is deliberately not encoded here; these
-- numbers are set where no honest human use could reach them and a script
-- reaches them in seconds.
--
--   60 rows per page per minute  -- a person filling in a form manages one or
--                                   two a minute; sixty is a machine. Thirty
--                                   students submitting at once still get
--                                   through, which is why it is not twenty.
--   10000 rows per page total    -- see the arithmetic below
--
-- WHERE 10000 COMES FROM, since a number with no reasoning behind it gets
-- raised by whoever hits it first:
--   the free database is 500 MB (supabase.com/pricing, checked 19 Aug 2026)
--   a row with a few short answers is roughly 500 bytes; one with a long
--   message is closer to 2 KB
--   10000 x 2 KB = 20 MB, so a single abused page can take about 4% of the
--   whole allowance and no more
-- The first draft of this file said 50000, which at 2 KB is 100 MB -- a FIFTH
-- of everything, from one page, and the number was chosen before anybody had
-- looked up what the allowance actually was.
--
-- THE OWNER IS EXEMPT. A builder seeding a table, importing a spreadsheet or
-- restoring a backup is not abuse, and being throttled while doing it on your
-- own page would be indefensible.
--
-- TO CHANGE THE NUMBERS: edit the two constants below and run this file again.
-- It is safe to run more than once.

begin;

create or replace function public.enforce_row_limits()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  -- Per page, per minute. A person manages one or two; sixty is a machine.
  v_per_minute constant integer := 60;
  -- Per page, ever. Runaway protection, not a pricing tier: 10000 x 2 KB is
  -- about 4% of the free 500 MB, which bounds the damage one abused page can do.
  v_total constant integer := 10000;
  v_recent integer;
  v_count integer;
begin
  -- No page means the row is unreachable anyway; leave that to whoever wrote it.
  if new.page_id is null then
    return new;
  end if;

  -- The owner is exempt: seeding a table or importing a spreadsheet is not
  -- abuse, and throttling somebody on their own page would be indefensible.
  if public.can_edit_page(new.page_id) then
    return new;
  end if;

  select count(*) into v_recent
    from public.database_rows
   where page_id = new.page_id
     and created_at > now() - interval '1 minute';

  if v_recent >= v_per_minute then
    -- The wording matters: this reaches a visitor, who has done nothing wrong
    -- and cannot fix anything. It says to wait, not that they are blocked.
    raise exception 'too many submissions in a short time, please try again in a minute'
      using errcode = 'P0003';
  end if;

  select count(*) into v_count
    from public.database_rows
   where page_id = new.page_id;

  if v_count >= v_total then
    raise exception 'this page has reached its limit of collected rows'
      using errcode = 'P0004';
  end if;

  return new;
end;
$function$;

drop trigger if exists enforce_row_limits_trigger on public.database_rows;
create trigger enforce_row_limits_trigger
  before insert on public.database_rows
  for each row execute function public.enforce_row_limits();

-- Counting recent rows for a page runs on every visitor insert, so it gets an
-- index. Without one this protection becomes the slow thing it exists to
-- prevent, on exactly the pages that have the most rows.
create index if not exists database_rows_page_created_idx
  on public.database_rows (page_id, created_at desc);

commit;
notify pgrst, 'reload schema';


-- ===========================================================================
-- 0008_unique_columns.sql
-- ===========================================================================

-- Creora - two people cannot take the same slot.
--
-- WHAT IS UNPROTECTED TODAY
-- Nothing anywhere enforces that a value is used once. Not a column, not a
-- condition, not the database. A booking form can be filled in twice for the
-- same time, a ticket sold twice, a username claimed twice -- and the page
-- shows both as successful, because both were.
--
-- A workflow cannot answer this. It can only check the rows the visitor's
-- BROWSER happens to have loaded, which is the wrong question asked of the
-- wrong copy: two people pressing Submit in the same second both see a free
-- slot and both get it. This is the same shape as the save race that migration
-- 0006 fixed, one layer up, and it can only be answered where the write
-- happens.
--
-- WHERE THE RULE LIVES
-- On the column, in the page's own blocks JSON: a column marked `unique`. That
-- keeps the decision with the builder, in the panel where they defined the
-- column, rather than in a database somebody would have to be told about.
--
-- WHY AN ADVISORY LOCK AND NOT JUST A LOOKUP
-- "Check whether it exists, then insert" is not a guarantee. Two transactions
-- can both look, both find nothing, and both insert -- which is the exact
-- failure this exists to stop, merely made rarer and harder to reproduce. A
-- guarantee that only holds when nobody is racing is not one, and shipping it
-- as though it were would be worse than shipping nothing, because somebody
-- would rely on it.
--
-- So the check takes a transaction-scoped advisory lock keyed on the block, the
-- column and the value. Two visitors submitting the same slot at the same
-- instant queue behind one another, and the second one loses. Every write goes
-- through this trigger, so there is no path around it.
--
-- A UNIQUE INDEX WOULD BE STRONGER AND IS NOT AVAILABLE. It would have to name
-- the column, and the column is chosen per block inside a JSON document.
--
-- BLANK NEVER COLLIDES. Two rows that have not filled that field in are not
-- the same booking, and refusing the second one would make an optional field
-- impossible to leave empty twice.
--
-- Safe to run more than once.

begin;

create or replace function public.enforce_unique_columns()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_columns jsonb;
  v_column jsonb;
  v_name text;
  v_value jsonb;
  v_taken boolean;
begin
  if new.page_id is null or new.database_block_id is null then
    return new;
  end if;

  -- The column definitions live with the page that owns the block.
  select p.blocks -> 'runtimeStates' -> new.database_block_id -> 'columns'
    into v_columns
    from public.pages p
   where p.id = new.page_id;

  if v_columns is null or jsonb_typeof(v_columns) <> 'array' then
    return new;
  end if;

  for v_column in select * from jsonb_array_elements(v_columns) loop
    continue when coalesce((v_column ->> 'unique')::boolean, false) = false;

    v_name := v_column ->> 'name';
    continue when v_name is null;

    v_value := new.row_data -> v_name;
    -- Missing, null or empty text is not a claim on anything.
    continue when v_value is null
      or jsonb_typeof(v_value) = 'null'
      or (jsonb_typeof(v_value) = 'string' and length(v_value #>> '{}') = 0);

    -- Serialise everybody asking about THIS value in THIS column of THIS
    -- block. Without it two submissions in the same instant both look, both
    -- find nothing, and both write.
    perform pg_advisory_xact_lock(
      hashtext(new.database_block_id || ':' || v_name),
      hashtext(v_value #>> '{}')
    );

    select exists (
      select 1
        from public.database_rows r
       where r.database_block_id = new.database_block_id
         and r.id <> new.id
         and r.row_data -> v_name = v_value
    ) into v_taken;

    if v_taken then
      -- Names the column, because "that is already taken" without saying WHAT
      -- leaves a visitor guessing which field to change.
      raise exception 'that % is already taken', v_name using errcode = 'P0005';
    end if;
  end loop;

  return new;
end;
$function$;

drop trigger if exists enforce_unique_columns_insert on public.database_rows;
create trigger enforce_unique_columns_insert
  before insert on public.database_rows
  for each row execute function public.enforce_unique_columns();

-- Updates too: changing a row's value to one somebody else already holds is the
-- same collision arriving by a different door.
drop trigger if exists enforce_unique_columns_update on public.database_rows;
create trigger enforce_unique_columns_update
  before update of row_data on public.database_rows
  for each row execute function public.enforce_unique_columns();

-- The lookup runs on every write to a table with a unique column, so it gets an
-- index. Without one the guarantee gets slower exactly as a table fills up.
create index if not exists database_rows_block_idx
  on public.database_rows (database_block_id);

commit;
notify pgrst, 'reload schema';


-- ===========================================================================
-- 0009_row_shape.sql
-- ===========================================================================

-- Creora - a row has to look like the table it is going into.
--
-- WHAT IS UNPROTECTED TODAY
-- add_database_row takes `row_data jsonb` and inserts it. It checks WHO is
-- writing and never WHAT. Every rule in the product -- required, must be a
-- number, must be a date, must be a real email -- lives in the browser, which
-- means it is advice to whoever uses the form and nothing at all to whoever
-- calls the RPC directly. The anon key is in the published page; calling it is
-- one line of fetch.
--
-- So a stranger can put a column that does not exist into your table, a
-- paragraph into your number column, and a megabyte into a field meant for a
-- name -- and the editor will show all of it as though a person had typed it.
--
-- WHAT THIS DOES
-- Makes the server agree with the browser. The same three decisions the client
-- makes in coerceForColumn, made again where they cannot be skipped:
--
--   a key that is not a column        -> dropped
--   a value in a typed column         -> coerced, or the write is refused
--   a row bigger than the cap         -> refused
--
-- WHY COERCE RATHER THAN REFUSE
-- Refusing anything the browser would have accepted turns a working form into
-- a broken one, and the browser sends "5" for a number column in some paths and
-- 5 in others. Coercing the way the client already coerces means the two cannot
-- disagree about a value -- which is the same drift problem this codebase has
-- had nine times between its two renderers, here across a network instead of
-- between two files.
--
-- WHY A KEY THAT IS NOT A COLUMN IS DROPPED, NOT REFUSED
-- A builder who renames a column while somebody has the form open would
-- otherwise have that person's submission rejected outright. Dropping keeps
-- the answer they could still use and loses only the part that has nowhere to
-- go. It also means junk cannot accumulate.
--
-- WHERE 16 KB COMES FROM
-- The free database is 500 MB (supabase.com/pricing, checked 19 Aug 2026) and
-- migration 0007 caps a page at 10000 rows. 10000 x 16 KB is 160 MB, so one
-- maximally abused page can take about a third and no more. 16 KB is roughly
-- 16000 characters -- some 3000 words -- which is far beyond any form field and
-- generous even for a long piece of writing.
--
-- WHAT IT DELIBERATELY DOES NOT DO
-- It does not enforce `required`, `email`, or any other rule from the
-- validation panel. Those live on the BLOCK that feeds a column, not on the
-- column, and the server cannot see which input fed which field. Enforcing a
-- guess would refuse honest submissions, which is worse than the gap. The three
-- things above are properties of the COLUMN and are knowable from here.
--
-- THE ORDER THESE TRIGGERS FIRE IN IS LOAD-BEARING, AND IT IS DECIDED BY THEIR
-- NAMES. Postgres runs BEFORE triggers on a table alphabetically, which gives:
--
--   enforce_row_limits_trigger     (0007)  is this page allowed another row
--   enforce_row_shape_insert       (0009)  make the row look like the table
--   enforce_unique_columns_insert  (0008)  is this value already taken
--
-- Shape before unique is the one that matters. Uniqueness compares the stored
-- value, so a slot arriving as " 10am" and one arriving as "10am" would be two
-- different bookings if they were compared before being tidied. Limits first
-- costs nothing and refuses the cheapest case first.
--
-- That order is currently a happy accident of three names chosen separately, so
-- a check asserts it. Renaming a trigger would otherwise reorder the pipeline
-- silently, and the symptom would be a double booking that nobody could
-- reproduce.
--
-- Safe to run more than once.

begin;

create or replace function public.enforce_row_shape()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  -- See the arithmetic in the header before changing this.
  v_max_bytes constant integer := 16384;
  v_columns jsonb;
  v_column jsonb;
  v_name text;
  v_type text;
  v_value jsonb;
  v_text text;
  v_clean jsonb := '{}'::jsonb;
  v_size integer;
begin
  if new.page_id is null or new.database_block_id is null then
    return new;
  end if;

  if new.row_data is null or jsonb_typeof(new.row_data) <> 'object' then
    -- Not a row at all. An empty object is a row with nothing filled in, which
    -- is ordinary; anything else is a caller that is not the app.
    new.row_data := '{}'::jsonb;
    return new;
  end if;

  select p.blocks -> 'runtimeStates' -> new.database_block_id -> 'columns'
    into v_columns
    from public.pages p
   where p.id = new.page_id;

  -- No declared columns means nothing can be judged. Refusing here would break
  -- a table whose page has not finished saving.
  if v_columns is null or jsonb_typeof(v_columns) <> 'array' then
    return new;
  end if;

  for v_column in select * from jsonb_array_elements(v_columns) loop
    v_name := v_column ->> 'name';
    continue when v_name is null;
    v_type := coalesce(v_column ->> 'type', 'text');

    v_value := new.row_data -> v_name;
    -- A column the row did not fill in stays unfilled. Writing a default here
    -- would invent an answer nobody gave.
    continue when v_value is null;

    if jsonb_typeof(v_value) = 'null' then
      v_clean := v_clean || jsonb_build_object(v_name, to_jsonb(''::text));
      continue;
    end if;

    v_text := v_value #>> '{}';

    if v_type = 'number' then
      -- Empty stays empty: a number field left blank is blank, not zero.
      if v_text is null or btrim(v_text) = '' then
        v_clean := v_clean || jsonb_build_object(v_name, to_jsonb(''::text));
      elsif v_text ~ '^\s*-?\d+(\.\d+)?\s*$' then
        v_clean := v_clean || jsonb_build_object(v_name, to_jsonb(btrim(v_text)::numeric));
      else
        raise exception '% has to be a number', v_name using errcode = 'P0006';
      end if;

    elsif v_type = 'boolean' then
      v_clean := v_clean || jsonb_build_object(
        v_name,
        to_jsonb(lower(coalesce(v_text, '')) in ('true', 't', '1', 'yes'))
      );

    elsif v_type = 'date' then
      if v_text is null or btrim(v_text) = '' then
        v_clean := v_clean || jsonb_build_object(v_name, to_jsonb(''::text));
      else
        begin
          -- Stored as the instant the client stored, not re-derived: the client
          -- built it from LOCAL midnight and re-deriving here would move the day
          -- for everyone outside UTC.
          perform btrim(v_text)::timestamptz;
          v_clean := v_clean || jsonb_build_object(v_name, to_jsonb(btrim(v_text)));
        exception when others then
          raise exception '% has to be a date', v_name using errcode = 'P0006';
        end;
      end if;

    else
      v_clean := v_clean || jsonb_build_object(v_name, to_jsonb(coalesce(v_text, '')));
    end if;
  end loop;

  -- Everything not matched above is gone: a key that is not a column has
  -- nowhere to be shown and nowhere to be read from.
  new.row_data := v_clean;

  v_size := octet_length(new.row_data::text);
  if v_size > v_max_bytes then
    raise exception 'that entry is too long (% characters)', v_size using errcode = 'P0007';
  end if;

  return new;
end;
$function$;

drop trigger if exists enforce_row_shape_insert on public.database_rows;
create trigger enforce_row_shape_insert
  before insert on public.database_rows
  for each row execute function public.enforce_row_shape();

drop trigger if exists enforce_row_shape_update on public.database_rows;
create trigger enforce_row_shape_update
  before update of row_data on public.database_rows
  for each row execute function public.enforce_row_shape();

commit;
notify pgrst, 'reload schema';


-- ===========================================================================
-- 0010_live_changes.sql
-- ===========================================================================

-- Creora - being TOLD that a table changed, instead of asking every four seconds.
--
-- WHAT HAPPENS TODAY
-- A Database block re-reads ALL of its rows on a timer. `list_database_rows`
-- has no "only what changed", so a table with a thousand rows is about half a
-- megabyte per poll, and most polls change nothing: a page open on a desk all
-- afternoon asks nine hundred times and gets the same answer nine hundred
-- times. pollPace.ts already slows that down and says, in writing, that the
-- real fix "needs a server that can say nothing since X". This is that half.
--
-- WHY THIS IS NOT postgres_changes
-- usePollWhileVisible says why realtime was not used, and it is right:
-- postgres_changes respects RLS, Creora's tables have RLS on with no policies
-- at all, and every read goes through a SECURITY DEFINER RPC. Turning on
-- postgres_changes would deliver nothing without opening the tables to direct
-- reads, which is the one thing the security model exists to prevent.
--
-- >>> SO THE SIGNAL CARRIES NO DATA. <<<
--
-- This broadcasts the BLOCK ID and nothing else. No column, no row, no count.
-- The page is told "something in this table moved" and then re-reads through
-- `list_database_rows`, the same RPC it uses today, which already decides who
-- may see what and is already proven. Nothing is opened up and no row ever
-- travels over the realtime channel.
--
-- What a subscriber learns is that a table they can already poll has changed.
-- Anyone who can open the page can observe exactly that by watching the count,
-- so the signal tells them nothing that polling would not.
--
-- WHAT IT COSTS
-- A trigger on every row write, which inserts one row into realtime.messages.
-- That is real and it is per row: a bulk insert of a hundred rows is a hundred
-- broadcasts. The client coalesces a burst into one read (SIGNAL_COALESCE_MS
-- in lib/liveChanges.ts) so the reads do not multiply, but the sends do. If
-- that ever matters, the answer is a statement-level trigger, and it is not
-- written yet because per-row is what carries the block id.
--
-- WITHOUT THIS MIGRATION NOTHING BREAKS
-- No trigger means no broadcasts, the client never connects, and every page
-- polls exactly as it does today. There is no half-working state, and the live
-- path is never slower than the timer it shortcuts -- see paceFor().
--
-- Safe to run more than once.

begin;

-- ---------------------------------------------------------------------------
-- 1. Who may receive one
-- ---------------------------------------------------------------------------
-- Scoped to Creora's own topics rather than `using (true)`. A blanket policy
-- would let anyone signed in to this project receive every broadcast on it,
-- including from anything else sharing the database.
drop policy if exists "creora receives its own row signals" on realtime.messages;
create policy "creora receives its own row signals"
  on realtime.messages
  for select
  to authenticated
  using ( realtime.topic() like 'creora:rows:%' );

-- ---------------------------------------------------------------------------
-- 2. The signal
-- ---------------------------------------------------------------------------
create or replace function public.creora_signal_rows_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_block text;
begin
  -- DELETE has no NEW; INSERT and UPDATE have no OLD worth reading here.
  v_block := coalesce(new.database_block_id, old.database_block_id);
  if v_block is null then
    return null;
  end if;

  perform realtime.send(
    -- THE WHOLE PAYLOAD. Deliberately not the row: see the header.
    jsonb_build_object('block_id', v_block),
    'rows',
    'creora:rows:' || v_block,
    true            -- private: only a signed-in client may subscribe
  );
  return null;
exception
  -- A page that cannot be told is a page that polls, which is where it started.
  -- A broadcast must never be able to fail somebody's row write.
  when others then
    return null;
end;
$$;

drop trigger if exists creora_rows_changed on public.database_rows;
create trigger creora_rows_changed
  after insert or update or delete
  on public.database_rows
  for each row
  execute function public.creora_signal_rows_changed();

commit;

-- ---------------------------------------------------------------------------
-- Afterwards, to check it: open a page with a Database block, add a row from
-- another browser, and the first page should show it within a second rather
-- than within a minute. The Health panel says which of the two it is doing.
-- ---------------------------------------------------------------------------
