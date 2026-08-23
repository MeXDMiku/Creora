import jsep from 'jsep';
import { evaluateCondition } from './conditions';
// The same date reader the display filters use. Two ways of deciding what
// counts as a date would eventually disagree about a real page's data.
import { toDate } from './format';

/**
 * What a formula can say.
 *
 * WHAT IT COULD SAY BEFORE
 * `+ - * / %` and nothing else. Not a single function, no comparison, no
 * condition, and every value forced through `Number()` so text was impossible.
 *
 * The worse half was the silence. The old evaluator ended in `default: return 0`,
 * so `if(Stock > 0, "In stock", "Sold out")` -- a CallExpression -- returned **0**
 * with no error, and so did `Price > 100`. A builder writing the most ordinary
 * formula in any spreadsheet got a zero and no reason. Wrong answers that look
 * like answers are the expensive kind.
 *
 * WHAT IT SAYS NOW
 *   if(Stock > 0, "In stock", "Sold out")     a branch, returning text
 *   round(Subtotal * 0.18, 2)                 tax to two places
 *   if(Subtotal >= 500, 0, 50)                free delivery over 500
 *   clamp(Score, 0, 100)                      never off the end of the scale
 *   join(" ", First, Last)                    text out of two fields
 *   and(Agreed, not(isBlank(Email)))          several things at once
 *
 * TWO RULES IT IS BUILT ON
 *
 * 1. Comparisons are not implemented here. `>` `<` `>=` `<=` `==` `!=` all hand
 *    over to `evaluateCondition`, which is the same code a workflow condition
 *    and a visitor's search box already use. Writing them again would mean
 *    "equals" quietly meaning two things depending on where you typed it -- and
 *    it would lose the blank-is-not-zero rule that cost a cycle to find: an
 *    empty cell is missing data, so `Score < 9` is false for a Score nobody
 *    filled in, not true.
 *
 * 2. A formula that cannot be answered THROWS, with a sentence. Blocks already
 *    have an error channel and show `Error` when a formula fails, so the honest
 *    move is to use it. Unknown function, wrong number of arguments, a block
 *    that is not on the page -- all say so by name. The one deliberate
 *    exception is dividing by zero, which returns 0 exactly as it always has,
 *    because a half-typed formula should not shout while it is being typed.
 *
 * Arithmetic still coerces to number exactly as before, so every formula saved
 * before today produces the number it produced yesterday. There is a check that
 * says so.
 */

/** A formula answers with one of these. It was number-only before. */
export type FormulaValue = number | string | boolean;

/** Blank means "nobody filled this in", and is not zero. */
function isBlankValue(v: any): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

/** Arithmetic coercion: what the old evaluator did to every value it touched. */
function num(v: any): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (isBlankValue(v)) return 0;
  const n = Number(v);
  return isNaN(n) ? NaN : n;
}

function text(v: any): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

/** Truthiness, said the way a builder means it rather than the way JS means it. */
export function truthy(v: any): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (isBlankValue(v)) return false;
  const lowered = String(v).trim().toLowerCase();
  if (lowered === 'false' || lowered === 'no' || lowered === '0') return false;
  return true;
}

function need(name: string, args: any[], least: number, most = Infinity): void {
  if (args.length < least || args.length > most) {
    const wanted =
      most === Infinity
        ? `at least ${least}`
        : least === most
          ? `${least}`
          : `${least} to ${most}`;
    throw new Error(
      `${name}() needs ${wanted} ${least === 1 && most === 1 ? 'value' : 'values'}, and was given ${args.length}`,
    );
  }
}

/**
 * The function library.
 *
 * Deliberately small and combinable rather than long: `if`, a handful of number
 * functions and a handful of text ones cover what a page actually computes, and
 * every one of them composes with every other. Twenty more functions would add
 * twenty behaviours; these add the combinations.
 */
export const FORMULA_FUNCTIONS: Record<string, (args: any[]) => FormulaValue> = {
  // --- choosing ---
  if: a => {
    need('if', a, 2, 3);
    return truthy(a[0]) ? a[1] : a.length > 2 ? a[2] : '';
  },
  and: a => {
    need('and', a, 1);
    return a.every(truthy);
  },
  or: a => {
    need('or', a, 1);
    return a.some(truthy);
  },
  not: a => {
    need('not', a, 1, 1);
    return !truthy(a[0]);
  },
  isblank: a => {
    need('isBlank', a, 1, 1);
    return isBlankValue(a[0]);
  },

  // --- numbers ---
  min: a => {
    need('min', a, 1);
    return Math.min(...a.map(num));
  },
  max: a => {
    need('max', a, 1);
    return Math.max(...a.map(num));
  },
  sum: a => a.map(num).reduce((t, n) => t + n, 0),
  avg: a => {
    need('avg', a, 1);
    return a.map(num).reduce((t, n) => t + n, 0) / a.length;
  },
  abs: a => {
    need('abs', a, 1, 1);
    return Math.abs(num(a[0]));
  },
  floor: a => {
    need('floor', a, 1, 1);
    return Math.floor(num(a[0]));
  },
  ceil: a => {
    need('ceil', a, 1, 1);
    return Math.ceil(num(a[0]));
  },
  /**
   * Rounding is done on a shifted integer rather than with toFixed, because
   * toFixed hands back a string and a formula that returns "1.50" instead of
   * 1.5 stops being a number for everything downstream.
   */
  round: a => {
    need('round', a, 1, 2);
    const places = a.length > 1 ? Math.max(0, Math.floor(num(a[1]))) : 0;
    const factor = Math.pow(10, places);
    return Math.round((num(a[0]) + Number.EPSILON) * factor) / factor;
  },
  pow: a => {
    need('pow', a, 2, 2);
    return Math.pow(num(a[0]), num(a[1]));
  },
  sqrt: a => {
    need('sqrt', a, 1, 1);
    const n = num(a[0]);
    // Negative roots are not an error a builder can act on; they are a typo.
    return n < 0 ? 0 : Math.sqrt(n);
  },
  clamp: a => {
    need('clamp', a, 3, 3);
    const [v, lo, hi] = [num(a[0]), num(a[1]), num(a[2])];
    // Written so a swapped low and high still returns something inside them,
    // rather than the empty range Math.min(Math.max(...)) would give.
    return Math.min(Math.max(v, Math.min(lo, hi)), Math.max(lo, hi));
  },

  // --- text ---
  len: a => {
    need('len', a, 1, 1);
    return text(a[0]).length;
  },
  upper: a => {
    need('upper', a, 1, 1);
    return text(a[0]).toUpperCase();
  },
  lower: a => {
    need('lower', a, 1, 1);
    return text(a[0]).toLowerCase();
  },
  trim: a => {
    need('trim', a, 1, 1);
    return text(a[0]).trim();
  },
  join: a => {
    need('join', a, 1);
    // Blanks are skipped so `join(" ", First, Last)` with no surname does not
    // come out with a trailing space.
    return a
      .slice(1)
      .filter(v => !isBlankValue(v))
      .map(text)
      .join(text(a[0]));
  },
  concat: a => a.map(text).join(''),
  contains: a => {
    need('contains', a, 2, 2);
    return text(a[0]).toLowerCase().includes(text(a[1]).toLowerCase());
  },
  startswith: a => {
    need('startsWith', a, 2, 2);
    return text(a[0]).toLowerCase().startsWith(text(a[1]).toLowerCase());
  },
  endswith: a => {
    need('endsWith', a, 2, 2);
    return text(a[0]).toLowerCase().endsWith(text(a[1]).toLowerCase());
  },
  replace: a => {
    need('replace', a, 3, 3);
    return text(a[0]).split(text(a[1])).join(text(a[2]));
  },
  left: a => {
    need('left', a, 2, 2);
    return text(a[0]).slice(0, Math.max(0, Math.floor(num(a[1]))));
  },
  right: a => {
    need('right', a, 2, 2);
    const n = Math.max(0, Math.floor(num(a[1])));
    return n === 0 ? '' : text(a[0]).slice(-n);
  },

  // --- saying which kind of thing it is ---
  number: a => {
    need('number', a, 1, 1);
    const n = num(a[0]);
    return isNaN(n) ? 0 : n;
  },
  text: a => {
    need('text', a, 1, 1);
    return text(a[0]);
  },
};

/** The names as a builder types them, for help text and for the inspector. */
/**
 * Rows, by the name or the id of the block holding them.
 *
 * Both keys on purpose. A formula addresses a block by its id, because that is
 * what the editor inserts and what survives a rename -- but a person typing
 * `sumOf("Orders", "Total")` into a box will type the name they can see, and
 * being refused for it would be indefensible.
 */
export interface TableData {
  rows: Record<string, any>[];
  /**
   * The columns the table is declared to have.
   *
   * Carried alongside the rows because a MISSPELLED COLUMN is otherwise
   * indistinguishable from an empty one: `sumOf("Orders", "Totl")` adds up
   * nothing and answers 0, which is not an error, does not look like an error,
   * and sits on a dashboard being wrong. Rows alone cannot tell the two apart
   * when the table is empty, and cannot tell them apart at all if every row
   * happens to be missing that field.
   */
  columns: string[];
}

export type TableScope = Record<string, TableData>;

/**
 * How many table questions may be open at once.
 *
 * Two is what a real site needs -- "the author of the post this repost
 * repeats" is a lookup inside a lookup -- and each level runs once per row of
 * the level outside it, so three is rows cubed. The limit is a promise about
 * how slow a page can get, not a limit on what can be asked: the answer to a
 * deeper question belongs in a column.
 */
export const MAX_QUESTION_DEPTH = 2;

/**
 * The functions that read a whole table.
 *
 * WHY THESE EXIST
 * A Database block publishes ONE number. Its `outputMode` is a single setting,
 * so a page could show the order count OR the total revenue OR the average
 * order, and never two of them -- and a second Database block is not a second
 * view, it is a second table with its own rows. So "revenue, orders, and
 * average order value" -- the first three numbers anybody puts on a dashboard
 * -- was not expressible at all, however many blocks were added.
 *
 * WHY THE TABLE IS NAMED IN QUOTES
 * `countOf(Orders)` cannot work: by the time a function sees its argument the
 * name has already become the block's value, which is the single number this
 * exists to get past. The name has to arrive unevaluated, and a string literal
 * is the only way to say that in an expression language without adding syntax.
 *
 * WHY THE FILTER IS THE ROW-FORMULA SPELLING
 * `sumOf("Orders", "Total", '{{Status}} == "paid"')` uses exactly the language
 * a repeater's row filter uses, because it is the same question asked in the
 * same place. A second spelling for "this row counts" would be a second thing
 * to learn and a second thing to get subtly different.
 */
const TABLE_FUNCTIONS: Record<string, true> = {
  countOf: true, sumOf: true, avgOf: true, minOf: true, maxOf: true, joinOf: true,
};

export const TABLE_FUNCTION_NAMES = Object.keys(TABLE_FUNCTIONS);

/** The named table, or a refusal that says which name failed. */
function tableNamed(name: string, tables: TableScope | undefined): TableData {
  if (!tables) {
    throw new Error('Tables cannot be read from here — countOf and sumOf work in a formula or a condition, not in page markup');
  }
  const table = tables[name];
  if (!table) {
    // Ids are left out of the list on purpose: they are a real spelling, but
    // showing somebody `databaseBlock__1f3a...` when they mistyped "Orders" is
    // noise in the one sentence that has to be readable.
    const known = Object.keys(tables).filter(k => !k.includes('__'));
    throw new Error(
      known.length
        ? `There is no table called "${name}". Tables on this page: ${known.join(', ')}`
        : `There is no table called "${name}", and this page has no tables on it`,
    );
  }
  return table;
}

/**
 * Refuse a column the table does not have.
 *
 * THE FAILURE THIS PREVENTS
 * `sumOf("Orders", "Totl")` adds up nothing and answers **0**. That is not an
 * error, does not look like an error, and sits on a dashboard being wrong --
 * the worst failure this project has a name for. A total that refuses is
 * annoying for a minute; a total that is quietly wrong is trusted.
 *
 * WHEN IT DELIBERATELY SAYS NOTHING
 * A table with no declared columns and no rows cannot tell a typo from an empty
 * table, so it does not guess. Refusing there would break a page whose table
 * simply has not loaded yet, which is every page for its first half-second.
 */
function columnNamed(table: TableData, column: string): string {
  const declared = (table.columns || []).map(c => String(c));
  if (declared.length) {
    if (declared.includes(column) || column === 'Row id') return column;
    throw new Error(
      `There is no column called "${column}" in that table. Its columns are: ${declared.join(', ')}`,
    );
  }
  // No declared columns: fall back to what the rows actually carry, which is
  // still better than nothing once any row exists.
  if (table.rows.length) {
    const seen = new Set<string>();
    for (const row of table.rows) for (const key of Object.keys(row || {})) seen.add(key);
    if (seen.has(column) || column === 'Row id' || column === 'id') return column;
    throw new Error(
      `There is no column called "${column}" in that table. It has: ${Array.from(seen).filter(k => k !== 'id').join(', ')}`,
    );
  }
  // Empty and undeclared: nothing can be told apart, and a sum of nothing
  // being 0 is the honest answer rather than a guess.
  return column;
}

/**
 * The `{{Column}}` names a piece of text mentions, in the order they appear.
 *
 * One definition, because it had two: this file's and the row filter's in
 * rows.ts, identical and free to drift apart. Nine bugs in this project have
 * been one decision living in two places.
 */
export function slotNamesIn(text: string | undefined | null): string[] {
  const found: string[] = [];
  overSlots(String(text ?? ''), name => {
    if (name && !found.includes(name)) found.push(name);
    return null;
  });
  return found;
}

/**
 * Turn `{{Column}}` slots into names the expression engine can resolve, and
 * hand back the scope holding their values.
 *
 * WHY SLOTS ARE REWRITTEN RATHER THAN LOOKED UP
 * It is what keeps two scopes apart. `{{Status}}` is the row being TESTED and a
 * bare `Status` is whatever asked the question, and if the slot were simply
 * another name in the same bag, one would shadow the other and a card could
 * never ask a table about a column both of them have.
 *
 * WHY THE INVENTED NAME IS NOT A CONSTANT
 * Because then the scopes collide the other way round. It used to be `__w0`:
 *
 *     countOf("T", '{{Status}} == __w0')      // and the caller has an __w0
 *
 * The slot's value overwrote the caller's, the condition became
 * `Status == Status`, every row matched, and the answer came back as a NUMBER
 * -- a wrong answer wearing the clothes of a right one, which is the failure
 * this project keeps finding. So the prefix grows until the text is not using
 * it. In practice that is the first branch every time; the loop is there so it
 * is a guarantee rather than a bet on what people name things.
 */
export function bindSlots(
  text: string,
  valueOf: (name: string) => any,
  outer?: Record<string, any>,
): { expression: string; scope: Record<string, any> } {
  const scope: Record<string, any> = { ...(outer || {}) };
  let prefix = '__slot';
  while (text.includes(prefix)) prefix = '_' + prefix;
  let index = 0;
  const expression = overSlots(text, name => {
    const key = `${prefix}${index++}`;
    scope[key] = valueOf(name);
    return key;
  });
  return { expression, scope };
}

/**
 * Walk the `{{Column}}` slots in an expression, SKIPPING ANYTHING IN QUOTES.
 *
 * WHY THE QUOTES MATTER, AND WHAT BROKE WITHOUT THEM
 * A table function's condition is a string, and it has slots of its own that
 * mean a row in the OTHER table:
 *
 *     {{Capacity}} - countOf("Bookings", '{{ClassId}} == RowId') > 0
 *
 * `{{Capacity}}` is this class. `{{ClassId}}` is a booking, and belongs to the
 * countOf that has not been called yet. A blind scan rewrote both, so the
 * condition arrived as `__slot1 == RowId` holding a class's non-existent
 * ClassId -- the filter compared nothing to something and quietly kept every
 * row. The whole of "hide the full ones" failed that way, with no error.
 *
 * A slot inside quotes is therefore left exactly as written, for the inner call
 * to deal with when its turn comes. Backslash escapes are honoured, so a
 * condition containing an apostrophe does not swallow the rest of the line.
 *
 * `replace` returns the text to substitute, or null to leave the slot alone --
 * which is how the same walk serves both "rename these" and "list these".
 */
function overSlots(text: string, replace: (name: string) => string | null): string {
  let out = '';
  let i = 0;
  let quote: string | null = null;
  while (i < text.length) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\' && i + 1 < text.length) { out += ch + text[i + 1]; i += 2; continue; }
      if (ch === quote) quote = null;
      out += ch;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; out += ch; i++; continue; }
    if (ch === '{' && text[i + 1] === '{') {
      const match = /^\{\{\s*([^}|]+?)\s*\}\}/.exec(text.slice(i));
      if (match) {
        const replaced = replace(match[1].trim());
        out += replaced === null ? match[0] : replaced;
        i += match[0].length;
        continue;
      }
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * Keep the rows a filter says to keep.
 *
 * A filter that cannot be worked out THROWS here, unlike the repeater's, and
 * the difference is deliberate: a repeater showing too many rows is visibly
 * wrong and leads somebody to the filter, but a TOTAL that is quietly too big
 * looks like a number. There is nothing to notice, so it has to refuse.
 */
function rowsWhere(
  rows: Record<string, any>[],
  where: string | null,
  options?: EvaluateOptions,
  outer?: Record<string, any>,
  tables?: TableScope,
  depth = 0,
): Record<string, any>[] {
  if (!where || !where.trim()) return rows;
  /**
   * HOW DEEP A QUESTION MAY GO, and why there is a limit at all.
   *
   * A condition can now ask about another table, which is what makes two hops
   * sayable -- "the author of the post this repost repeats":
   *
   *     joinOf("Users", "Name",
   *       '{{Row id}} == joinOf("Posts", "AuthorId", "{{Row id}} == RepostOfId")')
   *
   * The inner question runs once per row of the outer one, so two levels is
   * rows x rows and three is rows cubed. Nothing recurses for ever -- the depth
   * is fixed by the text somebody typed -- but a page that takes nine seconds
   * to draw is broken in the way that matters, and it would be blamed on the
   * data rather than on the sentence. So it stops, and says which sentence.
   */
  // `depth` counts the questions already open around this one, so the first
  // level arrives as 0 and MAX_QUESTION_DEPTH is a count of LEVELS, not of
  // nestings. Written as >= for that reason, and there is a check that asks for
  // exactly one level too many.
  if (depth >= MAX_QUESTION_DEPTH) {
    throw new Error(
      `A question inside a question inside a question — ${MAX_QUESTION_DEPTH + 1} levels deep. ` +
      'Each level runs once per row of the one outside it, so this would be slow enough to look broken. ' +
      'Store the answer in a column instead.',
    );
  }
  return rows.filter(row => {
    /**
     * TWO SCOPES, AND WHICH ONE A NAME MEANS IS DECIDED BY HOW IT IS SPELLED.
     *
     * `{{Column}}` is the row being TESTED -- a booking, a review -- and that
     * has always been true. A bare name falls through to whatever asked the
     * question: the class card doing the asking, the page around it.
     *
     * WHY THIS IS THE WHOLE POINT
     * Without the second scope, a condition can compare the tested row against
     * a constant and nothing else. So "how many bookings does THIS class have"
     * was not sayable -- the class was outside the string:
     *
     *     countOf("Bookings", '{{ClassId}} == ???')
     *
     * With it, `RowId` in that condition is the class card's own id, and the
     * same sentence does lookups too:
     *
     *     joinOf("Instructors", "Name", '{{Row id}} == InstructorId')
     *
     * That is a relation between two tables, built entirely out of parts that
     * already existed. Six separate things a real site needs turned out to be
     * this one sentence -- see docs/BUILT_ONE_TO_FIND_OUT.md.
     *
     * THE TWO CANNOT COLLIDE, which is stronger than one winning. See
     * bindSlots: a slot never becomes a name the caller could also have used,
     * so a card with its own `Status` column can still ask a table about ITS
     * `Status` and get the right answer.
     */
    const bound = bindSlots(where, name => (name === 'Row id' ? row?.id : row?.[name]), outer);
    /**
     * THE TABLES GO IN TOO, which they did not before.
     *
     * They were withheld and the refusal read "Tables cannot be read from here
     * — countOf and sumOf work in a formula or a condition, not in page
     * markup", which was doubly wrong: this IS a condition, and the sentence
     * blamed the wrong place. What it actually blocked was every question that
     * needs two hops, which on a site with users and posts is most of them.
     *
     * The clock goes in for the same reason it always did, so
     * countOf("Bookings", '{{Due}} > today') means what it reads as.
     */
    return truthy(evaluateExpression(bound.expression, bound.scope, tables, {
      ...(options || {}),
      depth: depth + 1,
    }));
  });
}

/**
 * One cell.
 *
 * `Row id` is spelled the same here as it is in a repeater's slots and in a row
 * filter, because it is the same idea and a third spelling would be a third
 * thing to get wrong. Without this it was ACCEPTED as a column name and then
 * resolved to nothing, which is the exact silent-blank shape the column check
 * above exists to stop -- introduced by the check itself.
 */
const cellOf = (row: Record<string, any>, column: string): any =>
  column === 'Row id' ? row?.id : row?.[column];

/**
 * The numbers in a column, or a refusal naming the value that is not one.
 *
 * THE FAILURE THIS PREVENTS, WHICH IS THE WORST ONE HERE
 * `num` answers NaN for a value it cannot read, NaN poisons a sum, and
 * evaluateExpression turns a NaN result into **0**. So ONE mistyped cell --
 * "12o" for "120", or "£200" typed into a text column -- made an entire
 * revenue total read zero. Not an error, not a gap, a confident 0 on a
 * dashboard, from one character.
 *
 * WHY IT REFUSES RATHER THAN SKIPPING
 * Skipping the bad cell gives a total that is £120 short and looks completely
 * plausible, so nobody ever finds it. Refusing is loud, and the message names
 * the offending value, which is the one thing that makes it fixable in seconds.
 *
 * Blanks are still skipped, not refused: an empty cell is a row that has not
 * been filled in, which is ordinary, while a cell holding "twelve" is a
 * mistake.
 */
function numbersIn(rows: Record<string, any>[], column: string): number[] {
  const out: number[] = [];
  for (const row of rows) {
    const value = cellOf(row, column);
    if (value === null || value === undefined || value === '') continue;
    const n = num(value);
    if (isNaN(n)) {
      const shown = String(value);
      throw new Error(
        `"${column}" holds ${shown.length > 30 ? shown.slice(0, 30) + '…' : shown}, which is not a number, so it cannot be added up`,
      );
    }
    out.push(n);
  }
  return out;
}

/**
 * Run one of them.
 *
 * The arguments are inspected before they are worked out, because the first one
 * is a NAME and the third is a filter to run once per row -- evaluating either
 * as an ordinary value would destroy it.
 */
function callTableFunction(
  name: string,
  args: any[],
  walk: (node: any) => any,
  tables: TableScope | undefined,
  options?: EvaluateOptions,
  /** What the formula asking this question can see. See rowsWhere. */
  outer?: Record<string, any>,
): FormulaValue {
  // A literal string, taken as written. Anything else is worked out first, so
  // a formula can build a table name if it really wants to.
  const asName = (node: any, which: string): string => {
    if (!node) throw new Error(`${name} needs ${which}`);
    if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
    /**
     * Anything else is worked out, so a formula CAN build a name if it really
     * wants to -- but a bare `countOf(Orders)` is the overwhelmingly likely
     * case, and it fails inside walk() with "Referenced block Orders does not
     * exist", which sends somebody looking for a block that is sitting right
     * there. The missing thing is the quotes, so that is what gets said.
     */
    let value: any;
    try {
      value = walk(node);
    } catch {
      throw new Error(`${name} needs ${which} in quotes — ${name}("Orders") rather than ${name}(Orders)`);
    }
    if (typeof value === 'string' && value) return value;
    throw new Error(`${name} needs ${which} in quotes — ${name}("Orders") rather than ${name}(Orders)`);
  };
  // The filter is NOT worked out here: it is a formula about a row, and there
  // is no row yet. Its text is what gets passed on.
  const asWhere = (node: any): string | null => {
    if (!node) return null;
    if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
    throw new Error(`${name}'s condition has to be in quotes, like '{{Status}} == "paid"'`);
  };

  const table = tableNamed(asName(args[0], 'a table name'), tables);

  if (name === 'countOf') {
    if (args.length > 2) throw new Error('countOf takes a table and, if you want, a condition');
    return rowsWhere(table.rows, asWhere(args[1]), options, outer, tables, options?.depth ?? 0).length;
  }

  const column = columnNamed(table, asName(args[1], 'a column name'));
  const kept = rowsWhere(table.rows, asWhere(args[2]), options, outer, tables, options?.depth ?? 0);

  switch (name) {
    case 'sumOf':
      return numbersIn(kept, column).reduce((a, b) => a + b, 0);
    case 'avgOf': {
      const ns = numbersIn(kept, column);
      // Two decimals, matching the Database block's own average -- an average
      // of 21.333333333 in a Number Display is noise, and two answers to the
      // same question that disagree in the sixth decimal is worse than noise.
      return ns.length ? Math.round((ns.reduce((a, b) => a + b, 0) / ns.length) * 100) / 100 : 0;
    }
    case 'minOf': {
      const ns = numbersIn(kept, column);
      // Empty gives 0 rather than Infinity. Infinity is arithmetically right
      // and useless on a page.
      return ns.length ? Math.min(...ns) : 0;
    }
    case 'maxOf': {
      const ns = numbersIn(kept, column);
      return ns.length ? Math.max(...ns) : 0;
    }
    case 'joinOf':
      return kept
        .map(r => cellOf(r, column))
        .filter(v => v !== null && v !== undefined && String(v) !== '')
        .join(', ');
    default:
      throw new Error(`There is no function called "${name}"`);
  }
}

/**
 * Dates, as arithmetic rather than as formatting.
 *
 * WHY THESE ARE MISSING UNTIL NOW, AND WHY IT MATTERS
 * A date could be SHOWN (`{{Due | date: D MMM}}`) and shifted for showing
 * (`{{Due | plus: 7 days}}`), and that was the whole of it. Nothing could ask a
 * QUESTION about one. "Three days left", "overdue", "bookings this month",
 * "only if the date has not passed" — every one of them was unsayable, on a
 * product whose two worked examples are a booking form and a task list.
 *
 * WHY dateAdd RETURNS TEXT AND NOT A DATE
 * A formula's answer lands in a block's value, gets compared, gets saved, and
 * gets put through display filters. A Date object survives none of that
 * reliably, and widening the language's value type to carry one would touch
 * every comparison in it. An ISO string survives all of it: `toDate` reads it
 * back, `| date:` formats it, `isBefore` parses it, and a builder who displays
 * it raw sees something unambiguous rather than a locale accident.
 *
 * WHOLE DAYS, NOT FRACTIONS
 * daysBetween works from midnight to midnight, so "how many days until the
 * 20th" gives the same answer at 9am and at 5pm. Counting in 24-hour
 * increments from `now` would give 3 in the morning and 2 in the afternoon,
 * and somebody would file that as a bug — correctly.
 */
function startOfDay(d: Date): Date {
  const copy = new Date(d.getTime());
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Read a date the way the display filters read one, so both agree. */
function asDate(value: any, fn: string): Date {
  const d = toDate(value);
  if (!d) {
    const shown = String(value ?? '');
    throw new Error(
      shown.trim() === ''
        ? `${fn} needs a date, and that one is empty`
        : `${fn} could not read "${shown.length > 30 ? shown.slice(0, 30) + '…' : shown}" as a date`,
    );
  }
  return d;
}

const DAY_MS = 86400000;

const DATE_FUNCTIONS: Record<string, (args: any[], now: Date) => FormulaValue> = {
  /** Whole days from a to b. Negative when b is earlier. */
  daysBetween: (args, _now) => {
    need('daysBetween', args, 2, 2);
    const a = startOfDay(asDate(args[0], 'daysBetween'));
    const b = startOfDay(asDate(args[1], 'daysBetween'));
    return Math.round((b.getTime() - a.getTime()) / DAY_MS);
  },
  /** Days from today. Negative once it has passed, which is what "overdue" is. */
  daysUntil: (args, now) => {
    need('daysUntil', args, 1, 1);
    const target = startOfDay(asDate(args[0], 'daysUntil'));
    return Math.round((target.getTime() - startOfDay(now).getTime()) / DAY_MS);
  },
  /** Whole days since. The same number the other way round, spelled the way people say it. */
  daysSince: (args, now) => {
    need('daysSince', args, 1, 1);
    const past = startOfDay(asDate(args[0], 'daysSince'));
    return Math.round((startOfDay(now).getTime() - past.getTime()) / DAY_MS);
  },
  /** Shift a date. Text out, so it survives being stored, compared and formatted. */
  dateAdd: (args, _now) => {
    need('dateAdd', args, 2, 2);
    const d = asDate(args[0], 'dateAdd');
    const days = num(args[1]);
    if (isNaN(days)) throw new Error('dateAdd needs a number of days');
    return new Date(d.getTime() + days * DAY_MS).toISOString();
  },
  isBefore: (args, _now) => {
    need('isBefore', args, 2, 2);
    return asDate(args[0], 'isBefore').getTime() < asDate(args[1], 'isBefore').getTime();
  },
  isAfter: (args, _now) => {
    need('isAfter', args, 2, 2);
    return asDate(args[0], 'isAfter').getTime() > asDate(args[1], 'isAfter').getTime();
  },
  /** Same calendar day, whatever the time on either. */
  isSameDay: (args, _now) => {
    need('isSameDay', args, 2, 2);
    return startOfDay(asDate(args[0], 'isSameDay')).getTime()
      === startOfDay(asDate(args[1], 'isSameDay')).getTime();
  },
  year: (args, _now) => { need('year', args, 1, 1); return asDate(args[0], 'year').getFullYear(); },
  /** 1-12. Not 0-11: a formula is read by a person, not by JavaScript. */
  month: (args, _now) => { need('month', args, 1, 1); return asDate(args[0], 'month').getMonth() + 1; },
  day: (args, _now) => { need('day', args, 1, 1); return asDate(args[0], 'day').getDate(); },
  /** Monday is 1 and Sunday is 7, which is how a week is spoken about. */
  weekday: (args, _now) => {
    need('weekday', args, 1, 1);
    const js = asDate(args[0], 'weekday').getDay();
    return js === 0 ? 7 : js;
  },
};

export const DATE_FUNCTION_NAMES = Object.keys(DATE_FUNCTIONS);

export const FORMULA_FUNCTION_NAMES = [
  'if', 'and', 'or', 'not', 'isBlank',
  'min', 'max', 'sum', 'avg', 'abs', 'floor', 'ceil', 'round', 'pow', 'sqrt', 'clamp',
  'len', 'upper', 'lower', 'trim', 'join', 'concat',
  'contains', 'startsWith', 'endsWith', 'replace', 'left', 'right',
  'number', 'text',
] as const;

/** Every comparison hands over to the one vocabulary. See rule 1 above. */
const COMPARISONS: Record<string, string> = {
  '>': 'greaterThan',
  '<': 'lessThan',
  '>=': 'greaterOrEqual',
  '<=': 'lessOrEqual',
  '==': 'equals',
  '===': 'equals',
  '!=': 'notEquals',
  '!==': 'notEquals',
};

/**
 * `and` and `or` as words, not just as functions.
 *
 * `and(A, B)` and `A && B` both worked; `A and B` did not, and that is what a
 * person who has never written code actually types -- it was written that way
 * in the first draft of a check, by someone who had just built the language.
 * jsep is told about them once, at module load, and they sit at the same
 * precedence as their symbol forms so the two spellings cannot disagree.
 *
 * `not` stays a function: `not X` reads fine in English but binds ambiguously
 * next to a comparison, and `not(X)` is unmistakable.
 */
jsep.addBinaryOp('and', 2);
jsep.addBinaryOp('or', 1);

export interface EvaluateOptions {
  /**
   * The clock. Passed in for the same reason format.ts takes one: `today` and
   * `daysUntil` are the two things in this language whose answer changes on its
   * own, and a check that cannot pin them cannot check them.
   */
  now?: Date;
  /**
   * How many table questions are already open around this one.
   *
   * Carried rather than counted, because the nesting happens through a string:
   * a condition is text until the moment it is run, so there is no call stack
   * to look at. See MAX_QUESTION_DEPTH and rowsWhere.
   */
  depth?: number;
}

/**
 * A BLOCK THAT FETCHES HAS THREE ANSWERS, NOT ONE.
 *
 * Everything in this language assumes a block HAS A VALUE. A thing that comes
 * from a store has three states and only one of them is a value: it is on its
 * way, it failed, or it answered. Every one of the seven sites built to test
 * this engine wrapped every read in a loading state and an error state, and a
 * builder could wire neither -- so a page made here is wrong the moment the
 * network is slow, and looks broken rather than busy.
 *
 * Half of it already existed and was unreachable: BlockRuntimeState has carried
 * `loading` and `error` all along. What was missing is that the language could
 * not SEE them.
 *
 *     Orders.loading     on its way
 *     Orders.failed      the last read failed
 *     Orders.error       what it said, for showing
 *     Orders.empty       it answered, and there was nothing
 *     Orders.count       how many rows came back
 */
export const FACET_NAMES = ['loading', 'failed', 'error', 'empty', 'count'] as const;

export function facetsOf(state: any): Record<string, any> {
  const loading = !!state?.loading;
  const failed = !!state?.error;
  const rows = Array.isArray(state?.rows) ? state.rows : null;
  return {
    loading,
    failed,
    error: state?.error ?? '',
    count: rows ? rows.length : 0,
    /**
     * EMPTY IS FALSE WHILE IT IS STILL LOADING, and false after a failure.
     *
     * "Nothing came back" and "nothing has come back YET" are different
     * sentences and a page has to be able to say the second one. Conflating
     * them is how a page flashes "no orders yet" at everybody who visits it
     * half a second before showing five.
     *
     * False after a failure for a different reason: "there are no orders" is a
     * claim about the data, and a read that failed is not evidence for it.
     */
    empty: !loading && !failed && !!rows && rows.length === 0,
  };
}

/** Put one block's facets into a scope under a key, as dotted names. */
export function addFacets(scope: Record<string, any>, key: string, state: any): Record<string, any> {
  const f = facetsOf(state);
  for (const name of FACET_NAMES) scope[`${key}.${name}`] = f[name];
  return scope;
}

const FACET_NAME_RE = /^[A-Za-z_$][A-Za-z0-9_$]*/;

/**
 * Turn `Orders.loading` into a name, before anything is parsed.
 *
 * WHY A REWRITE AND NOT A BRANCH IN THE EVALUATOR
 * jsep does parse it as a MemberExpression -- but that is the wrong reading.
 * There is no object called Orders with a property on it; there is a block, and
 * one of five things you can ask about it. Saying so as a rewrite means the
 * evaluator is not touched at all, so nothing that works today can break, and
 * conditions and row filters get it for free because they all end up here.
 *
 * The same shape as bindSlots, including the prefix that grows until the text
 * is not using it -- that collision was found the hard way once already.
 *
 * `1.5` is safe without special-casing, because the name before the dot has to
 * start with a letter. Anything inside quotes is left alone, because a table
 * function's condition lives in a string and its names belong to the inner
 * call.
 */
export function rewriteFacets(
  text: string,
  scope: Record<string, any>,
): { expression: string; scope: Record<string, any>; error: string | null } {
  const src = String(text ?? '');
  if (!src.includes('.')) return { expression: src, scope, error: null };
  let prefix = '__facet';
  while (src.includes(prefix)) prefix = '_' + prefix;

  const out: string[] = [];
  const extra: Record<string, any> = {};
  let index = 0;
  let i = 0;
  let quote: string | null = null;
  let error: string | null = null;

  while (i < src.length) {
    const ch = src[i];
    if (quote) {
      if (ch === '\\' && i + 1 < src.length) { out.push(ch, src[i + 1]); i += 2; continue; }
      if (ch === quote) quote = null;
      out.push(ch);
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; out.push(ch); i++; continue; }

    const head = FACET_NAME_RE.exec(src.slice(i));
    if (!head) { out.push(ch); i++; continue; }
    const objectName = head[0];
    const afterName = i + objectName.length;
    let k = afterName;
    while (src[k] === ' ') k++;
    if (src[k] !== '.') { out.push(objectName); i = afterName; continue; }
    let m = k + 1;
    while (src[m] === ' ') m++;
    const tail = FACET_NAME_RE.exec(src.slice(m));
    if (!tail) { out.push(objectName); i = afterName; continue; }
    const propertyName = tail[0];
    const dotted = `${objectName}.${propertyName}`;
    const end = m + propertyName.length;

    if (dotted in scope) {
      const key = `${prefix}${index++}`;
      extra[key] = scope[dotted];
      out.push(key);
      i = end;
      continue;
    }
    /**
     * A NAME THAT IS A BLOCK BUT NOT A FACET HAS TO SAY WHICH FACETS EXIST, or
     * somebody tries `.rows`, then `.length`, then `.data`, and concludes the
     * feature does not work.
     */
    if (!error) {
      error = objectName in scope
        ? `"${objectName}" has no ${propertyName}. It has: ${FACET_NAMES.join(', ')}.`
        : `There is no block called "${objectName}".`;
    }
    out.push(objectName);
    i = afterName;
  }

  return { expression: out.join(''), scope: { ...scope, ...extra }, error };
}

export function evaluateExpression(
  formula: string,
  scope: Record<string, any>,
  tables?: TableScope,
  options?: EvaluateOptions,
): FormulaValue {
  if (!formula || formula.trim() === '') return 0;

  /**
   * `Orders.loading` becomes a name before anything is parsed. See
   * rewriteFacets: a dotted name is one name with a dot in it, not a member
   * access, and saying so here keeps the evaluator below untouched.
   */
  const bound = rewriteFacets(formula, scope);
  if (bound.error) throw new Error(bound.error);
  formula = bound.expression;
  scope = bound.scope;

  let ast: any;
  try {
    ast = jsep(formula);
  } catch {
    throw new Error('That formula could not be read. Check the brackets and quotes.');
  }

  // Read once per evaluation, not once per mention: two `today`s in one formula
  // that straddled midnight would otherwise disagree with each other.
  const fixed = options?.now;
  let sampled: Date | null = null;
  const clock = (): Date => {
    if (fixed) return fixed;
    if (!sampled) sampled = new Date();
    return sampled;
  };

  const walk = (node: any): any => {
    switch (node.type) {
      // Raw, not Number(). This is what makes text possible at all -- the old
      // evaluator put every literal through Number(), so "paid" was NaN.
      case 'Literal':
        return node.value;

      case 'Identifier': {
        const name = node.name;
        // `true`, `false` and `blank` read as words rather than as blocks.
        const lowered = name.toLowerCase();
        if (lowered === 'true') return true;
        if (lowered === 'false') return false;
        if (lowered === 'blank' || lowered === 'empty') return '';
        if (name in scope) return scope[name];
        /**
         * The clock, AFTER the scope, so anything on the page called `today`
         * still wins -- the same precedence markup already documents for its
         * built-in slots. Without these two words `daysUntil(Due)` would have
         * nothing to count from: a formula's scope is keyed by block id, so
         * there is no `today` in it and never was.
         */
        if (lowered === 'today') return startOfDay(clock());
        if (lowered === 'now') return clock();
        throw new Error(`Referenced block "${name}" does not exist`);
      }

      case 'UnaryExpression': {
        const arg = walk(node.argument);
        if (node.operator === '-') return -num(arg);
        if (node.operator === '+') return num(arg);
        if (node.operator === '!') return !truthy(arg);
        throw new Error(`"${node.operator}" is not something a formula can do`);
      }

      case 'BinaryExpression': {
        const op = node.operator;

        /**
         * jsep reports `&&` and `||` as BinaryExpression, not LogicalExpression,
         * so they have to be caught here -- and before both sides are worked
         * out, so they short-circuit the way anyone writing them expects.
         * The LogicalExpression case below is kept anyway: jsep has reported
         * them that way in other versions, and a silent behaviour change on a
         * dependency bump is not worth saving four lines.
         */
        if (op === '&&' || op === 'and') return truthy(walk(node.left)) && truthy(walk(node.right));
        if (op === '||' || op === 'or') return truthy(walk(node.left)) || truthy(walk(node.right));

        const left = walk(node.left);
        const right = walk(node.right);

        const asCondition = COMPARISONS[op];
        if (asCondition) return evaluateCondition(left, asCondition, right);

        switch (op) {
          case '+': return num(left) + num(right);
          case '-': return num(left) - num(right);
          case '*': return num(left) * num(right);
          // Kept from the original on purpose: a formula being typed should not
          // shout the moment the divisor is momentarily empty.
          case '/': return num(right) !== 0 ? num(left) / num(right) : 0;
          case '%': return num(right) !== 0 ? num(left) % num(right) : 0;
          default:
            throw new Error(`"${op}" is not something a formula can do`);
        }
      }

      case 'LogicalExpression': {
        const op = node.operator;
        if (op === '&&' || op === 'and') return truthy(walk(node.left)) && truthy(walk(node.right));
        if (op === '||' || op === 'or') return truthy(walk(node.left)) || truthy(walk(node.right));
        throw new Error(`"${op}" is not something a formula can do`);
      }

      case 'ConditionalExpression':
        return truthy(walk(node.test)) ? walk(node.consequent) : walk(node.alternate);

      case 'CallExpression': {
        /**
         * A function OVER A TABLE, before the ordinary ones.
         *
         * These are handled here rather than in FORMULA_FUNCTIONS because they
         * need two things an ordinary function never gets: the table's rows,
         * and the ARGUMENT AS WRITTEN. `countOf("Orders")` cannot take the
         * value of Orders -- that is the single number the block already
         * publishes, which is exactly the limitation this exists to lift.
         */
        const called = node.callee?.name;
        if (typeof called === 'string' && called in TABLE_FUNCTIONS) {
          return callTableFunction(called, node.arguments || [], walk, tables, { now: clock(), depth: options?.depth ?? 0 }, scope);
        }
        if (typeof called === 'string' && called in DATE_FUNCTIONS) {
          return DATE_FUNCTIONS[called](node.arguments.map(walk), clock());
        }

        if (node.callee?.type !== 'Identifier') {
          throw new Error('Only the built-in functions can be called in a formula');
        }
        const typed = node.callee.name;
        const fn = FORMULA_FUNCTIONS[typed.toLowerCase()];
        if (!fn) {
          throw new Error(
            `There is no function called "${typed}". Available: ${[...FORMULA_FUNCTION_NAMES, ...TABLE_FUNCTION_NAMES, ...DATE_FUNCTION_NAMES].join(', ')}`,
          );
        }
        // `if` is not lazy. Both branches are worked out before one is chosen,
        // which is fine because nothing here has an effect -- but it does mean
        // if(isBlank(X), 0, 10 / X) still evaluates the division, and division
        // by zero is 0 rather than an error, so it stays harmless.
        return fn(node.arguments.map(walk));
      }

      case 'ArrayExpression':
        return node.elements.map(walk);

      /**
       * A DOT THAT SURVIVED THE REWRITE IS ONE NOBODY CAN ANSWER.
       *
       * rewriteFacets turns `Orders.loading` into a name before this runs, and
       * refuses anything it does not recognise with a message naming the five
       * facets. So a MemberExpression reaching here is something neither -- a
       * dot on a number, a dot on a string, a dot on a function call -- and the
       * message says the only thing a dot is for.
       */
      case 'MemberExpression':
        throw new Error(
          'A dot only works after a block: Orders.loading, Orders.failed, Orders.error, Orders.empty, Orders.count',
        );

      case 'Compound':
        throw new Error('One formula at a time -- remove the comma or semicolon');

      default:
        throw new Error('That formula could not be read');
    }
  };

  const result = walk(ast);
  if (typeof result === 'number') return isNaN(result) ? 0 : result;
  if (typeof result === 'boolean' || typeof result === 'string') return result;
  if (Array.isArray(result)) return result.join(', ');
  return 0;
}

/**
 * The names a formula reads a value from.
 *
 * WHY THIS EXISTS (and why it is a real parse, not a regular expression)
 * Something has to FETCH those values before the formula can be worked out.
 * A computed slot -- `{{calc: Price * Qty}}` -- is filled by a layer that
 * resolves slot names to values ahead of time, and it can only fetch what it
 * has been told about. Without this the layer asks for a block called
 * "calc: Price * Qty", gets nothing, and every computed slot on a page renders
 * empty while looking completely reasonable in the editor.
 *
 * It walks the parsed formula rather than matching text because the difference
 * is not academic:
 *
 *   round(Total)    -- `round` is a function, not a value to go looking for
 *   "Total is high" -- inside quotes; a name in prose is prose
 *   true, and, or   -- words the language itself owns
 *
 * The Health panel learned each of those three the hard way with a regular
 * expression, and reported five imaginary missing blocks for every formula
 * until it did. Doing it from the syntax tree means it cannot be wrong about
 * which is which.
 *
 * An unreadable formula yields no names rather than throwing. The caller is
 * fetching values, not judging the formula; whoever evaluates it will produce
 * the real error, and there is exactly one place that should.
 */
export function identifiersIn(formula: string | undefined | null): string[] {
  const text = String(formula ?? '').trim();
  if (!text) return [];

  let ast: any;
  try {
    ast = jsep(text);
  } catch {
    return [];
  }

  const found: string[] = [];
  /**
   * THE DOTTED NAMES, FOUND BEFORE THE WALK.
   *
   * `Orders.loading` parses as a MemberExpression, which the walk below does
   * not visit -- so a facet used only in markup would never be fetched and
   * would render blank. The same bug the condition scanning had, in a new
   * place. Quoted text is skipped for the same reason it is in rewriteFacets.
   */
  const dotted: string[] = [];
  {
    let i = 0;
    let quote: string | null = null;
    while (i < text.length) {
      const ch = text[i];
      if (quote) {
        if (ch === '\\' && i + 1 < text.length) { i += 2; continue; }
        if (ch === quote) quote = null;
        i++;
        continue;
      }
      if (ch === '"' || ch === "'") { quote = ch; i++; continue; }
      const head = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(text.slice(i));
      if (!head) { i++; continue; }
      const rest = text.slice(i + head[0].length);
      const tail = /^\s*\.\s*([A-Za-z_$][A-Za-z0-9_$]*)/.exec(rest);
      if (tail) {
        dotted.push(`${head[0]}.${tail[1]}`);
        i += head[0].length + tail[0].length;
        continue;
      }
      i += head[0].length;
    }
  }
  const add = (name: string) => {
    const lowered = name.toLowerCase();
    // The words the language answers itself. Kept in step with the Identifier
    // case in evaluateExpression above -- these never reach a scope lookup.
    if (lowered === 'true' || lowered === 'false' || lowered === 'blank' || lowered === 'empty') return;
    if (!found.includes(name)) found.push(name);
  };

  const walk = (node: any): void => {
    if (!node || typeof node !== 'object') return;
    switch (node.type) {
      case 'Identifier':
        add(node.name);
        return;
      case 'CallExpression': {
        // The callee is the function's name, not a value. Only arguments hold
        // things to fetch.
        (node.arguments || []).forEach(walk);

        /**
         * A TABLE FUNCTION'S CONDITION IS AN EXPRESSION WEARING A STRING'S
         * CLOTHES, and the names in it have to be fetched like any others.
         *
         *     countOf("Bookings", '{{ClassId}} == RowId')
         *
         * `RowId` is a real reference to the calling row, and to jsep it is
         * three characters inside a literal. A repeater hides this -- its rows
         * supply every column whether anybody asked or not -- so it works there
         * and fails in a Custom HTML block, which fetches exactly what it is
         * told to fetch and nothing else. Same shape as the bug where a calc
         * slot asked for a block called "calc: Total * 2".
         *
         * Only the CONDITION argument is read this way. The table name and the
         * column name are also strings and are emphatically not expressions --
         * parsing "Orders" would report a block called Orders that nobody
         * mentioned.
         */
        const fn = node.callee?.name;
        if (typeof fn === 'string' && fn in TABLE_FUNCTIONS) {
          const conditionAt = fn === 'countOf' ? 1 : 2;
          const arg = (node.arguments || [])[conditionAt];
          if (arg && arg.type === 'Literal' && typeof arg.value === 'string') {
            // The {{...}} slots belong to the table being asked about, not to
            // whoever is asking, so they are removed before the rest is read.
            const bare = arg.value.replace(/\{\{[^}]*\}\}/g, ' 0 ');
            for (const name of identifiersIn(bare)) add(name);
          }
        }
        return;
      }
      case 'UnaryExpression':
        walk(node.argument);
        return;
      case 'BinaryExpression':
      case 'LogicalExpression':
        walk(node.left);
        walk(node.right);
        return;
      case 'ConditionalExpression':
        walk(node.test);
        walk(node.consequent);
        walk(node.alternate);
        return;
      case 'ArrayExpression':
        (node.elements || []).forEach(walk);
        return;
      case 'Compound':
        (node.body || []).forEach(walk);
        return;
      default:
        // Literal, MemberExpression and anything a future jsep adds: nothing
        // to fetch, and evaluateExpression is the one that objects.
        return;
    }
  };

  walk(ast);
  // The dotted ones the walk cannot see, added after it so an ordinary name
  // still comes first in the list -- the order is what a panel prints.
  for (const name of dotted) add(name);
  return found;
}

/**
 * Why a formula could not be read, when the reason is a spelling mix-up.
 *
 * THE TWO SPELLINGS, AND WHY THIS EXISTS
 * A column in a repeater's filter is `{{Price}}`. A block in a step condition
 * or a Formula block is `Price`. That is not an inconsistency to apologise for
 * -- a column name can contain a space and a bare identifier cannot -- but it
 * does mean somebody who has just written one and then writes the other gets
 *
 *     That formula could not be read. Check the brackets and quotes.
 *
 * which is true, useless, and points at the wrong thing entirely. The brackets
 * are fine. They are the wrong KIND of brackets for where they are.
 *
 * The filter case is the sharper one: `{{Price | money: $}}` is copied
 * straight out of the row markup sitting six inches away on the same panel,
 * where it is exactly right. It has to be refused rather than accommodated,
 * because `| money` produces "$600.00" -- text -- and comparing text to 100
 * asks whether "$" sorts after "1". A filter that silently answered that
 * question would be worse than one that will not run.
 *
 * Returns null when nothing recognisable is wrong, and the caller keeps its own
 * message. Guessing badly here is worse than not guessing.
 */
export function explainUnreadableFormula(
  text: string | undefined | null,
  spelling: 'slots' | 'names',
): string | null {
  const s = String(text ?? '');
  if (!s.trim()) return null;

  const slot = /\{\{\s*([^}]*?)\s*\}\}/.exec(s);

  if (spelling === 'slots') {
    // `{{Price | money: $}}` -- right in markup, wrong in a filter.
    const filtered = /\{\{\s*([^}|]+?)\s*\|[^}]*\}\}/.exec(s);
    if (filtered) {
      const name = filtered[1].trim();
      return `Write {{${name}}} on its own here. A filter like "| money" formats a value for showing on the page, and this compares the value itself — "£600.00" is text, and comparing text to a number does not mean what it looks like.`;
    }
    /**
     * A BARE name in a row filter is deliberately NOT handled here. It is
     * already answered, further along, by the thing that actually knows which
     * name it was -- "Use {{Prcie}} to mean a column" beats any sentence this
     * function could write, because this one only has the raw text and would
     * have to pick an example. The first version did exactly that, printed
     * `{{Price}}` at somebody whose column was called something else, and
     * turned an existing check red on the way in.
     */
    return null;
  }

  // spelling === 'names': braces belong to markup and to row filters.
  if (slot) {
    const name = slot[1].trim().replace(/\s*\|.*$/, '');
    const usable = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
    return usable
      ? `Write ${name} without the braces here. Braces are for markup and for a repeater's row filter; this reads a block by its name.`
      : 'Remove the braces here. Braces are for markup and for a repeater\'s row filter; this reads a block by its name.';
  }
  return null;
}
