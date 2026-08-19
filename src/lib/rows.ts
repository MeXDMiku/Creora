import { toDate, formatDate } from './format';
import type { BlockRuntimeState, ColumnType } from '../types/creora';
import { evaluateCondition } from './conditions';
import { evaluateExpression, truthy, explainUnreadableFormula } from './formula';

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
  /**
   * A formula over the row's own columns, written as `{{Price}} * {{Qty}} > 500`.
   *
   * Wins over the column/operator/value row when both are set, because a
   * builder who has written a formula has said the more specific thing. One
   * comparison against one value cannot express "worth more than 500" however
   * many controls are added -- the same wall step conditions hit.
   */
  filterFormula?: string;
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
  // A formula says the more specific thing, so it wins when both are set.
  if (isFormulaFilter(spec.filterFormula)) {
    return rowMatchesFormula(row, spec.filterFormula).pass;
  }
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
  if (column.type === 'date') return isoDate(value);
  return String(value === undefined || value === null ? '' : value);
}

/**
 * A date column's stored shape: ISO text, or empty.
 *
 * WHY ISO AND NOT A DATE OBJECT
 * Rows are JSON in a jsonb column and go through a save, a load, a CSV export
 * and an import. A Date survives none of those. ISO survives all of them, sorts
 * correctly as plain TEXT -- which is what makes a date column sort right for
 * free, with no special case anywhere in the sorting -- and is what every date
 * function in the formula language already reads.
 *
 * SOMETHING UNREADABLE BECOMES EMPTY, NOT TODAY. A date nobody can read is a
 * field that was not filled in; quietly substituting the current date would
 * write a booking for now, which is worse than a blank in every direction.
 */
export function isoDate(value: any): string {
  if (value === null || value === undefined || String(value).trim() === '') return '';
  const d = toDate(value);
  return d ? d.toISOString() : '';
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

/**
 * Filtering rows with a formula over the row's own columns.
 *
 * WHY A COLUMN-OPERATOR-VALUE ROW WAS NOT ENOUGH
 * A repeater could filter on ONE column against ONE value. So "orders worth
 * more than 500" -- price times quantity -- was not expressible, and neither
 * was "unfinished, and belonging to this person", however many controls were
 * added. Adding more single comparisons cannot multiply, which is the same wall
 * step conditions hit before they learned to take a formula.
 *
 * WHY {{Column}} AND NOT A BARE NAME
 * The repeater's row markup already addresses columns as `{{Price}}`. Using the
 * same spelling in its filter means one idea with one syntax, and it is the
 * only spelling that survives a column called "Your name" -- a bare identifier
 * cannot contain a space, and half the columns anybody actually creates do.
 *
 * The braces are replaced with generated identifiers before the expression is
 * parsed, so the formula language itself needs to know nothing about columns.
 */

const SLOT = /\{\{\s*([^}|]+?)\s*\}\}/g;

/** Was this filter written as a formula at all? */
export function isFormulaFilter(filter: string | undefined | null): boolean {
  return String(filter ?? '').trim() !== '';
}

/** The column names a row formula mentions, in the order they appear. */
export function columnsUsedByFormula(formula: string | undefined | null): string[] {
  const text = String(formula ?? '');
  const found: string[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(SLOT.source, 'g');
  while ((match = re.exec(text)) !== null) {
    const name = match[1].trim();
    if (name && !found.includes(name)) found.push(name);
  }
  return found;
}

export interface RowFormulaResult {
  /** Whether the row is kept. */
  pass: boolean;
  /** Set when the formula could not be worked out at all. */
  error: string | null;
}

/**
 * Answer a row formula against one row.
 *
 * A formula that cannot be worked out KEEPS the row rather than dropping it.
 * That is the deliberate direction: a broken filter that hides everything looks
 * exactly like a table with no data, and a builder stares at an empty list with
 * nothing to tell them why. Showing too much is visibly wrong and leads
 * somebody to the filter; showing nothing is invisibly wrong and leads them to
 * think the data is gone.
 */
export function rowMatchesFormula(
  row: Record<string, any>,
  formula: string | undefined | null,
  rowIdOf: (row: Record<string, any>) => any = r => r?.id,
  now?: Date,
): RowFormulaResult {
  const text = String(formula ?? '').trim();
  if (!text) return { pass: true, error: null };

  const scope: Record<string, any> = {};
  let index = 0;
  const rewritten = text.replace(SLOT, (_all, rawName: string) => {
    const name = String(rawName).trim();
    const key = `__col${index++}`;
    // "Row id" is addressable the same way the repeater's own slots address it.
    scope[key] = name === 'Row id' ? rowIdOf(row) : row?.[name];
    return key;
  });

  try {
    // No tables in a row filter -- a repeater filtering itself by a total of
    // itself is a loop nobody asked for -- but the clock is here, so
    // `{{Due}} > today` works where a builder most expects it to.
    return { pass: truthy(evaluateExpression(rewritten, scope, undefined, { now })), error: null };
  } catch (err: any) {
    const message = String(err?.message || 'that formula could not be worked out');
    /**
     * A spelling mix-up first, because it is the likeliest cause and the
     * generic message points at the wrong thing. `{{Price | money: $}}` is
     * copied out of the row markup on the same panel, where it is correct.
     */
    const spelling = explainUnreadableFormula(text, 'slots');
    if (spelling) return { pass: true, error: spelling };
    /**
     * A bare name in a row formula is almost always somebody writing `Price`
     * where they meant `{{Price}}`, and "Referenced block Price does not exist"
     * sends them looking for a block. Say the thing they can act on.
     */
    const friendly = /Referenced block "(.+?)" does not exist/.exec(message);
    return {
      pass: true,
      error: friendly
        ? `Use {{${friendly[1]}}} to mean a column. A plain name refers to a block, and there is no block called "${friendly[1]}".`
        : message,
    };
  }
}

/**
 * A worked example of a calculated slot, written in the builder's OWN columns.
 *
 * WHY THIS IS NOT IN THE COMPONENT
 * It is a promise: the panel prints it and somebody copies it into the box
 * above expecting it to work. A generic `{{calc: A * B}}` would have to be
 * translated first, which is most of the reason a syntax goes untried -- but an
 * example built from real column names is only useful if it is RIGHT, and the
 * only way to know that is to run it. Out here, a check can render it and
 * compare the answer.
 *
 * Returns null with no columns, because an example naming nothing teaches
 * nothing.
 */
export function calcExampleFor(columns: string[] | undefined | null): string | null {
  const usable = (columns || []).map(c => String(c ?? '').trim()).filter(Boolean);
  // Bare names inside, deliberately: filters are split off the slot before the
  // calculation is read, so a nested {{ }} cannot survive being parsed twice.
  // A name with a space in it therefore cannot go in one -- so it is skipped
  // here rather than offered and then failing.
  const simple = usable.filter(c => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(c));
  if (simple.length >= 2) return `{{calc: ${simple[0]} * ${simple[1]}}}`;
  if (simple.length === 1) return `{{calc: ${simple[0]} * 2}}`;
  return null;
}

/** The same example with a formatting filter on it, to show they compose. */
export function calcExampleWithFilter(example: string | null, symbol = '£'): string | null {
  return example ? example.replace(/\}\}$/, ` | money: ${symbol}}}`) : null;
}

/**
 * A worked example of a row's share of the whole, in the builder's own names.
 *
 * Same reasoning as calcExampleFor: printed in the panel, so it is checked by
 * being RUN. This one earns its own example because reading a whole table from
 * inside a row is the least guessable thing in the language -- the table goes
 * in quotes and the column does too, which is the opposite of the bare names
 * beside it in the same slot.
 */
export function shareExampleFor(
  tableName: string | undefined | null,
  columns: string[] | undefined | null,
): string | null {
  const table = String(tableName ?? '').trim();
  if (!table) return null;
  const numeric = (columns || [])
    .map(c => String(c ?? '').trim())
    .filter(c => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(c));
  if (!numeric.length) return null;
  const col = numeric[0];
  return `{{calc: ${col} / sumOf("${table}", "${col}") * 100 | round: 1}}%`;
}

/**
 * A date column, both ways round, for a `<input type="date">`.
 *
 * The input speaks exactly one dialect -- YYYY-MM-DD, LOCAL, no time -- and
 * refuses to display anything else, silently and with no error. Stored dates
 * are ISO with a time and a zone on them, so handing one straight to the input
 * shows an empty box over a row that plainly has a date in it.
 *
 * The two halves are here together on purpose. They were written apart the
 * first time and disagreed about the timezone: reading used UTC and writing
 * used local, so a date typed near midnight came back a day earlier, and only
 * for people west of Greenwich.
 */
export function isoToDateInput(value: any): string {
  const d = toDate(value);
  if (!d) return '';
  // Local parts, not toISOString(): a booking on the 17th typed in Delhi is on
  // the 17th, and UTC would show it as the 16th for half the day.
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function dateInputToIso(value: string): string {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!parts) return isoDate(text);
  // Built local, to match the reader above. new Date("2026-08-17") would be
  // parsed as UTC midnight and land on the 16th in half the world.
  const d = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
  return isNaN(d.getTime()) ? '' : d.toISOString();
}

/**
 * A cell as a VISITOR should read it.
 *
 * WHY THIS IS A SHARED FUNCTION AND NOT AN `if` IN A RENDERER
 * It was an `if` in a renderer, and that renderer is the published one -- the
 * half of this codebase that has drifted from the editor five times. A date
 * column arrived and the published table showed
 * `2026-08-17T00:00:00.000Z` to a visitor, because the only branch it knew
 * about was boolean. Sixth time.
 *
 * The switch is exhaustive over ColumnType on purpose: `Record<ColumnType, ...>`
 * elsewhere makes an omission a compile error, and here the `satisfies` on the
 * table below does the same job -- adding a seventh column type will not
 * compile until this function has an opinion about it.
 */
export function displayCell(value: any, type: string | undefined): string {
  if (type === 'boolean') return value ? 'Yes' : 'No';
  if (value === undefined || value === null || value === '') return '';
  if (type === 'date') {
    const d = toDate(value);
    // An unreadable date is shown as it was stored rather than as nothing: a
    // visitor seeing the raw text can at least report what is on the page.
    return d ? formatDate(d, 'D MMM YYYY') : String(value);
  }
  return String(value);
}

/**
 * Every column type, and what it is called in a dropdown.
 *
 * Written as a full Record so that adding a type is a compile error everywhere
 * that has to have an opinion about it, rather than a silent fall-through to
 * "treat it as text" -- which is exactly how a date column ended up rendering
 * as an ISO timestamp on a published page.
 */
export const COLUMN_TYPE_LABELS: Record<ColumnType, string> = {
  text: 'Text',
  number: 'Number',
  boolean: 'Boolean',
  date: 'Date',
};
