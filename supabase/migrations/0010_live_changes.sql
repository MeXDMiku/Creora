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
