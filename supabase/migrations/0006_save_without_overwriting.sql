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
