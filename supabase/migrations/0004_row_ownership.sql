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
