/**
 * A QUERY IS A TABLE YOU WROTE.
 *
 * `query.ts` can answer a question. This file is what makes an answer USABLE:
 * it gives the question a name, and then every part of the page that already
 * knows how to read a table can read the answer too. A repeater shows it. A
 * `sumOf("BestSellers", "Taken")` totals it. A condition asks whether it is
 * empty. None of those had to learn anything new, which is the whole point --
 * the alternative is a Query panel whose result can only be looked at.
 *
 * WHY THIS IS A SEPARATE FILE AND NOT SIX LINES IN tableScope
 * Because of the second sentence a builder says. The first is "group my sales
 * by month". The second is "now show me the best three of those" -- a query
 * ABOUT a query. That is a dependency graph, and a dependency graph has exactly
 * three ways of going wrong, all of which have to be answered here rather than
 * discovered by a builder:
 *
 *   a query that names something that does not exist
 *   a query that names one that names it back
 *   a query that takes the name of a table already on the page
 *
 * WHAT THE NODE DEMO TAUGHT, APPLIED HERE
 * `/nodes` ran the same shape as a canvas and made three things obvious:
 *   - the run has to be an ORDER, so a query can be told it is still waiting
 *     rather than told it is empty;
 *   - a cycle must be REPORTED, by name, not hung on -- "iterations and
 *     conditions are difficult to represent" is the oldest complaint about
 *     dataflow, and a graph that silently loops for ever is how a tool earns it;
 *   - the error must name the QUERY, because "Problem executing workflow" with
 *     no place in it is the single most complained-about sentence in these
 *     tools.
 *
 * NOTHING HERE THROWS. A page whose fourth query has a typo still shows the
 * other three. That is not politeness: a query feeds a repeater, and a thrown
 * error inside a scope-builder takes the whole page down with it.
 *
 * LOG
 * 2026-08-23  Written. Ordering, cycles and shadowing all refuse by name.
 *             `resolveQueries` never throws; each failure is attached to the
 *             query that caused it and every other query still runs.
 */
import { runQuery, describeQuery, hasATable, type QueryDef } from './query';
import { slotNamesIn, type TableScope, type TableData } from './formula';

export interface NamedQuery {
  id: string;
  /** What the page calls the answer. This is the table name a builder types. */
  name: string;
  def: QueryDef;
}

export interface ResolvedQueries {
  /** The page's tables with every query that ran added under its own name. */
  tables: TableScope;
  /** Why a query is not in there, by query id. Never thrown, always readable. */
  errors: Record<string, string>;
  /** The order they ran in. For the panel, and for the checks. */
  order: string[];
}

/** Names that would collide with something a formula already means. */
const RESERVED_NAMES = ['Me', 'MyRole', 'MyEmail', 'RowId', 'RowNumber', 'Now'];

/**
 * Every table name a query mentions.
 *
 * `from` may be one name or several. The other boxes are formulas, and a
 * formula may mention a table through `sumOf("Other", ...)`, so those count as
 * dependencies too -- a query that totals another query has to run second.
 */
export function queryDependsOn(def: QueryDef): string[] {
  const names = new Set<string>();
  if (!def || typeof def !== 'object') return [];
  const sources = Array.isArray(def.from) ? def.from : [{ table: String(def.from ?? '') }];
  for (const src of sources) {
    const name = String((src as any)?.table ?? '').trim();
    if (name) names.add(name);
  }

  // A table named inside a formula: sumOf("Sales", "Pence"), countOf("Likes").
  const formulas = [
    def.where, def.groupBy, def.orderBy, def.oneRowPer, def.keepThe,
    ...Object.values(def.keep || {}),
    ...Object.values(def.as || {}),
    ...(Array.isArray(def.from) ? def.from.flatMap(s => [s.where, ...Object.values(s.as || {})]) : []),
  ];
  for (const text of formulas) {
    if (!text) continue;
    for (const m of String(text).matchAll(/\b(?:countOf|sumOf|avgOf|minOf|maxOf|joinOf)\s*\(\s*"((?:[^"\\]|\\.)*)"/g)) {
      const name = String(m[1]).trim();
      if (name) names.add(name);
    }
  }
  return [...names];
}

/**
 * What is wrong with a query before it is ever run.
 *
 * Separate from running it because a builder needs to be told about a bad NAME
 * while typing it, not after the page has tried to answer a question it cannot
 * ask. `taken` is the panel's business; this is the page's.
 */
export function queryNameProblem(
  name: string,
  takenBy: Set<string>,
): string | null {
  const clean = String(name ?? '').trim();
  if (!clean) return 'Give this question a name — the name is how the page shows the answer.';
  if (!/^[A-Za-z][A-Za-z0-9 _]*$/.test(clean)) {
    return `"${clean}" cannot be a name. Start with a letter, then letters, numbers, spaces or _.`;
  }
  if (RESERVED_NAMES.some(r => r.toLowerCase() === clean.toLowerCase())) {
    return `"${clean}" already means something on every page. Pick another name.`;
  }
  if (takenBy.has(clean)) {
    return `Something on this page is already called "${clean}". Two things with one name is how a page shows the wrong one.`;
  }
  return null;
}

/**
 * Run the page's queries and hand back the tables with the answers in them.
 *
 * @param base   the tables that already exist — the blocks on the page.
 * @param queries what the builder wrote.
 * @param page   values by name, so a query can be about who is looking.
 */
export function resolveQueries(
  base: TableScope,
  queries: NamedQuery[],
  page?: Record<string, any>,
): ResolvedQueries {
  const tables: TableScope = { ...(base || {}) };
  const errors: Record<string, string> = {};
  const order: string[] = [];

  const list = (queries || []).filter(q => q && typeof q === 'object');
  const blockNames = new Set(Object.keys(base || {}));

  // 1. Names first, so a query that cannot have a name never runs and never
  //    quietly overwrites a block's table.
  const named: NamedQuery[] = [];
  const claimed = new Set(blockNames);
  for (const q of list) {
    const problem = queryNameProblem(q.name, claimed);
    if (problem) { errors[q.id] = problem; continue; }
    claimed.add(String(q.name).trim());
    named.push({ ...q, name: String(q.name).trim() });
  }

  // 2. An order that respects "this one is about that one".
  const byName = new Map(named.map(q => [q.name, q]));
  const done = new Set<string>();
  const visiting: string[] = [];

  const run = (q: NamedQuery): void => {
    if (done.has(q.name) || errors[q.id]) return;

    // A circle, named. The builder gets the loop, not a hang.
    const at = visiting.indexOf(q.name);
    if (at !== -1) {
      const loop = [...visiting.slice(at), q.name];
      const message =
        `These questions are about each other and cannot be answered: ${loop.join(' → ')}. `
        + 'One of them has to be about a table instead.';
      for (const name of loop) {
        const other = byName.get(name);
        if (other) errors[other.id] = message;
      }
      return;
    }

    visiting.push(q.name);
    for (const dep of queryDependsOn(q.def)) {
      const upstream = byName.get(dep);
      if (upstream && upstream.id !== q.id) run(upstream);
    }
    visiting.pop();
    if (errors[q.id]) return;

    // 3. Ask it. A failure is attached to this query and nothing else stops.
    // A half-written question is not a broken one. It simply is not a table
    // yet, so it does not become one and nobody is told off for it.
    if (!q.def || typeof q.def !== 'object' || !hasATable(q.def)) return;

    try {
      const rows = runQuery(q.def, tables, page);
      tables[q.name] = { rows, columns: columnsOf(rows) };
      done.add(q.name);
      order.push(q.name);
    } catch (err: any) {
      // The query is NAMED, because the whole complaint about these tools is
      // being told something went wrong without being told where.
      errors[q.id] = `"${q.name}" could not be answered: ${String(err?.message || err)}`;
    }
  };

  for (const q of named) run(q);
  return { tables, errors, order };
}

/**
 * The columns of an answer.
 *
 * Taken from the rows because a query INVENTS its columns -- `keep: { taken:
 * 'sum of {{Pence}}' }` produces a column called `taken` that exists in no
 * table. Without this, `sumOf("ByMonth", "taken")` would be refused for a
 * column that is genuinely there. See columnNamed in formula.ts for why an
 * empty list means "do not guess" rather than "no columns".
 */
export function columnsOf(rows: Record<string, any>[]): string[] {
  const seen = new Set<string>();
  for (const row of rows || []) {
    for (const key of Object.keys(row || {})) if (key !== 'id') seen.add(key);
  }
  return [...seen];
}

/**
 * What this query will be called and what it will hold, in one sentence.
 *
 * The Query panel is eight boxes, and eight boxes do not read as a sentence.
 * Same reason wireSentence and describeQuery exist: somebody checking their own
 * work has to be able to read back what they said.
 */
export function describeNamedQuery(q: NamedQuery): string {
  const name = String(q?.name ?? '').trim() || 'This question';
  // "Question is Pick a table to ask about." is two sentences wearing one
  // sentence's clothes. Said properly, it is the only instruction needed.
  if (!hasATable(q?.def || ({} as QueryDef))) return `${name} is not asked yet — pick a table to ask about.`;
  return `${name} is ${describeQuery(q?.def || ({} as QueryDef))}`;
}

/**
 * Which queries mention this name.
 *
 * For the moment a builder renames or deletes a table and the page has to say
 * what that breaks BEFORE it breaks it.
 */
export function queriesMentioning(name: string, queries: NamedQuery[]): NamedQuery[] {
  const wanted = String(name ?? '').trim();
  if (!wanted) return [];
  return (queries || []).filter(q => queryDependsOn(q?.def || ({} as QueryDef)).includes(wanted));
}

/**
 * The slots a query needs from the page.
 *
 * A query saying `{{Customer}} == Me` is about whoever is looking, so a page
 * that has not signed anybody in yet will answer it with nothing. Knowing
 * which names it wants is what lets the panel say so instead of showing an
 * empty list that looks like an answer.
 */
export function pageNamesIn(def: QueryDef): string[] {
  if (!def || typeof def !== 'object') return [];
  const texts = [
    def.where, def.groupBy, def.orderBy, def.oneRowPer, def.keepThe,
    ...Object.values(def.keep || {}),
    ...Object.values(def.as || {}),
    ...(Array.isArray(def.from) ? def.from.flatMap(s => [s.where, ...Object.values(s.as || {})]) : []),
  ].filter(Boolean) as string[];
  const names = new Set<string>();
  for (const text of texts) for (const n of slotNamesIn(text)) names.add(n);
  return [...names];
}

/**
 * `taken = sum of {{Pence}}, sold = count` as one line, and back again.
 *
 * IN THIS FILE AND NOT IN THE PANEL because the check suite cannot import a
 * .tsx — which sounds like a tooling detail and is really the right answer
 * anyway: this is the vocabulary of a query, not a detail of one screen. It
 * lived in the panel for about ten minutes and could not be checked there.
 *
 * One line rather than two boxes per kept value, because a table of inputs is
 * a form nobody fills in. A part with no `=` is DROPPED rather than guessed
 * at: guessing here would silently keep something the builder did not ask for.
 */
export function parseKeep(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of String(text || '').split(',')) {
    const at = part.indexOf('=');
    if (at === -1) continue;
    const name = part.slice(0, at).trim();
    if (name) out[name] = part.slice(at + 1).trim();
  }
  return out;
}

/** The same thing written back out, so the box shows what was typed into it. */
export function keepAsLine(keep: Record<string, string> | undefined): string {
  return Object.entries(keep || {}).map(([name, phrase]) => `${name} = ${phrase}`).join(', ');
}

export type { TableData };
