import { getDefaultStore } from 'jotai';
import { blockRuntimeAtom } from '../state/atoms';
import { computeDatabaseOutput } from './databaseOutput';

/**
 * Getting a Database block's rows from the store, once, for both sides.
 *
 * WHY THIS FILE EXISTS
 * The editor and the published page each had their own copy of this, about
 * fifty lines apiece, doing the same RPC, the same parse, the same
 * did-anything-change comparison and the same workflow firing. `BACKLOG.md`
 * has had it written down as debt since August:
 *
 *   "Roughly 500 lines in PublishedRenderer.tsx reimplement Timer, Database
 *    and List wholesale, including Database's Supabase writes. That is where
 *    the two sides silently drift -- and Database is the one that writes real
 *    data."
 *
 * They had already drifted, in the exact place the editor's own comment warns
 * about. The editor spreads `currentLocalState || runtimeState`, because a
 * stale closure once wrote a block's DEFAULT columns and name back over a page
 * that had just loaded -- the Feedback page showed "Database / Name / Age" in
 * the editor while disk still said "Submissions / Name / Message". The
 * published copy spreads `currentLocalState` alone. Nobody decided that; one
 * copy was edited and the other was not.
 *
 * WHAT IS DELIBERATE HERE
 * - The current state is read from the STORE at call time, never from a value
 *   captured when an effect ran. That is the whole point of the bug above.
 * - An empty answer does not wipe rows that are already held. A fetch that
 *   comes back with nothing is far more often a server that has not caught up
 *   than a table somebody emptied, and showing zero rows is indistinguishable
 *   from a page that is simply quiet.
 * - A failure returns TRUE -- "something changed" -- which reads oddly and is
 *   right: the caller uses it to decide whether to slow its polling down, and
 *   backing off from an unreachable server is backing off from the one thing
 *   that needs retrying.
 */

export interface RowFetchResult {
  data?: any;
  error?: any;
}

/**
 * A row as the store keeps it: the database's own id, with the saved fields
 * spread on top.
 *
 * Three places wrote this same two-line shape -- the editor's table, the
 * published List's own fetch, and the List loader in bindingEngine. It is the
 * boundary between how a row is STORED and how the page reads it, so it is the
 * exact line that must not be written three ways.
 */
export interface StoredRow { [key: string]: any; id: string }

export function parseRows(data: any): StoredRow[] {
  return (data || []).map((item: any) => ({ id: String(item.id), ...item.row_data }));
}

/**
 * @param fetchRows does the actual read. Injected so this can be checked
 *   without a network, and so both callers hand in the same Supabase call
 *   rather than each writing their own. Typed as a THENABLE, not a Promise:
 *   Supabase's query builder is one, which is a fact this codebase has had to
 *   write down before.
 * @param onChanged runs only when the answer really differed -- both sides use
 *   it to fire the block's `onChange` and recalculate, and doing it here would
 *   drag the workflow engine into a file that only knows about rows.
 * @returns whether anything differed, which is what drives the poll backoff.
 */
export async function loadDatabaseRows(
  blockId: string,
  store: ReturnType<typeof getDefaultStore>,
  fetchRows: (blockId: string) => PromiseLike<RowFetchResult>,
  onChanged?: () => void,
  onSettled?: () => void,
): Promise<boolean> {
  try {
    const { data, error } = await fetchRows(blockId);
    if (error) return true;
    if (!data) return false;

    const parsedRows = parseRows(data);

    // Read NOW, not from a closure. See the note at the top of this file.
    const current = store.get(blockRuntimeAtom(blockId));
    const currentRows = current?.rows || [];

    // An empty answer beside rows we already hold is not evidence they are gone.
    if (parsedRows.length === 0 && currentRows.length > 0) return false;

    const nextValue = computeDatabaseOutput(parsedRows, current);
    const changed =
      JSON.stringify(currentRows) !== JSON.stringify(parsedRows) || current?.value !== nextValue;

    store.set(blockRuntimeAtom(blockId), { ...current, rows: parsedRows, value: nextValue });
    onSettled?.();
    if (changed) onChanged?.();
    return changed;
  } catch {
    return true;
  }
}
