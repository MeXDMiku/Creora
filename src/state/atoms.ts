import { addFacets } from '../lib/formula';
import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import type { NamedQuery } from '../lib/queries';
import type { CreoraAction } from '../lib/actions';
import type { Workflow, FormulaBinding, PageSummary, BlockRuntimeState } from '../types/creora';
import { nodeTypeFromBlockId, defaultValueForNodeType, defaultRuntimeForNodeType, shortBlockId, isBlockNodeType, BLOCK_DISPLAY_NAMES, type BlockNodeType } from '../lib/blockRegistry';
import type { BlockPlacement } from '../lib/layout';

/**
 * Block type is resolved from the ID via the registry, which is exact for
 * `<nodeType>__<random>` IDs and falls back to the legacy heuristic for the
 * old `test_*` fixture IDs. Do not substring-match block IDs here — a random
 * suffix can contain any letters, so `id.includes('db')` matched by accident.
 */
export function getBlockDefaultValue(identifier: string): any {
  return defaultValueForNodeType(nodeTypeFromBlockId(identifier));
}

export function getBlockTypeDisplayName(nodeType: string): string {
  /**
   * One table, in the registry. This was seventeen `type.includes(...)` tests
   * ending in `return 'Block'` -- so a block type added without a line here was
   * called "Block" everywhere, silently. Same shape as the .creora exporter
   * that wrote six types as plain text.
   *
   * Still tolerant of an unknown string, because callers pass ids and legacy
   * names through here; it just cannot be silently incomplete for a REAL type.
   */
  return BLOCK_DISPLAY_NAMES[nodeType as BlockNodeType] || 'Block';
}

export function isGarbageName(name: string | undefined | null): boolean {
  if (!name || name.trim() === '') return true;
  if (name.includes('·')) return true;
  return false;
}


export const blockRuntimeAtom = atomFamily((blockId: string) => {
  return atom<BlockRuntimeState>(defaultRuntimeForNodeType(nodeTypeFromBlockId(blockId)));
});

/**
 * Where a block sits. `{x, y}` is the desktop placement, and an optional
 * `phone` holds only what differs -- see src/lib/layout.ts. Every page saved
 * before breakpoints existed is exactly `{x, y}`, and still means the same
 * thing.
 */
export const blockPositionAtom = atomFamily((_blockId: string) => {
  return atom<BlockPlacement>({ x: 100, y: 100 });
});

export const workflowsAtom = atom<Workflow[]>([]);

export const selectedBlockIdAtom = atom<string | null>(null);

export const activeWireAtom = atom<{
  sourceBlockId: string;
  /**
   * Which output the drag started from. Absent means the single output every
   * block has always had -- see src/lib/ports.ts, where absent must keep
   * meaning `out` for every page already saved.
   */
  sourcePort?: 'out' | 'if' | 'else';
  sourceX: number;
  sourceY: number;
  currentX: number;
  currentY: number;
} | null>(null);

export const connectionsAtom = atom<{ id: string; sourceBlockId: string; targetBlockId: string; sourcePort?: 'out' | 'if' | 'else' }[]>([]);

export const snapTargetAtom = atom<string | null>(null);

export const pendingConnectionAtom = atom<{
  sourceBlockId: string;
  /** Which output the wire left from. Absent means the plain one. */
  sourcePort?: 'out' | 'if' | 'else';
  targetBlockId: string;
  sourceEvent?: 'onClick' | 'onChange' | 'onTick' | 'onComplete';
  /**
   * Set when an EXISTING wire is being changed rather than a new one drawn.
   *
   * A wire could only be deleted -- one option on its menu, "Delete" -- so
   * changing an action meant rebuilding every condition and column mapping from
   * memory. With this set the popup loads what is already there and Connect
   * replaces the workflow instead of adding a second one beside it.
   */
  editingConnectionId?: string;
  // Port coordinates, so WireOverlay can draw the dashed pending wire.
  x1: number;
  y1: number;
  x2: number;
  y2: number;
} | null>(null);

/**
 * The values a published page was opened with, or null in the editor.
 *
 * Null rather than {} is the whole distinction: on a published page an absent
 * parameter means "there is no category", and in the editor it means "there is
 * no address yet, show me the preview value so I can lay this page out". One
 * empty object could not tell those apart, and a detail page you cannot see
 * while designing it is a detail page nobody designs well.
 */
export const pageParamsAtom = atom<Record<string, string> | null>(null);

/**
 * Which screen size the builder is arranging.
 *
 * Changing this does not change the drag system -- it changes which key a drag
 * writes to. That single sentence is the difference between a layout model and
 * a rewrite of dragging and selection.
 */
export const editingBreakpointAtom = atom<'base' | 'phone'>('base');

/** How far the canvas is zoomed. 1 is life size. See src/lib/zoom.ts. */
export const canvasZoomAtom = atom<number>(1);

export const triggerSaveAtom = atom<number>(0);

export const isPreviewModeAtom = atom<boolean>(false);
export const canvasModeAtom = atom<'design' | 'action'>('action');

const baseContextMenuAtom = atom<{
  blockId: string;
  x: number;
  y: number;
  visible: boolean;
} | null>(null);

export const contextMenuAtom = atom(
  (get) => get(baseContextMenuAtom),
  (get, set, update: { blockId: string; x: number; y: number; visible: boolean } | null) => {
    if (get(isPreviewModeAtom)) {
      set(baseContextMenuAtom, null);
      return;
    }
    set(baseContextMenuAtom, update);
  }
);

const baseConnectionContextMenuAtom = atom<{
  connectionId: string;
  x: number;
  y: number;
  visible: boolean;
} | null>(null);

export const connectionContextMenuAtom = atom(
  (get) => get(baseConnectionContextMenuAtom),
  (get, set, update: { connectionId: string; x: number; y: number; visible: boolean } | null) => {
    if (get(isPreviewModeAtom)) {
      set(baseConnectionContextMenuAtom, null);
      return;
    }
    set(baseConnectionContextMenuAtom, update);
  }
);

export const allBlockIdsAtom = atom<string[]>([]);

export type BlockDataType = 'trigger' | 'number' | 'boolean' | 'string' | 'database' | 'unknown';

/**
 * A Shape's data type comes from the job it was given, not from what it is.
 *
 * This is the whole "treat it like Lego" idea: a shape arrives meaning nothing,
 * you point at it and say what it is, and only then does it gain ports and a
 * type. Same operation whether the shape was drawn here or pasted from a design.
 */
export function shapeRoleDataType(role: string | null | undefined): BlockDataType {
  switch (role) {
    case 'trigger': return 'trigger';
    case 'link':    return 'trigger';
    case 'display': return 'string';
    case 'input':   return 'string';
    default:        return 'unknown';
  }
}

export function getBlockDataType(nodeType: string): BlockDataType {
  switch (nodeType) {
    case 'buttonBlock': return 'trigger';
    case 'timerBlock': return 'trigger';
    // A branch hands on the trigger it was given, down one side or the other.
    case 'branchBlock': return 'trigger';
    case 'numberDisplayBlock': return 'number';
    case 'formulaDisplayBlock': return 'number';
    case 'toggleBlock': return 'boolean';
    case 'inputBlock': return 'string';
    case 'textLabelBlock': return 'string';
    case 'historyChartBlock': return 'unknown';
    case 'databaseBlock': return 'database';
    case 'listBlock': return 'unknown';
    case 'shapeBlock': return 'unknown';
    case 'dataSourceBlock': return 'unknown'; // resolved from the picked field at wire time
    case 'customHtmlBlock': return 'unknown';
    case 'imageBlock': return 'string'; // the address of the picture
    case 'repeatBlock': return 'string'; // whatever row was last clicked
    case 'pageValueBlock': return 'string'; // whatever the address carried
    case 'visitorBlock': return 'unknown'; // boolean or text, depending on the field
    default: return 'unknown';
  }
}

export function getPortBadge(dataType: BlockDataType): string {
  switch (dataType) {
    case 'number': return '#';
    case 'string': return 'T';
    case 'boolean': return '?';
    case 'database': return 'DB';
    default: return '';
  }
}

/**
 * Every block on the page, by the name a builder gave it.
 *
 * Extracted from useSlotValues so the binding engine can use it too: a workflow
 * that says "Hello {{First}}" has to resolve names exactly the way a template
 * does, and two resolvers would eventually disagree about which block wins.
 * First one wins on a duplicate name, so a later block cannot steal a slot.
 */
/**
 * The name a block ANSWERS TO in markup and formulas.
 *
 * Extracted because it was written out five times, and anything that has to
 * agree in five places eventually does not. It matters most for the block
 * nobody renamed: a fresh Text block has a placeholder name, and it is
 * addressable as "Text" -- so anything deciding whether `{{Text}}` refers to
 * something real has to apply this same rule or it will accuse a slot that
 * works perfectly.
 */
export function slotNameForNodeType(
  nodeType: string | null | undefined,
  state: { blockName?: unknown } | undefined | null,
): string {
  return isGarbageName(state?.blockName as string | undefined)
    ? getBlockTypeDisplayName(nodeType ?? '')
    : String((state as any).blockName);
}

/**
 * The same rule, for callers holding an id rather than a type. Both exist
 * because the type is sometimes to hand from the document node and sometimes
 * only derivable from the id, and making one of them do the other's job meant
 * passing '' and getting the fallback name for every unnamed block.
 */
export function slotNameOf(blockId: string, state: { blockName?: unknown } | undefined | null): string {
  return slotNameForNodeType(nodeTypeFromBlockId(blockId), state);
}

export function blockValuesByName(store: any): Record<string, any> {
  const byName: Record<string, any> = {};
  for (const id of (store.get(allBlockIdsAtom) || []) as string[]) {
    const state = store.get(blockRuntimeAtom(id));
    const name = slotNameOf(id, state);
    if (!(name in byName)) {
      byName[name] = state?.value;
      /**
       * AND ITS THREE OTHER ANSWERS. A block that fetches is loading, or
       * failed, or has answered, and only the last of those is a value -- see
       * facetsOf in formula.ts. Added HERE rather than in each caller so
       * markup, formulas, conditions and row filters cannot disagree about
       * what `Orders.loading` means; that split is the drift bug this project
       * has had ten of.
       */
      addFacets(byName, name, state);
    }
  }
  return byName;
}

export function getCanvasBlocks(editor: any, store: any, excludeBlockId?: string): { id: string; type: string; label: string; dataType: BlockDataType }[] {
  if (!editor) return [];
  const list: { id: string; type: string; label: string; dataType: BlockDataType }[] = [];
  editor.state.doc.descendants((node: any) => {
    const bId = node.attrs?.blockId;
    const typeName = node.type.name;
    if (bId && bId !== excludeBlockId && isBlockNodeType(typeName)) {
      const runtime = store.get(blockRuntimeAtom(bId));
      const dataType = typeName === 'shapeBlock'
        ? shapeRoleDataType(runtime?.role)
        : getBlockDataType(typeName);
      // The document node knows its type, so it is passed rather than re-derived
      // from the id -- but the rule itself is the shared one.
      const name = slotNameForNodeType(typeName, runtime);
      list.push({ id: bId, type: typeName, label: name, dataType });
    }
  });

  // A block id only earns its place in a label when the name alone is ambiguous.
  // "Submit" beats "Submit (a3f2)" every time; "Button (7b41)" is only useful
  // when there are two blocks called Button. Picking a block out of a dropdown
  // was one of the things that made this editor hard to use.
  const seen = new Map<string, number>();
  for (const b of list) seen.set(b.label, (seen.get(b.label) ?? 0) + 1);
  for (const b of list) {
    if ((seen.get(b.label) ?? 0) > 1) b.label = `${b.label} (${shortBlockId(b.id)})`;
  }

  return list;
}

export const formulasAtom = atom<FormulaBinding[]>([]);

/**
 * The questions this page asks of its own tables.
 *
 * A query is saved with the page, not with a block, because the answer is not
 * one block's business -- "sales by month" feeds a repeater, a total and a
 * condition at once, and hanging it off whichever block happened to show it
 * first would mean deleting that block deletes the question.
 *
 * Kept here as ids-and-names only; running them is resolveQueries in
 * lib/queries.ts, and the result arrives in tableScope under each name.
 *
 * LOG 2026-08-23  Added with primitive A's runtime wiring.
 */
export const queriesAtom = atom<NamedQuery[]>([]);

/**
 * The page's actions -- named sequences of writes that happen at the store.
 *
 * Page state like any other, and therefore saved, subscribed, cleared, loaded,
 * exported, imported and REMAPPED like any other. Queries reached six of those
 * seven and missed the remap, so an imported copy carried its questions across
 * still pointing at the original's blocks. Seven, not six.
 */
export const actionsAtom = atom<CreoraAction[]>([]);
/** Publish state of the page currently open in the editor. Set on load from get_page. */
export const currentPageIsPublishedAtom = atom<boolean>(false);
export const currentPageIdAtom = atom<string>('00000000-0000-0000-0000-000000000001');
export const pagesListAtom = atom<PageSummary[]>([]);
export const switchPageFnAtom = atom<((targetPageId: string) => Promise<void>) | null>(null);

/* ---------------------------------------------------------------------------
   Run log
   ---------------------------------------------------------------------------
   Twenty's workflow builder has "Workflow runs" for a reason, and docs/DIRECTION.md
   ranks it third of the four things worth taking. Until now, when a workflow did
   not fire there was nothing to look at — which is exactly what turned the July
   debugging sessions into clicking things repeatedly and guessing.

   In memory only, and deliberately so: a run log that survives reload needs a
   table, a retention policy and a write on every click of every published page.
   The value is in the last thirty seconds, not the last thirty days.
--------------------------------------------------------------------------- */

export interface RunStep {
  targetId: string;
  action: string;
  status: 'ran' | 'skipped';
  /** Why a step was skipped — the thing you actually want when nothing happened. */
  reason?: string;
  before?: any;
  after?: any;
}

export interface WorkflowRun {
  id: string;
  at: number;
  sourceId: string;
  event: string;
  /** null when the trigger fired and no workflow was listening. */
  workflowId: string | null;
  matched: number;
  steps: RunStep[];
}

export const RUN_LOG_LIMIT = 50;
export const workflowRunsAtom = atom<WorkflowRun[]>([]);

let runSeq = 0;
export function recordRun(store: any, run: Omit<WorkflowRun, 'id' | 'at'>) {
  const entry: WorkflowRun = { ...run, id: `run_${++runSeq}`, at: Date.now() };
  const prev = store.get(workflowRunsAtom) as WorkflowRun[];
  store.set(workflowRunsAtom, [entry, ...prev].slice(0, RUN_LOG_LIMIT));
}
