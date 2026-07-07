import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import type { Workflow, FormulaBinding, Page, BlockRuntimeState } from '../types/creora';

export const blockRuntimeAtom = atomFamily((_blockId: string) =>
  atom<BlockRuntimeState>({
    value: 0,
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

export const allBlockIdsAtom = atom<string[]>([]);

export type BlockDataType = 'trigger' | 'number' | 'boolean' | 'string' | 'unknown';

export function getBlockDataType(nodeType: string): BlockDataType {
  switch (nodeType) {
    case 'buttonBlock': return 'trigger';
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

