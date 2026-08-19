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
--                                   two a minute; sixty is a machine
--   50000 rows per page total    -- far above any free tier, and still a
--                                   ceiling rather than a cliff
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
  -- Per page, ever. Runaway protection, not a pricing tier.
  v_total constant integer := 50000;
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
