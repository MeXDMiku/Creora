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
