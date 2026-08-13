import type { BlockRuntimeState } from '../types/creora';

/**
 * Which rows a repeater shows, and in what order.
 *
 * WHY THIS IS PURE
 * "For each row" is where a page stops being a form and becomes a site: a blog,
 * a directory, a gallery, a leaderboard, search results. All of that is the
 * same three decisions -- which rows, in what order, how many -- and none of
 * them need a network, a DOM or a database. So they live here, where
 * `npm run check` can hold them, instead of inside a component where the only
 * way to find out is to look at a screen.
 */

export type Row = Record<string, any>;

/**
 * A ceiling on rows actually rendered, whatever the builder asked for.
 *
 * Each row is a separate slot-fill, so a 5,000-row table dropped into a
 * repeater would lock the tab. A page that silently renders 200 of 5,000 rows
 * is lying, so the block says so on screen when it truncates -- see
 * `truncatedNote` below. Paging is queue item 4; this is the guard until then.
 */
export const MAX_RENDERED_ROWS = 200;

/**
 * The filter is deliberately the same one a Database block already uses:
 * equality, compared as text, so "5" typed into a box matches 5 in a number
 * column. Two filters with different rules in one product is a thing nobody
 * can hold in their head.
 */
function applyFilter(rows: Row[], state?: BlockRuntimeState): Row[] {
  const col = state?.filterColumn;
  if (!col) return rows;
  const want = state?.filterValue;
  const wanted = want === undefined || want === null ? '' : String(want);
  return rows.filter((r) => String(r?.[col] ?? '') === wanted);
}

/**
 * Compare two cells without being told what type they are.
 *
 * Numbers as numbers -- otherwise "10" sorts before "9", which looks like a bug
 * to everyone who sees it. Booleans with false first. Everything else by
 * localeCompare, so accented names land where a reader expects rather than
 * where their code points fall. Blanks always sort last regardless of
 * direction: an empty cell is missing data, not the smallest value, and a
 * "newest first" list headed by rows with no date is useless.
 */
export function compareCells(a: any, b: any): number {
  const aBlank = a === null || a === undefined || a === '';
  const bBlank = b === null || b === undefined || b === '';
  if (aBlank && bBlank) return 0;
  if (aBlank) return 1;
  if (bBlank) return -1;

  if (typeof a === 'boolean' || typeof b === 'boolean') {
    return (a ? 1 : 0) - (b ? 1 : 0);
  }

  const na = Number(a);
  const nb = Number(b);
  if (!isNaN(na) && !isNaN(nb) && String(a).trim() !== '' && String(b).trim() !== '') {
    return na - nb;
  }

  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

export interface VisibleRowsResult {
  rows: Row[];
  /** How many matched the filter, before any limit. */
  matched: number;
  /** Set when rows were dropped, so the page can admit it rather than imply completeness. */
  truncatedNote: string | null;
}

/**
 * Filter, then order, then limit -- in that order, because any other order
 * answers a different question. "The three cheapest red ones" is not "the red
 * ones out of the three cheapest".
 */
export function visibleRows(rows: Row[] | undefined | null, state?: BlockRuntimeState): VisibleRowsResult {
  const all = Array.isArray(rows) ? rows : [];
  const filtered = applyFilter(all, state);

  const sortColumn = state?.sortColumn;
  let ordered = filtered;
  if (sortColumn) {
    const direction = state?.sortDirection === 'desc' ? -1 : 1;
    // Copied before sorting: sort() mutates, and this array belongs to the
    // Database block's runtime state, which is shared with the table itself.
    ordered = [...filtered].sort((a, b) => compareCells(a?.[sortColumn], b?.[sortColumn]) * direction);
  } else if (state?.sortDirection === 'desc') {
    // No column named, but "newest first" asked for: rows arrive oldest-first,
    // so reversing them IS newest-first, and it is what people mean.
    ordered = [...filtered].reverse();
  }

  const asked = state?.maxRows;
  const wanted = typeof asked === 'number' && asked > 0 ? Math.min(asked, MAX_RENDERED_ROWS) : MAX_RENDERED_ROWS;
  const shown = ordered.slice(0, wanted);

  let truncatedNote: string | null = null;
  if (ordered.length > shown.length) {
    const hidden = ordered.length - shown.length;
    truncatedNote =
      typeof asked === 'number' && asked > 0 && asked <= MAX_RENDERED_ROWS
        ? null // The builder asked for exactly this many. Not a truncation.
        : 'Showing ' + shown.length + ' of ' + ordered.length + ' (' + hidden + ' not shown)';
  }

  return { rows: shown, matched: filtered.length, truncatedNote };
}

/**
 * The slot values for one row.
 *
 * Column names come straight through, so a template written against a table
 * reads exactly like the table. The two extras are named in words rather than
 * symbols, because "{{Row number}}" is guessable and "{{#}}" is not.
 */
export function rowSlots(row: Row, index: number): Record<string, any> {
  const values: Record<string, any> = {};
  for (const key of Object.keys(row || {})) {
    if (key === 'id') continue; // exposed as "Row id", so a column called id can win
    values[key] = row[key];
  }
  values['Row number'] = index + 1;
  values['Row id'] = row?.id ?? '';
  return values;
}

/** Column names a builder can put in a template, for the inspector to list. */
export function slotNamesFor(state?: BlockRuntimeState): string[] {
  const columns = (state?.columns || []).map((c) => c.name).filter(Boolean);
  return [...columns, 'Row number', 'Row id'];
}
