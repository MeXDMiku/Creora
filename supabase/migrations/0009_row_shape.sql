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
