/**
 * THE TWO GRAPHS A CREORA PAGE HAS.
 *
 * A page draws its `connections` as wires. That is not the graph the engine
 * runs. A formula addresses a block by RAW ID, a query's `from` may be a raw
 * id, an action's step may name one, a List is filtered by whatever block sits
 * in `filterBlockId` -- and not one of those draws a line.
 *
 * So there is a DRAWN graph and a REAL graph, and the gap between them is
 * invisible by construction: it is precisely the set of dependencies nobody
 * can see. Measured on this project's own pages it ran at about two thirds.
 *
 * WHY THIS MOVED OUT OF scripts/
 * It was written as a report -- a thing you run at a terminal to learn a number
 * about a saved page. But the canvas needs the same answer to draw the edges it
 * has never drawn, and the editor cannot import from scripts/. Nothing about
 * the logic changed in the move; scripts/graph-report.ts now imports from here
 * and keeps the reporting and the thresholds.
 *
 * It also had NO checks, which is the same hole the wire rule had: the function
 * the "two thirds are invisible" claim rests on was never once run by the
 * suite. It is now.
 */
import { referencedIds } from './diagnose';
import { RUNTIME_BLOCK_ID_FIELDS } from './remapBlockIds';

export interface PageBlob {
  documentContent?: any;
  positions?: Record<string, any>;
  runtimeStates?: Record<string, any>;
  connections?: any[];
  workflows?: any[];
  formulas?: any[];
  queries?: any[];
  actions?: any[];
}

export interface Edge { from: string; to: string; via: string; drawn: boolean }

const isBlockId = (s: unknown, blocks: Set<string>) => typeof s === 'string' && blocks.has(s);

export function blocksOf(page: PageBlob): Set<string> {
  const ids = new Set<string>();
  for (const id of Object.keys(page.runtimeStates ?? {})) ids.add(id);
  for (const id of Object.keys(page.positions ?? {})) ids.add(id);
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return;
    if (n.attrs?.blockId) ids.add(String(n.attrs.blockId));
    if (Array.isArray(n.content)) n.content.forEach(walk);
  };
  walk(page.documentContent);
  return ids;
}

/**
 * Every dependency on the page, with the reason it exists and whether a wire
 * is drawn for it. `drawn` is the whole point of the report.
 */
export function edgesOf(page: PageBlob): Edge[] {
  const blocks = blocksOf(page);
  const out: Edge[] = [];
  const add = (from: string, to: string, via: string, drawn: boolean) => {
    if (!from || !to || from === to) return;
    if (!blocks.has(from) || !blocks.has(to)) return;
    out.push({ from, to, via, drawn });
  };

  // 1. the wires, which are the only thing on screen
  for (const c of page.connections ?? []) add(c?.sourceBlockId, c?.targetBlockId, 'wire', true);

  // 2. a workflow step. Drawn when a connection was made for it, and there is
  //    no way to tell from here which -- so counted as drawn, generously.
  for (const w of page.workflows ?? []) {
    for (const s of w?.steps ?? []) {
      add(w.sourceId, s?.targetId, 'step', true);
      if (s?.elseTargetId) add(w.sourceId, s.elseTargetId, 'step:otherwise', false);
      for (const c of [s?.condition, ...(s?.conditions ?? [])]) {
        if (c?.fieldId) add(c.fieldId, w.sourceId, 'step:condition', false);
        for (const id of referencedIds(c?.expression)) add(id, w.sourceId, 'step:condition-formula', false);
      }
      for (const m of Object.values<any>(s?.mappings ?? {})) {
        if (m?.source === 'block') add(m.value, s?.targetId, 'step:column', false);
      }
      for (const m of Object.values<any>(s?.given ?? {})) {
        if (m?.source === 'block') add(m.value, s?.targetId, 'step:given', false);
      }
      if (s?.matchValue?.source === 'block') add(s.matchValue.value, s?.targetId, 'step:match', false);
      for (const id of referencedIds(s?.matchFormula)) add(id, s?.targetId, 'step:match-formula', false);
    }
  }

  // 3. a formula. Addresses blocks by RAW ID and draws nothing.
  for (const f of page.formulas ?? []) {
    for (const id of referencedIds(f?.formula)) add(id, f?.targetBlockId, 'formula', false);
  }

  // 4. a block reading another block through its own settings. Five fields,
  //    every one set in an inspector, every one invisible on the canvas.
  for (const [id, state] of Object.entries<any>(page.runtimeStates ?? {})) {
    for (const field of RUNTIME_BLOCK_ID_FIELDS) {
      if (isBlockId(state?.[field], blocks)) add(state[field], id, `setting:${field}`, false);
    }
    // markup, filters and sorts are formulas living in runtime state
    for (const key of ['rowHtml', 'html', 'filterFormula', 'sortFormula', 'text', 'template']) {
      for (const ref of referencedIds(state?.[key])) add(ref, id, `setting:${key}`, false);
    }
  }

  // 5. a question. `from` may be a raw block id, and its expressions may name any block.
  for (const q of page.queries ?? []) {
    const d = q?.def ?? {};
    const froms = Array.isArray(d.from) ? d.from.map((s: any) => s?.table) : [d.from];
    for (const t of froms) if (isBlockId(t, blocks)) add(t, `query:${q.id}`, 'query:from', false);
    for (const key of ['where', 'groupBy', 'orderBy', 'oneRowPer', 'keepThe']) {
      for (const id of referencedIds(d[key])) add(id, `query:${q.id}`, `query:${key}`, false);
    }
    for (const v of Object.values<any>(d.keep ?? {})) {
      for (const id of referencedIds(v)) add(id, `query:${q.id}`, 'query:keep', false);
    }
  }

  // 6. an action.
  for (const a of page.actions ?? []) {
    for (const s of a?.steps ?? []) {
      if (isBlockId(s?.table, blocks)) add(s.table, `action:${a.id}`, 'action:table', false);
      for (const key of ['when', 'where']) {
        for (const id of referencedIds(s?.[key])) add(id, `action:${a.id}`, `action:${key}`, false);
      }
      for (const v of Object.values<any>(s?.set ?? {})) {
        for (const id of referencedIds(v)) add(id, `action:${a.id}`, 'action:set', false);
      }
    }
  }

  return out;
}
