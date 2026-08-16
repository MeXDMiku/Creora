import { newBlockId, nodeTypeFromBlockId } from './blockRegistry';

/**
 * Give every block in an imported page a fresh identity.
 *
 * WHY
 * `handleImportFile` used to keep the ids in the file exactly as it found them.
 * Import a page you exported and two pages now carry the same block ids -- and
 * a Database's rows are keyed by block id and by nothing else:
 *
 *   list_database_rows(p_block_id)  scoped by block id alone
 *   add_database_row(...)           finds the owning page with
 *                                   `where blocks->'runtimeStates' ? p_block_id
 *                                    limit 1`, no ordering, no tiebreak
 *
 * So the copy reads the original's submissions, and a submission on either one
 * lands on whichever page Postgres happened to return first. Using an export as
 * a template -- the obvious reason to have export and import at all -- silently
 * merged two pages' data.
 *
 * WHEN NOT TO DO THIS
 * Restoring a backup over the page it came from is the opposite case: there the
 * ids are the link back to rows that already exist on the server, and changing
 * them would strand every one of them. So the caller decides, by comparing the
 * file's page id against the page being imported into, and only copies are
 * remapped. `shouldRemapOnImport` is that rule, kept here beside the reason.
 *
 * WHAT COUNTS AS A REFERENCE
 * Block ids are not only the keys of `positions` and `runtimeStates`. They are
 * also written inside workflows, conditions, column mappings, connections,
 * formula expressions, the TipTap document's node attrs, and half a dozen
 * `...BlockId` fields on runtime state. Missing one does not throw -- it
 * produces a page whose wires point at nothing, which is the exact failure the
 * Health panel was built to find after the fact. Hence one function, and checks
 * that walk every field named here.
 *
 * Slots (`{{Name}}`) are deliberately untouched: they reference blocks by NAME,
 * so they keep working across a remap without being rewritten.
 */

/** Runtime-state fields whose value is another block's id. */
export const RUNTIME_BLOCK_ID_FIELDS = [
  'trackedBlockId',
  'searchBlockId',
  'filterBlockId',
  'sortColumnBlockId',
  'sortDirectionBlockId',
] as const;

export interface ImportedPageShape {
  id?: string;
  documentContent?: any;
  positions?: Record<string, any>;
  runtimeStates?: Record<string, any>;
  connections?: any[];
  workflows?: any[];
  formulas?: any[];
  blocks?: any[];
}

export interface RemapResult {
  page: ImportedPageShape;
  /** old id -> new id, for anything the caller wants to report. */
  idMap: Record<string, string>;
}

/**
 * Is this import a copy (remap) or a restore (keep the ids)?
 *
 * A file with no page id at all is treated as a copy. That is the safe way
 * round: a needless remap costs an imported page its link to rows it probably
 * never had, while a needless KEEP silently welds two live pages together.
 */
export function shouldRemapOnImport(
  filePageId: string | undefined | null,
  targetPageId: string | undefined | null,
): boolean {
  if (!filePageId || !targetPageId) return true;
  return filePageId !== targetPageId;
}

/** Collect every block id the file mentions as a block of its own. */
function collectBlockIds(page: ImportedPageShape): string[] {
  const ids = new Set<string>();
  for (const id of Object.keys(page.positions ?? {})) ids.add(id);
  for (const id of Object.keys(page.runtimeStates ?? {})) ids.add(id);
  for (const b of page.blocks ?? []) if (b?.id) ids.add(String(b.id));
  walkDoc(page.documentContent, node => {
    const id = node?.attrs?.blockId;
    if (id) ids.add(String(id));
  });
  return [...ids];
}

function walkDoc(node: any, visit: (n: any) => void): void {
  if (!node || typeof node !== 'object') return;
  visit(node);
  const content = (node as any).content;
  if (Array.isArray(content)) for (const child of content) walkDoc(child, visit);
}

/**
 * A new id that keeps the old one's type.
 *
 * The type is carried in the id's prefix and `nodeTypeFromBlockId` is how the
 * whole app recovers it, so a remap that lost the prefix would turn every block
 * into an unknown one. Legacy ids (`test_btn_1`) resolve through the heuristic
 * and come out with a proper prefix, which is a small free repair.
 */
function freshIdFor(oldId: string): string {
  const nodeType = nodeTypeFromBlockId(oldId);
  return nodeType ? newBlockId(nodeType) : oldId;
}

function remapString(value: unknown, idMap: Record<string, string>): any {
  if (typeof value !== 'string') return value;
  return idMap[value] ?? value;
}

/**
 * Rewrite the block ids inside a formula expression.
 *
 * Formulas address blocks by raw id -- `recalculateAllFormulas` builds its
 * scope as `scope[blockId] = value` -- so the expression text itself carries
 * them. Replacement is anchored on word boundaries and done longest-id-first,
 * so one id can never be rewritten inside another.
 */
export function remapFormulaExpression(formula: string, idMap: Record<string, string>): string {
  if (!formula) return formula;
  const olds = Object.keys(idMap).sort((a, b) => b.length - a.length);
  let out = formula;
  for (const oldId of olds) {
    const escaped = oldId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`, 'g'), idMap[oldId]);
  }
  return out;
}

function remapStep(step: any, idMap: Record<string, string>): any {
  if (!step || typeof step !== 'object') return step;
  const next: any = { ...step };

  next.targetId = remapString(step.targetId, idMap);
  if (step.elseTargetId !== undefined) next.elseTargetId = remapString(step.elseTargetId, idMap);

  if (step.condition && typeof step.condition === 'object') {
    next.condition = { ...step.condition, fieldId: remapString(step.condition.fieldId, idMap) };
  }
  if (Array.isArray(step.conditions)) {
    next.conditions = step.conditions.map((c: any) =>
      c && typeof c === 'object' ? { ...c, fieldId: remapString(c.fieldId, idMap) } : c,
    );
  }

  // A mapping's `value` is a block id only when its `source` says so. A fixed
  // value that happens to read like an id is a value, and rewriting it would
  // corrupt the row a form writes.
  if (step.mappings && typeof step.mappings === 'object') {
    const mappings: Record<string, any> = {};
    for (const [column, m] of Object.entries<any>(step.mappings)) {
      mappings[column] =
        m && typeof m === 'object' && m.source === 'block'
          ? { ...m, value: remapString(m.value, idMap) }
          : m;
    }
    next.mappings = mappings;
  }
  if (step.matchValue && typeof step.matchValue === 'object' && step.matchValue.source === 'block') {
    next.matchValue = { ...step.matchValue, value: remapString(step.matchValue.value, idMap) };
  }

  return next;
}

/** Every block in the page gets a new id, and every reference to it follows. */
export function remapBlockIds(page: ImportedPageShape): RemapResult {
  const idMap: Record<string, string> = {};
  for (const oldId of collectBlockIds(page)) {
    const fresh = freshIdFor(oldId);
    if (fresh !== oldId) idMap[oldId] = fresh;
  }

  const at = (id: string) => idMap[id] ?? id;
  const rekey = (record: Record<string, any> | undefined) => {
    if (!record) return record;
    const out: Record<string, any> = {};
    for (const [id, value] of Object.entries(record)) out[at(id)] = value;
    return out;
  };

  const runtimeStates = rekey(page.runtimeStates);
  if (runtimeStates) {
    for (const [id, state] of Object.entries(runtimeStates)) {
      if (!state || typeof state !== 'object') continue;
      const next: any = { ...state };
      for (const field of RUNTIME_BLOCK_ID_FIELDS) {
        if (next[field] !== undefined) next[field] = remapString(next[field], idMap);
      }
      runtimeStates[id] = next;
    }
  }

  // The document is structural, so it is rebuilt rather than mutated: the
  // editor is handed this object directly and a shared node would be edited
  // under it.
  const cloneDoc = (node: any): any => {
    if (Array.isArray(node)) return node.map(cloneDoc);
    if (!node || typeof node !== 'object') return node;
    const next: any = { ...node };
    if (next.attrs && typeof next.attrs === 'object' && next.attrs.blockId) {
      next.attrs = { ...next.attrs, blockId: at(String(next.attrs.blockId)) };
    }
    if (Array.isArray(next.content)) next.content = next.content.map(cloneDoc);
    return next;
  };

  return {
    idMap,
    page: {
      ...page,
      documentContent: page.documentContent ? cloneDoc(page.documentContent) : page.documentContent,
      positions: rekey(page.positions),
      runtimeStates,
      connections: (page.connections ?? []).map((c: any) =>
        c && typeof c === 'object'
          ? {
              ...c,
              sourceBlockId: remapString(c.sourceBlockId, idMap),
              targetBlockId: remapString(c.targetBlockId, idMap),
            }
          : c,
      ),
      workflows: (page.workflows ?? []).map((w: any) =>
        w && typeof w === 'object'
          ? {
              ...w,
              sourceId: remapString(w.sourceId, idMap),
              steps: Array.isArray(w.steps) ? w.steps.map((s: any) => remapStep(s, idMap)) : w.steps,
            }
          : w,
      ),
      formulas: (page.formulas ?? []).map((f: any) =>
        f && typeof f === 'object'
          ? {
              ...f,
              targetBlockId: remapString(f.targetBlockId, idMap),
              formula: remapFormulaExpression(String(f.formula ?? ''), idMap),
            }
          : f,
      ),
      blocks: (page.blocks ?? []).map((b: any) =>
        b && typeof b === 'object' ? { ...b, id: remapString(b.id, idMap) } : b,
      ),
    },
  };
}
