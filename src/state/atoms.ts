import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import type { Workflow, FormulaBinding, Page, BlockRuntimeState } from '../types/creora';

export function getBlockDefaultValue(identifier: string): any {
  const id = identifier.toLowerCase();
  if (id.includes('tgl') || id.includes('toggle')) return false;
  if (id.includes('inp') || id.includes('input') || id.includes('lbl') || id.includes('label') || id.includes('shp') || id.includes('shape')) return '';
  if (id.includes('tmr') || id.includes('timer')) return false;
  if (id.includes('db') || id.includes('database')) return 0;
  if (id.includes('list')) return '';
  return 0;
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
  if (type.includes('shape')) return 'Shape';
  return 'Block';
}

export function isGarbageName(name: string | undefined | null): boolean {
  if (!name || name.trim() === '') return true;
  if (name.includes('·')) return true;
  return false;
}

export const blockRuntimeAtom = atomFamily((blockId: string) => {
  const isChart = blockId.toLowerCase().includes('chart') || blockId.toLowerCase().includes('history');
  const isDb = blockId.toLowerCase().includes('db') || blockId.toLowerCase().includes('database');
  const isList = blockId.toLowerCase().includes('list');
  const isShape = blockId.toLowerCase().includes('shp') || blockId.toLowerCase().includes('shape');
  return atom<BlockRuntimeState>({
    value: getBlockDefaultValue(blockId),
    visible: true,
    disabled: false,
    loading: false,
    error: null,
    columns: isDb ? [
      { name: 'Name', type: 'text' },
      { name: 'Age', type: 'number' }
    ] : undefined,
    rows: isDb ? [] : undefined,
    outputMode: isDb ? 'row_count' : undefined,
    trackedBlockId: (isChart || isList) ? '' : undefined,
    history: isChart ? [] : undefined,
    text: isShape ? '' : undefined,
    role: isShape ? null : undefined,
  });
});

export const blockPositionAtom = atomFamily((blockId: string) => {
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
  sourceEvent: 'onClick' | 'onChange' | 'onTick' | 'onComplete';
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
  wireId: string;
  x: number;
  y: number;
  visible: boolean;
} | null>(null);

export const connectionContextMenuAtom = atom(
  (get) => get(baseConnectionContextMenuAtom),
  (get, set, update: { wireId: string; x: number; y: number; visible: boolean } | null) => {
    if (get(isPreviewModeAtom)) {
      set(baseConnectionContextMenuAtom, null);
      return;
    }
    set(baseConnectionContextMenuAtom, update);
  }
);

export const allBlockIdsAtom = atom<string[]>([]);

export type BlockDataType = 'trigger' | 'number' | 'boolean' | 'string' | 'database' | 'unknown';

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
    if (bId && bId !== excludeBlockId && (
      typeName === 'buttonBlock' || 
      typeName === 'numberDisplayBlock' || 
      typeName === 'formulaDisplayBlock' || 
      typeName === 'toggleBlock' || 
      typeName === 'inputBlock' || 
      typeName === 'textLabelBlock' ||
      typeName === 'timerBlock' ||
      typeName === 'historyChartBlock' ||
      typeName === 'databaseBlock' ||
      typeName === 'listBlock' ||
      typeName === 'shapeBlock'
    )) {
      const dataType = getBlockDataType(typeName);
      const runtime = store.get(blockRuntimeAtom(bId));
      const name = runtime?.blockName || getBlockTypeDisplayName(typeName);
      const label = `${name} (${bId})`;
      list.push({ id: bId, type: typeName, label, dataType });
    }
  });
  return list;
}

export const formulasAtom = atom<FormulaBinding[]>([]);
export const currentPageIdAtom = atom<string>('00000000-0000-0000-0000-000000000001');
export const pagesListAtom = atom<Page[]>([]);
export const switchPageFnAtom = atom<((targetPageId: string) => Promise<void>) | null>(null);
