import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import type { Workflow, FormulaBinding, Page, BlockRuntimeState } from '../types/creora';

export function getBlockDefaultValue(identifier: string): any {
  const id = identifier.toLowerCase();
  if (id.includes('tgl') || id.includes('toggle')) return false;
  if (id.includes('inp') || id.includes('input') || id.includes('lbl') || id.includes('label')) return '';
  if (id.includes('tmr') || id.includes('timer')) return false;
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
  return 'Block';
}

export function isGarbageName(name: string | undefined | null): boolean {
  if (!name || name.trim() === '') return true;
  if (name.includes('·')) return true;
  return false;
}

export const blockRuntimeAtom = atomFamily((blockId: string) =>
  atom<BlockRuntimeState>({
    value: getBlockDefaultValue(blockId),
    visible: true,
    disabled: false,
    loading: false,
    error: null,
  })
);

export const blockPositionAtom = atomFamily((_blockId: string) => {
  return atom({ x: 100, y: 100 });
});

export const currentPageIdAtom = atom<string | null>(null);

export const urlParamsAtom = atom<Record<string, string>>({});

export const selectedBlockIdAtom = atom<string | null>(null);

export const workflowsAtom = atom<Workflow[]>([]);

export const formulasAtom = atom<FormulaBinding[]>([]);

export const pagesAtom = atom<Page[]>([]);

export const activeWireAtom = atom<{
  sourceBlockId: string;
  sourceX: number;
  sourceY: number;
  currentX: number;
  currentY: number;
} | null>(null);

export const connectionsAtom = atom<{
  id: string;
  sourceBlockId: string;
  targetBlockId: string;
}[]>([]);

export const snapTargetAtom = atom<string | null>(null);

export const pendingConnectionAtom = atom<{
  sourceBlockId: string;
  targetBlockId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
} | null>(null);

export const triggerSaveAtom = atom<number>(0);

export const contextMenuAtom = atom<{
  blockId: string;
  x: number;
  y: number;
  visible: boolean;
} | null>(null);

export const connectionContextMenuAtom = atom<{
  connectionId: string;
  x: number;
  y: number;
  visible: boolean;
} | null>(null);

export const allBlockIdsAtom = atom<string[]>([]);

export type BlockDataType = 'trigger' | 'number' | 'boolean' | 'string' | 'unknown';

export function getBlockDataType(nodeType: string): BlockDataType {
  switch (nodeType) {
    case 'buttonBlock': return 'trigger';
    case 'timerBlock': return 'trigger';
    case 'numberDisplayBlock': return 'number';
    case 'formulaDisplayBlock': return 'number';
    case 'toggleBlock': return 'boolean';
    case 'inputBlock': return 'string';
    case 'textLabelBlock': return 'string';
    default: return 'unknown';
  }
}

export function getPortBadge(dataType: BlockDataType): string {
  switch (dataType) {
    case 'number': return '#';
    case 'string': return 'T';
    case 'boolean': return '?';
    default: return '';
  }
}

