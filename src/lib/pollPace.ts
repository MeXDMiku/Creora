/**
 * How often to ask again, when asking costs money.
 *
 * THE LEAK THIS CLOSES
 * A Database block re-reads ALL of its rows every four seconds while the tab is
 * visible. `list_database_rows` has no "only what changed" -- it returns
 * everything -- so a table with a thousand rows is roughly half a megabyte per
 * poll. A visitor sitting on that page for five minutes costs about 37 MB, and
 * the free plan includes 5 GB of egress a month. That is a hundred and thirty
 * page-sits, from one block, with nobody doing anything wrong.
 *
 * THE SHAPE OF THE FIX
 * Most polls change nothing. A page open on a desk all afternoon asks nine
 * hundred times and gets the same answer nine hundred times. So: keep asking
 * quickly while things are happening, and slow down when they are not.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * It does not stop. "Nothing changed for an hour" is not evidence that nothing
 * will, and a table that has quietly given up is worse than a slow one --
 * somebody submits on their phone and the owner's screen never catches up,
 * which is the feature this polling exists to provide.
 *
 * The real fix is a server that can say "nothing since X", and that needs a
 * migration and a way to notice deletions. This is the client-side half, and it
 * is most of the money.
 */

/** How fast to ask while something is happening. */
export const POLL_FAST_MS = 4000;
/** The slowest it ever gets. Still fast enough that a page catches up. */
export const POLL_SLOW_MS = 60000;
/** Unchanged answers before it starts slowing down. */
export const POLL_PATIENCE = 3;

export interface PollPace {
  intervalMs: number;
  /** Consecutive answers that were the same as the one before. */
  quietRounds: number;
}

export const startingPace = (): PollPace => ({ intervalMs: POLL_FAST_MS, quietRounds: 0 });

/**
 * The pace after one answer.
 *
 * Doubling, not a fixed slow value: something that has been still for ten
 * seconds is not the same as something still for ten minutes, and treating them
 * alike either wastes the first case or abandons the second.
 */
export function nextPace(current: PollPace, changed: boolean): PollPace {
  if (changed) return startingPace();

  const quietRounds = current.quietRounds + 1;
  if (quietRounds < POLL_PATIENCE) return { intervalMs: current.intervalMs, quietRounds };

  return {
    intervalMs: Math.min(POLL_SLOW_MS, current.intervalMs * 2),
    quietRounds,
  };
}

/**
 * Cheap enough to run on every answer, and honest about what it can miss.
 *
 * Ids and count catch every arrival and every removal. An EDIT to a row that
 * keeps its id is not caught here -- deliberately, because the alternative is
 * hashing every value of every row on every poll, which is work done on the
 * visitor's phone to save a little of somebody else's bandwidth. An edit still
 * shows up: the next real change resets the pace, and the slow poll is sixty
 * seconds, not never.
 */
export function rowsFingerprint(rows: { id?: any }[] | undefined | null): string {
  const list = rows || [];
  return `${list.length}:${list.map(r => String(r?.id ?? '')).join(',')}`;
}
