import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import type { Workflow, FormulaBinding, PageSummary, BlockRuntimeState } from '../types/creora';
import { nodeTypeFromBlockId, defaultValueForNodeType, defaultRuntimeForNodeType, shortBlockId, isBlockNodeType } from '../lib/blockRegistry';

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
  const type = nodeType.toLowerCase();
  if (type.includes('button')) return 'Button';
  if (type.includes('number')) return 'Number Display';
  if (type.includes('toggle')) return 'Toggle';
  if (type.includes('input')) return 'Input';
  if (type.includes('text') || type.includes('label')) return 'Text Label';
  if (type.includes('formula')) return 'Formula';
  if (type.includes('timer')) return 'Timer';
  if (type.includes('history') || type.includes('chart')) return 'History Chart';
  if (type.includes('database')) return 'Database';
  if (type.includes('list')) return 'List';
  if (type.includes('visitor')) return 'Visitor';
  if (type.includes('customhtml')) return 'My Design';
  if (type.includes('datasource')) return 'Live Data';
  if (type.includes('repeat')) return 'For each row';
  if (type.includes('image')) return 'Image';
  if (type.includes('shape')) return 'Shape';
  return 'Block';
}

export function isGarbageName(name: string | undefined | null): boolean {
  if (!name || name.trim() === '') return true;
  if (name.includes('·')) return true;
  return false;
}


export const blockRuntimeAtom = atomFamily((blockId: string) => {
  return atom<BlockRuntimeState>(defaultRuntimeForNodeType(nodeTypeFromBlockId(blockId)));
});

export const blockPositionAtom = atomFamily((_blockId: string) => {
  return atom<{ x: number; y: number }>({ x: 100, y: 100 });
});

export const workflowsAtom = atom<Workflow[]>([]);

export const selectedBlockIdAtom = atom<string | null>(null);

export const activeWireAtom = atom<{
  sourceBlockId: string;
  sourceX: number;
  sourceY: number;
  currentX: number;
  currentY: number;
} | null>(null);

export const connectionsAtom = atom<{ id: string; sourceBlockId: string; targetBlockId: string }[]>([]);

export const snapTargetAtom = atom<string | null>(null);

export const pendingConnectionAtom = atom<{
  sourceBlockId: string;
  targetBlockId: string;
  sourceEvent?: 'onClick' | 'onChange' | 'onTick' | 'onComplete';
  // Port coordinates, so WireOverlay can draw the dashed pending wire.
  x1: number;
  y1: number;
  x2: number;
  y2: number;
} | null>(null);

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
      const name = isGarbageName(runtime?.blockName)
        ? getBlockTypeDisplayName(typeName)
        : (runtime!.blockName as string);
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
