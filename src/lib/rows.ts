import type { BlockRuntimeState } from '../types/creora';
import { evaluateCondition } from './conditions';

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
 * What a visitor is looking at: which rows, in what order, which page.
 *
 * A plain object rather than a block's runtime state, deliberately. Half of
 * these come from a fixed setting the builder typed and half come from a live
 * block a visitor is typing into, and the difference belongs in the component
 * that resolves them -- not in here, where it would make every check need a
 * store.
 */
export interface ViewSpec {
  /** Free text, matched across `searchColumns`. */
  search?: string;
  /** Which columns the search looks at. Empty means all of them. */
  searchColumns?: string[];
  filterColumn?: string;
  /** Any operator from conditions.ts. Defaults to equals. */
  filterOperator?: string;
  filterValue?: any;
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  /** 1-based. Out of range is clamped, never empty. */
  page?: number;
  pageSize?: number;
  /** Used only when there is no pageSize. */
  maxRows?: number;
}

/** Operators that are complete on their own, so a blank value is not "no filter". */
const VALUELESS_OPERATORS = new Set(['isEmpty', 'isNotEmpty', 'is ON', 'is OFF', 'is_ON', 'is_OFF']);

function cellText(value: any): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/**
 * Free-text search across a row.
 *
 * Every word must appear somewhere in the row, but not necessarily in the same
 * column: "ada lon" finds the row with Ada in Name and London in City. That is
 * what people mean when they type two words into one box, and matching the
 * whole phrase against each column separately -- the obvious implementation --
 * finds nothing and reads as broken.
 */
export function rowMatchesSearch(row: Row, search: string, columns?: string[]): boolean {
  const terms = (search || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const keys = columns && columns.length ? columns : Object.keys(row || {}).filter((k) => k !== 'id');
  const haystack = keys.map((k) => cellText(row?.[k])).join(' ').toLowerCase();

  return terms.every((term) => haystack.includes(term));
}

/**
 * The filter, using the product's own operator vocabulary rather than a second
 * private one. A visitor narrowing a list and a workflow deciding whether to
 * run are asking the same question; conditions.ts answers it once.
 *
 * A blank value means no filter, except for the operators that do not take one.
 * Otherwise an empty search box would hide every row, which is the single most
 * common way a filtered list looks broken on first load.
 */
/**
 * A cell, with one name that is not a column.
 *
 * "Row id" is how a detail page finds its row with no setup at all: a link
 * carries the id, a Page value block reads it, the filter compares against it.
 * Requiring a Slug column first would be more correct and would stop most
 * people building a detail page at the first step.
 */
function cellFor(row: Row, column: string): any {
  return column === 'Row id' ? row?.id : row?.[column];
}

function passesFilter(row: Row, spec: ViewSpec): boolean {
  const col = spec.filterColumn;
  if (!col) return true;
  const operator = spec.filterOperator || 'equals';
  const value = spec.filterValue;
  const blank = value === undefined || value === null || value === '';
  if (blank && !VALUELESS_OPERATORS.has(operator)) return true;
  return evaluateCondition(cellFor(row, col), operator, value);
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
  /** How many survived search and filter, before any page or limit. */
  matched: number;
  /** The page actually shown, after clamping. 1 when there are no pages. */
  page: number;
  /** How many pages there are. 1 when paging is off or there is nothing. */
  pageCount: number;
  /** Set when rows were dropped without being asked for, so the page can admit it. */
  truncatedNote: string | null;
}

/**
 * Search, then filter, then order, then take a page -- in that order, because
 * any other order answers a different question. "The three cheapest red ones"
 * is not "the red ones out of the three cheapest", and page 2 of a search is
 * not a search of page 2.
 */
export function visibleRows(rows: Row[] | undefined | null, spec: ViewSpec = {}): VisibleRowsResult {
  const all = Array.isArray(rows) ? rows : [];

  const searched = spec.search && spec.search.trim() !== ''
    ? all.filter((r) => rowMatchesSearch(r, spec.search as string, spec.searchColumns))
    : all;

  const filtered = searched.filter((r) => passesFilter(r, spec));

  const sortColumn = spec.sortColumn;
  let ordered = filtered;
  if (sortColumn) {
    const direction = spec.sortDirection === 'desc' ? -1 : 1;
    // Copied before sorting: sort() mutates, and this array belongs to the
    // Database block's runtime state, which is shared with the table itself.
    ordered = [...filtered].sort((a, b) => compareCells(cellFor(a, sortColumn), cellFor(b, sortColumn)) * direction);
  } else if (spec.sortDirection === 'desc') {
    // No column named, but "newest first" asked for: rows arrive oldest-first,
    // so reversing them IS newest-first, and it is what people mean.
    ordered = [...filtered].reverse();
  }

  const matched = ordered.length;

  // --- paging ---
  const pageSize = typeof spec.pageSize === 'number' && spec.pageSize > 0
    ? Math.min(spec.pageSize, MAX_RENDERED_ROWS)
    : 0;

  if (pageSize > 0) {
    const pageCount = Math.max(1, Math.ceil(matched / pageSize));
    // Clamped rather than trusted. A page number can come from a block a
    // visitor is pressing, and "Next" past the end must show the last page,
    // not an empty one that reads as "your search broke".
    const page = Math.min(Math.max(1, Math.floor(spec.page || 1)), pageCount);
    const start = (page - 1) * pageSize;
    return {
      rows: ordered.slice(start, start + pageSize),
      matched,
      page,
      pageCount,
      truncatedNote: null,
    };
  }

  const asked = spec.maxRows;
  const wanted = typeof asked === 'number' && asked > 0 ? Math.min(asked, MAX_RENDERED_ROWS) : MAX_RENDERED_ROWS;
  const shown = ordered.slice(0, wanted);

  let truncatedNote: string | null = null;
  if (matched > shown.length) {
    const hidden = matched - shown.length;
    truncatedNote =
      typeof asked === 'number' && asked > 0 && asked <= MAX_RENDERED_ROWS
        ? null // The builder asked for exactly this many. Not a truncation.
        : 'Showing ' + shown.length + ' of ' + matched + ' (' + hidden + ' not shown)';
  }

  return { rows: shown, matched, page: 1, pageCount: 1, truncatedNote };
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

/**
 * Which rows a workflow step is talking about.
 *
 * WHY THIS IS HERE AND NOT WRITTEN TWICE
 * `updateRow` and `deleteRow` each carried their own copy of this -- about
 * thirty-five identical lines: read the match column, coerce the wanted value
 * by that column's declared type, coerce each row's cell the same way, compare.
 * Two copies of a comparison is how "equals" ends up meaning two different
 * things, and this codebase has already paid for that: the editor and the
 * published renderer drifted apart five separate times, every one of them a
 * duplicated code path that got fixed on one side only.
 *
 * The coercion is the part that must not drift. A column declared `number`
 * compares numerically, so row "10" matches a typed 10; a `boolean` column
 * treats the string "true" as true, because that is what a fixed value from a
 * text field arrives as. Get that wrong on one side and a delete silently
 * removes nothing while an update silently changes the wrong row.
 */
export interface ColumnDef {
  name: string;
  type?: string;
}

/** Coerce one value the way this column's declared type says to. */
export function coerceForColumn(value: any, column: ColumnDef | undefined): any {
  if (!column) return value;
  if (column.type === 'number') return Number(value);
  if (column.type === 'boolean') return value === 'true' || value === true;
  return String(value === undefined || value === null ? '' : value);
}

/**
 * Every row whose match column equals the wanted value, in table order.
 *
 * Returns indexes rather than rows because both callers need to rebuild the
 * array around them -- one replaces an entry, the other removes entries -- and
 * an index is the only thing that identifies a row when two rows are identical.
 *
 * Order matters and is the table's own. A caller deleting several rows has to
 * walk it backwards, and it can only do that safely if the order is defined.
 */
export function matchingRowIndexes(
  rows: Record<string, any>[] | undefined | null,
  columns: ColumnDef[] | undefined | null,
  matchColumn: string | undefined | null,
  wantedValue: any,
): number[] {
  if (!rows || !rows.length || !matchColumn) return [];
  const column = (columns || []).find(c => c.name === matchColumn);
  const wanted = coerceForColumn(wantedValue, column);

  const out: number[] = [];
  rows.forEach((row, index) => {
    if (coerceForColumn(row[matchColumn], column) === wanted) out.push(index);
  });
  return out;
}

/**
 * The indexes a step should act on: the first match, or all of them.
 *
 * Separate from the matching itself so the DEFAULT is visible and checkable.
 * Acting on every row has to be opt-in -- a step built before this existed
 * changed exactly one row, and quietly turning that into "all of them" would
 * rewrite people's data the next time they pressed a button they had already
 * been pressing for weeks.
 */
export function rowIndexesForStep(
  rows: Record<string, any>[] | undefined | null,
  columns: ColumnDef[] | undefined | null,
  matchColumn: string | undefined | null,
  wantedValue: any,
  applyToAll?: boolean,
): number[] {
  const all = matchingRowIndexes(rows, columns, matchColumn, wantedValue);
  return applyToAll ? all : all.slice(0, 1);
}
