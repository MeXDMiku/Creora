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
