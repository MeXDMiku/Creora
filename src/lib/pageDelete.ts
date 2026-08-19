import { supabase } from './supabase';
import { toCsv, csvFileName, downloadCsv } from './csv';

/**
 * Deleting a page, and saying what that costs before it happens.
 *
 * WHY THE WARNING IS THE FEATURE
 * Deleting a page deletes the rows collected on it, and there is no undo. The
 * builder asked for it this way: warn, say how much data goes, and offer to
 * save it first. So the interesting part here is not the delete -- it is
 * counting honestly what is about to be lost, and being able to hand it over.
 *
 * A count that quietly said 0 when it could not tell would be the worst
 * possible failure: somebody reads "no data will be lost" and presses the
 * button. So `countable` is separate from the count, and an unknown is an
 * unknown rather than a zero.
 */

export interface PageDataSummary {
  /** Every Database block on the page, with what it holds. */
  tables: { blockId: string; name: string; columns: { name: string; type?: string }[]; rows: Record<string, any>[] }[];
  rowCount: number;
  tableCount: number;
  /**
   * False when a table's rows have not been loaded, so the count is a floor
   * rather than a total. The warning must say "at least N" in that case.
   */
  countIsComplete: boolean;
}

/** What is on this page, from runtime state that is already loaded. */
export function summarisePageData(
  blockIds: string[],
  stateOf: (blockId: string) => any,
  isDatabase: (blockId: string) => boolean,
): PageDataSummary {
  const tables: PageDataSummary['tables'] = [];
  let complete = true;

  for (const blockId of blockIds || []) {
    if (!isDatabase(blockId)) continue;
    const state = stateOf(blockId);
    const rows = state?.rows;
    // A table whose rows were never fetched reports itself as not counted,
    // rather than contributing a confident zero.
    if (!Array.isArray(rows)) complete = false;
    tables.push({
      blockId,
      name: String(state?.blockName || 'Table'),
      // Types too -- see toCsv: a date column is written as a day.
      columns: (state?.columns || []) as { name: string; type?: string }[],
      rows: Array.isArray(rows) ? rows : [],
    });
  }

  return {
    tables,
    tableCount: tables.length,
    rowCount: tables.reduce((total, t) => total + t.rows.length, 0),
    countIsComplete: complete,
  };
}

/**
 * The sentence shown before the button.
 *
 * Written out here rather than in the component so it can be checked. The
 * wording carries the whole weight of the decision: a builder who misreads this
 * loses data with no way back.
 */
export function describeWhatWillBeLost(pageName: string, summary: PageDataSummary): string {
  const page = pageName?.trim() || 'This page';
  if (summary.tableCount === 0) {
    return `"${page}" has no tables on it, so there is no collected data to lose. Deleting it cannot be undone.`;
  }
  if (summary.rowCount === 0 && summary.countIsComplete) {
    const tables = summary.tableCount === 1 ? 'one table' : `${summary.tableCount} tables`;
    return `"${page}" has ${tables} on it and no rows in them yet. Deleting it cannot be undone.`;
  }
  const about = summary.countIsComplete ? '' : 'at least ';
  const rows = summary.rowCount === 1 ? '1 row' : `${summary.rowCount} rows`;
  const tables = summary.tableCount === 1 ? '1 table' : `${summary.tableCount} tables`;
  return `Deleting "${page}" also deletes ${about}${rows} across ${tables}. This cannot be undone — save the data first if you might want it.`;
}

/** Everything on the page as one CSV per table, handed over before deleting. */
export function downloadPageData(pageName: string, summary: PageDataSummary): number {
  let saved = 0;
  for (const table of summary.tables) {
    // A table with no rows still exports its headings: getting an empty file
    // back is a clearer answer than getting no file and wondering.
    downloadCsv(csvFileName(`${pageName || 'page'} - ${table.name}`), toCsv(table.columns, table.rows));
    saved += 1;
  }
  return saved;
}

/**
 * Turn a failure into something a person can act on.
 *
 * The first case is the one that matters, and it is the same shape as
 * collections.ts: until the migration is run the function does not exist and
 * PostgREST answers PGRST202 with a message about schema cache, which tells a
 * builder nothing about what to do next.
 */
export function describeDeleteError(error: unknown): string {
  let message = '';
  let code = '';
  if (typeof error === 'string') message = error;
  else if (error && typeof error === 'object') {
    const e = error as { message?: unknown; code?: unknown };
    message = String(e.message ?? '');
    code = String(e.code ?? '');
  }
  const lower = message.toLowerCase();

  if (
    code === 'PGRST202' ||
    lower.includes('could not find the function') ||
    lower.includes('does not exist') ||
    lower.includes('schema cache')
  ) {
    return 'Deleting a page needs one database change that has not been made yet. Run supabase/migrations/0005_delete_page.sql — docs/MIGRATION_0005.md has the steps.';
  }
  if (lower.includes('not your page') || code === '42501') {
    return 'Only the person who owns this page can delete it.';
  }
  if (lower.includes('failed to fetch') || lower.includes('network')) {
    return 'Could not reach the server, so nothing was deleted. Check the connection and try again.';
  }
  return message ? `That did not work: ${message}` : 'That did not work, and the server did not say why.';
}

export interface DeleteResult {
  ok: boolean;
  error: string | null;
}

/** Delete it. The asking has already happened by the time this runs. */
export async function deletePage(pageId: string): Promise<DeleteResult> {
  if (!pageId) return { ok: false, error: 'There is no page to delete.' };
  try {
    const { error } = await supabase.rpc('delete_page', { p_id: pageId });
    if (error) return { ok: false, error: describeDeleteError(error) };
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: describeDeleteError(err) };
  }
}
