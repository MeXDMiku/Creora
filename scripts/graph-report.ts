/**
 * THE TWO GRAPHS A CREORA PAGE HAS, AND THE GAP BETWEEN THEM.
 *
 * A page draws its `connections` as wires. That is not the graph the engine
 * runs. A formula addresses a block by RAW ID, a query's `from` may be a raw
 * id, an action's step may name one, a List is filtered by whatever block is
 * in `filterBlockId` -- and none of those five things draws a line.
 *
 * So there is a DRAWN graph and a REAL graph, and the difference is invisible
 * by construction: it is exactly the set of dependencies nobody can see.
 *
 * This measures both, on any page blob, and says which side of the two
 * readability thresholds the page is on:
 *
 *   20 NODES   Ghoniem/Fekete/Castagliola 2005: past twenty vertices a matrix
 *              beats a node-link diagram on every task EXCEPT following a path.
 *   CROSSINGS  Kobourov et al. 2014: crossings hurt SMALL graphs and stop
 *              mattering for large ones -- not because they became harmless
 *              but because the drawing was already lost. Tidier routing does
 *              not rescue a hairball; fewer edges does.
 *
 *   node scripts/graph-report.ts <page.json>
 *   node scripts/graph-report.ts --demo
 */
import { readFileSync } from 'node:fs';
import { referencedIds } from '../src/lib/diagnose';
import { RUNTIME_BLOCK_ID_FIELDS } from '../src/lib/remapBlockIds';

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

export interface GraphReport {
  nodes: number;
  drawn: number;
  real: number;
  invisible: number;
  byVia: Record<string, number>;
  density: number;
  /** The bus: how many blocks any formula could reach without a wire. */
  busReaders: number;
  busEdgesIfDrawn: number;
}

export function report(page: PageBlob): GraphReport {
  const blocks = blocksOf(page);
  const edges = edgesOf(page);
  const uniq = (es: Edge[]) => new Set(es.map(e => `${e.from}>${e.to}`)).size;
  const byVia: Record<string, number> = {};
  for (const e of edges) byVia[e.via] = (byVia[e.via] ?? 0) + 1;

  /**
   * THE BUS CREORA ALREADY HAS AND DOES NOT DRAW.
   *
   * `formulaScope` puts EVERY block's value in scope for EVERY formula, keyed
   * by raw block id. So the set of edges a page COULD have without anyone
   * adding a wire is (values) x (things that hold a formula) -- the same
   * product that put 336 edges on a 19-node screen in the reference.
   */
  const readers = Object.values<any>(page.runtimeStates ?? {}).filter(s =>
    ['rowHtml', 'html', 'filterFormula', 'sortFormula', 'text', 'template'].some(k => s?.[k]),
  ).length
    + (page.formulas ?? []).length
    + (page.queries ?? []).length
    + (page.actions ?? []).length;

  return {
    nodes: blocks.size,
    drawn: uniq(edges.filter(e => e.drawn)),
    real: uniq(edges),
    invisible: uniq(edges) - uniq(edges.filter(e => e.drawn)),
    byVia,
    density: blocks.size > 1 ? uniq(edges) / (blocks.size * (blocks.size - 1)) : 0,
    busReaders: readers,
    busEdgesIfDrawn: blocks.size * readers,
  };
}

export function print(name: string, r: GraphReport) {
  const bar = (n: number, of: number) => '#'.repeat(Math.min(40, Math.round(40 * n / Math.max(of, 1))));
  console.log(`\n=== ${name} ===`);
  console.log(`nodes            ${r.nodes}`);
  console.log(`drawn edges      ${String(r.drawn).padStart(4)}  ${bar(r.drawn, r.real)}`);
  console.log(`real edges       ${String(r.real).padStart(4)}  ${bar(r.real, r.real)}`);
  console.log(`INVISIBLE        ${String(r.invisible).padStart(4)}  ${r.real ? Math.round(100 * r.invisible / r.real) : 0}% of what the page depends on is not on screen`);
  console.log(`density          ${r.density.toFixed(3)}`);
  console.log(`past 20 nodes    ${r.nodes > 20 ? 'YES — a matrix now beats this canvas at every task except following one path' : 'no'}`);
  console.log(`bus if drawn     ${r.busEdgesIfDrawn} edges (${r.busReaders} formula-holders x ${r.nodes} blocks in scope)`);
  const vias = Object.entries(r.byVia).sort((a, b) => b[1] - a[1]);
  if (vias.length) console.log('by reason        ' + vias.map(([k, v]) => `${k}=${v}`).join('  '));
}

if (process.argv[2] && process.argv[2] !== '--demo') {
  const page = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  print(process.argv[2], report(page.blocks ?? page));
}

/**
 * HOW THE GAP GROWS.
 *
 * A page of n data blocks where each list filters by one input and shows two
 * counted columns -- the shape every one of the seven sites is made of.
 */
export function grown(n: number): PageBlob {
  const runtimeStates: Record<string, any> = {};
  const connections: any[] = [];
  const formulas: any[] = [];
  const tables: string[] = [];
  for (let i = 0; i < n; i++) {
    const db = `databaseBlock__t${String(i).padStart(10, '0')}`;
    const list = `repeatBlock__l${String(i).padStart(11, '0')}`;
    const box = `inputBlock__s${String(i).padStart(12, '0')}`;
    const num = `numberDisplayBlock__${String(i).padStart(5, '0')}`;
    tables.push(db);
    runtimeStates[db] = { blockName: `T${i}`, rows: [], columns: [{ name: 'A' }, { name: 'B' }] };
    runtimeStates[box] = { blockName: `S${i}`, value: '' };
    runtimeStates[num] = { blockName: `N${i}`, trackedBlockId: db };
    runtimeStates[list] = {
      blockName: `L${i}`, trackedBlockId: db, filterBlockId: box,
      filterFormula: `contains({{A}}, ${box})`,
      rowHtml: `{{calc: countOf("T${(i + 1) % n}", '{{A}} == RowId')}} {{calc: sumOf("T${i}", "B", '{{A}} == RowId')}}`,
    };
    connections.push({ id: `c${i}`, sourceBlockId: db, targetBlockId: list });
    formulas.push({ id: `f${i}`, targetBlockId: num, formula: `${db} + 1` });
  }
  return { runtimeStates, positions: Object.fromEntries(Object.keys(runtimeStates).map(id => [id, { x: 0, y: 0 }])), connections, formulas };
}

if (process.argv[2] === '--demo') {
  console.log('\nblocks  drawn   real  invisible   %hidden   bus-if-drawn');
  for (const n of [2, 3, 5, 8, 12, 20]) {
    const r = report(grown(n));
    console.log(
      String(r.nodes).padStart(6),
      String(r.drawn).padStart(6),
      String(r.real).padStart(6),
      String(r.invisible).padStart(10),
      String(Math.round(100 * r.invisible / Math.max(r.real, 1)) + '%').padStart(9),
      String(r.busEdgesIfDrawn).padStart(14),
    );
  }
}
