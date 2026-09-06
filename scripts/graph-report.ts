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

export type { PageBlob, Edge } from '../src/lib/pageGraph';
import { blocksOf, edgesOf } from '../src/lib/pageGraph';
import type { PageBlob, Edge } from '../src/lib/pageGraph';
export { blocksOf, edgesOf };

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
