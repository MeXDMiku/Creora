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
