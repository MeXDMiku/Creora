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
