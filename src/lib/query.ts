/**
 * A NAMED QUESTION, ANSWERED OVER TABLES.
 *
 * Primitive A from docs/CONNECTING_THE_TWO.md. It closes four gaps at once --
 * group-by, unions, store-side paging and dedupe -- and they are one idea, not
 * four: A LIST WHOSE ROWS ARE NOT THE ROWS OF ONE TABLE.
 *
 * WHAT THE RESEARCH CHANGED, because this was designed twice
 * Node-based tools have been around since Sutherland proposed defining programs
 * as 2D diagrams in 1966, and the same two things kill them every time: graphs
 * that cannot be read at scale, and expressions that are code wearing a
 * costume. n8n is the clearest current case -- a capable tool whose reviewers
 * say plainly that non-coders fall off at things like
 * `{{ $json.customer.email.split('@')[0] }}`.
 *
 * So the vocabulary here is deliberately ENGLISH and deliberately small:
 *
 *     count                     sum of {{Pence}}         average of {{Rating}}
 *     smallest of {{At}}        largest of {{At}}
 *     first {{Name}}            list of {{Name}}
 *
 * Seven phrases. Anything else is refused BY LISTING THE SEVEN, because the
 * other thing that reviewers say kills these tools is an error that does not
 * say what to do -- "Problem executing workflow", with no name and no place.
 *
 * Pure on purpose: no store, no React, no network, so `npm run check` runs
 * every line of it.
 */
import { evaluateExpression, truthy, bindSlots, type TableData, type TableScope } from './formula';

export type QueryDirection = 'asc' | 'desc';

export interface QuerySource {
  /** The table's name, as printed on the block. */
  table: string;
  /** A row formula. Keeps the rows it answers true for. */
  where?: string;
  /**
   * How this source's columns become the shared shape.
   *
   * Only needed for a union -- it is what makes rows of different shapes into
   * rows of ONE shape, so a repeater can show them. `{ who: '{{UserId}}' }`.
   */
  as?: Record<string, string>;
}

export interface QueryDef {
  from: string | QuerySource[];
  where?: string;
  as?: Record<string, string>;
  /** What makes two rows the same row. The buckets are whatever it answers. */
  groupBy?: string;
  /** What to work out for each group. `{ taken: 'sum of {{Pence}}' }`. */
  keep?: Record<string, string>;
  /** One row per this value. */
  oneRowPer?: string;
  /** Which one, when several share it: `largest of {{At}}`. */
  keepThe?: string;
  orderBy?: string;
  direction?: QueryDirection;
  skip?: number;
  limit?: number;
}

export const KEEP_PHRASES = [
  'count', 'sum of', 'average of', 'smallest of', 'largest of', 'first', 'list of',
] as const;

const KEEP_HELP =
  'Try: count, sum of {{Column}}, average of {{Column}}, smallest of {{Column}}, ' +
  'largest of {{Column}}, first {{Column}}, list of {{Column}}.';

/**
 * One expression against one row, in the real language.
 *
 * THE TABLES ARE PASSED IN, AND WERE NOT UNTIL 24 AUG.
 *
 * `evaluateExpression` was called with two arguments, so `countOf` inside a
 * query's `where` came back with
 *
 *   "Tables cannot be read from here -- countOf and sumOf work in a formula or
 *    a condition, not in page markup"
 *
 * said inside a QUESTION, naming a third place entirely. The identical wrong
 * message was recorded in BUILT_TWO_TO_FIND_OUT.md when a condition could not
 * reach another table; this is the same sentence being wrong in a new box.
 *
 * It was an omission rather than a decision -- nothing anywhere said why a
 * question should be weaker than the repeater filter sitting next to it, and
 * the cost argument does not separate them: a filter calling countOf is
 * already rows-times-rows, and is allowed, guarded by MAX_QUESTION_DEPTH.
 * The same guard covers this.
 *
 * Found by trying to write Gmail's unread-count-per-label, which is
 * "labels where a message is unread" and is refused without this.
 */
function value(
  expr: string | undefined | null,
  row: Record<string, any>,
  page?: Record<string, any>,
  tables?: TableScope,
): any {
  const text = String(expr ?? '').trim();
  if (!text) return null;
  const bound = bindSlots(text, name => (name === 'Row id' ? row?.id : row?.[name]), { ...(page || {}), ...row });
  return evaluateExpression(bound.expression, bound.scope, tables);
}

const num = (v: any): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * What one line of KEEP works out for one group.
 *
 * Split off so the panel can offer the seven phrases and a check can run each.
 */
export function applyKeep(
  phrase: string,
  rows: Record<string, any>[],
  page?: Record<string, any>,
  tables?: TableScope,
): any {
  const text = String(phrase ?? '').trim();
  if (text === 'count') return rows.length;

  const word = KEEP_PHRASES.find(w => w !== 'count' && text.startsWith(w + ' '));
  if (!word) throw new Error(`"${text}" is not something to keep. ${KEEP_HELP}`);
  const expr = text.slice(word.length + 1);
  const each = () => rows.map(r => value(expr, r, page, tables));

  switch (word) {
    case 'sum of': return rows.reduce((t, r) => t + num(value(expr, r, page, tables)), 0);
    case 'average of':
      return rows.length
        ? Math.round((rows.reduce((t, r) => t + num(value(expr, r, page, tables)), 0) / rows.length) * 100) / 100
        : 0;
    case 'smallest of': return each().reduce((m, v) => (m === null || v < m ? v : m), null as any);
    case 'largest of': return each().reduce((m, v) => (m === null || v > m ? v : m), null as any);
    case 'first': return rows.length ? value(expr, rows[0], page, tables) : null;
    case 'list of': return each().join(', ');
    default: throw new Error(`"${text}" is not something to keep. ${KEEP_HELP}`);
  }
}

const rowsOf = (t: TableData | undefined): Record<string, any>[] =>
  Array.isArray((t as any)?.rows) ? (t as any).rows : Array.isArray(t) ? (t as any) : [];

/**
 * Run a query.
 *
 * @param page values from the page by name, so a query can be about who is
 *   looking -- "my orders", "the people I follow". The same three-layer scope a
 *   row filter uses.
 */
export function runQuery(
  def: QueryDef,
  tables: TableScope | undefined,
  page?: Record<string, any>,
): Record<string, any>[] {
  /**
   * The names to offer back when one is wrong.
   *
   * IDS ARE LEFT OUT ON PURPOSE, the same as tableNamed in formula.ts. The
   * panel showed a builder `There is: Submissions, databaseBlock__x0zomnlfbm`,
   * which is noise in the one sentence that has to be readable — and the
   * decision had already been made once, three files away, so this was a copy
   * of the rule that had drifted rather than a new question.
   */
  const known = Object.keys(tables || {}).filter(name => !name.includes('__'));
  const sources: QuerySource[] = Array.isArray(def.from)
    ? def.from
    : [{ table: String(def.from ?? ''), where: def.where, as: def.as }];

  let rows: Record<string, any>[] = [];
  for (const src of sources) {
    const table = (tables || {})[src.table];
    if (!table) {
      throw new Error(
        `There is no table called "${src.table}". ` +
        (known.length ? `There is: ${known.join(', ')}.` : 'There are no tables on this page yet.'),
      );
    }
    let kept = rowsOf(table);
    if (String(src.where ?? '').trim()) kept = kept.filter(r => truthy(value(src.where, r, page, tables)));
    rows = rows.concat(
      src.as
        ? kept.map(r => {
            const shaped: Record<string, any> = {};
            for (const [key, expr] of Object.entries(src.as as Record<string, string>)) {
              shaped[key] = value(expr, r, page, tables);
            }
            return shaped;
          })
        : kept,
    );
  }

  /**
   * ONE ROW PER, AND WHICH ONE.
   *
   * "One row per author" is ambiguous on its own, and a first draft answered
   * "whichever came first" -- while the check written to prove that order
   * mattered passed either way. Decorative, found by trying to make it fail.
   * The question is asked in the box next to it now, and with nothing said it
   * keeps the first it meets and says so.
   */
  if (String(def.oneRowPer ?? '').trim()) {
    const groups = new Map<string, Record<string, any>[]>();
    for (const r of rows) {
      const key = JSON.stringify(value(def.oneRowPer, r, page, tables));
      if (!groups.has(key)) groups.set(key, []);
      (groups.get(key) as Record<string, any>[]).push(r);
    }
    const choose = String(def.keepThe ?? '').trim();
    rows = [...groups.values()].map(group => {
      if (!choose) return group[0];
      const biggest = choose.startsWith('largest of ');
      if (!biggest && !choose.startsWith('smallest of ')) {
        throw new Error(
          `"${choose}" is not a way to choose one. Try: largest of {{Column}}, or smallest of {{Column}}.`,
        );
      }
      const expr = choose.replace(/^(largest|smallest) of /, '');
      return group.reduce((best, r) => {
        const a = value(expr, r, page, tables);
        const b = value(expr, best, page, tables);
        return (biggest ? a > b : a < b) ? r : best;
      });
    });
  }

  /**
   * GROUP BY -- the one thing nothing in the language could do. The buckets are
   * whatever the expression answers, which is the whole point: nobody lists the
   * months in advance.
   */
  if (String(def.groupBy ?? '').trim()) {
    const buckets = new Map<string, { key: any; rows: Record<string, any>[] }>();
    for (const r of rows) {
      const key = value(def.groupBy, r, page, tables);
      const flat = JSON.stringify(key);
      if (!buckets.has(flat)) buckets.set(flat, { key, rows: [] });
      (buckets.get(flat) as any).rows.push(r);
    }
    rows = [...buckets.values()].map(({ key, rows: inGroup }, i) => {
      const out: Record<string, any> = { id: `g${i}`, group: key };
      const keep = def.keep && Object.keys(def.keep).length ? def.keep : { count: 'count' };
      for (const [name, phrase] of Object.entries(keep)) out[name] = applyKeep(phrase, inGroup, page, tables);
      return out;
    });
  } else if (def.keep && Object.keys(def.keep).length) {
    /**
     * KEEP WITH NO GROUP BY is one row for the whole table -- "the total", "how
     * many". A separate feature in most tools; here it is the same one with the
     * grouping left out.
     */
    const out: Record<string, any> = { id: 'total' };
    for (const [name, phrase] of Object.entries(def.keep)) out[name] = applyKeep(phrase, rows, page, tables);
    rows = [out];
  }

  if (String(def.orderBy ?? '').trim()) {
    const dir = def.direction === 'desc' ? -1 : 1;
    rows = rows
      .map((row, i) => ({ row, i, key: value(def.orderBy, row, page, tables) }))
      .sort((a, b) => {
        const n = (a.key > b.key ? 1 : a.key < b.key ? -1 : 0) * dir;
        // Ties keep the order they arrived in, or a list reshuffles itself
        // between renders and looks broken to whoever is reading it.
        return n !== 0 ? n : a.i - b.i;
      })
      .map(x => x.row);
  }

  /**
   * THE LIMIT IS PART OF THE QUESTION, not something the page does afterwards.
   * That is the difference between asking for five rows and fetching forty
   * thousand to show five -- which on a free tier is the bill.
   */
  const skip = Math.max(0, Math.floor(def.skip || 0));
  if (def.limit && def.limit > 0) return rows.slice(skip, skip + def.limit);
  return skip ? rows.slice(skip) : rows;
}

/** Whether this question names any table at all yet. */
export function hasATable(def: QueryDef): boolean {
  const sources = Array.isArray(def?.from) ? def.from : [{ table: String(def?.from ?? '') }];
  return sources.some(src => String(src?.table ?? '').trim().length > 0);
}

export interface QueryPreview {
  rows: Record<string, any>[];
  columns: string[];
  /** What the query says, in a sentence, for somebody checking their own work. */
  sentence: string;
  error: string | null;
}

/**
 * RUN IT AND SHOW WHAT CAME OUT.
 *
 * The single feature that reviewers of every node tool point at as the thing
 * that makes them usable -- n8n's per-node run, and the reason its users forgive
 * the rest of it. Nothing in Creora can currently show a builder what a block
 * actually holds, which means a group-by would be written blind: you cannot
 * tell a right answer from a wrong one without seeing the rows.
 *
 * A preview that THROWS would be useless, so this never throws -- it hands back
 * the failure and an empty result, and the panel shows both.
 */
export function previewQuery(
  def: QueryDef,
  tables: TableScope | undefined,
  page?: Record<string, any>,
  limit = 8,
): QueryPreview {
  const sentence = describeQuery(def);
  /**
   * A QUESTION WITH NO TABLE IS NOT ASKED WRONGLY, IT IS NOT ASKED YET.
   *
   * Found the first time the panel was opened: pressing "Ask something" put a
   * red box on screen before the builder had done anything, saying
   * `There is no table called ""`. That is the tool blaming somebody for not
   * having finished a sentence they just started, and it is exactly the
   * "vague errors" complaint these tools collect. The sentence beside the
   * boxes already says the useful thing — "Pick a table to ask about."
   */
  if (!hasATable(def)) return { rows: [], columns: [], sentence, error: null };
  try {
    const rows = runQuery(def, tables, page);
    const shown = rows.slice(0, limit);
    const columns = [...new Set(shown.flatMap(r => Object.keys(r)))].filter(c => c !== 'id');
    return { rows: shown, columns, sentence, error: null };
  } catch (err: any) {
    return { rows: [], columns: [], sentence, error: String(err?.message || 'That question could not be answered') };
  }
}

/**
 * The query as one sentence.
 *
 * For the same reason wireSentence exists: a person checking their own work
 * needs to read back what they said, and eight boxes do not read as a sentence.
 */
export function describeQuery(def: QueryDef): string {
  const sources = Array.isArray(def.from) ? def.from : [{ table: String(def.from ?? ''), where: def.where }];
  const names = sources.map(s => s.table).filter(Boolean);
  if (!names.length) return 'Pick a table to ask about.';

  const parts: string[] = [];
  parts.push(names.length > 1 ? `rows from ${names.join(' and ')}` : `rows from ${names[0]}`);
  if (sources.some(s => String(s.where ?? '').trim())) parts.push('that match your filter');
  if (String(def.oneRowPer ?? '').trim()) {
    parts.push(`one per ${def.oneRowPer}${String(def.keepThe ?? '').trim() ? ` (${def.keepThe})` : ''}`);
  }
  if (String(def.groupBy ?? '').trim()) {
    const keeps = Object.entries(def.keep || {}).map(([n, p]) => `${n} = ${p}`);
    parts.push(`grouped by ${def.groupBy}`);
    if (keeps.length) parts.push(`keeping ${keeps.join(' and ')}`);
  } else if (def.keep && Object.keys(def.keep).length) {
    parts.push(`as one row: ${Object.entries(def.keep).map(([n, p]) => `${n} = ${p}`).join(' and ')}`);
  }
  if (String(def.orderBy ?? '').trim()) {
    parts.push(`ordered by ${def.orderBy}, ${def.direction === 'desc' ? 'largest first' : 'smallest first'}`);
  }
  if (def.limit && def.limit > 0) parts.push(`the first ${def.limit}`);
  return parts.join(', ') + '.';
}
