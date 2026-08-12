import type { BlockRuntimeState } from '../types/creora';

/**
 * Single source of truth for block node types, their IDs, and their defaults.
 *
 * WHY THIS FILE EXISTS
 * Block IDs used to be hardcoded fixtures (`test_btn_1`, `test_btn_2`), which
 * capped every page at two blocks per type and made a block ID non-unique
 * across pages. They were also load-bearing: block type was inferred by
 * substring-matching the ID (`id.includes('db')`), so an ID was secretly
 * carrying type information.
 *
 * IDs are now `<nodeType>__<random>`, so the type is recoverable exactly
 * rather than guessed. Legacy `test_*` IDs still resolve through the
 * heuristic below, which reproduces the old behaviour exactly.
 */

export const BLOCK_NODE_TYPES = [
  'buttonBlock',
  'numberDisplayBlock',
  'toggleBlock',
  'inputBlock',
  'textLabelBlock',
  'formulaDisplayBlock',
  'timerBlock',
  'historyChartBlock',
  'databaseBlock',
  'listBlock',
  'shapeBlock',
  'dataSourceBlock',
  'customHtmlBlock',
] as const;

export type BlockNodeType = (typeof BLOCK_NODE_TYPES)[number];

const ID_SEPARATOR = '__';

function randomSuffix(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  }
  return Math.random().toString(36).slice(2, 12).padEnd(10, '0');
}

/** Unique, type-tagged block ID. e.g. "buttonBlock__3f9a2c7b41" */
export function newBlockId(nodeType: BlockNodeType): string {
  return `${nodeType}${ID_SEPARATOR}${randomSuffix()}`;
}

/**
 * Legacy fallback for IDs created before Step 1 (`test_btn_1`, `test_db_2`, ...).
 * Order is deliberate and reproduces the original substring checks in atoms.ts.
 */
function legacyNodeTypeFromId(blockId: string): BlockNodeType | null {
  const id = blockId.toLowerCase();
  if (id.includes('chart') || id.includes('history')) return 'historyChartBlock';
  if (id.includes('shp') || id.includes('shape')) return 'shapeBlock';
  if (id.includes('tgl') || id.includes('toggle')) return 'toggleBlock';
  if (id.includes('tmr') || id.includes('timer')) return 'timerBlock';
  if (id.includes('inp') || id.includes('input')) return 'inputBlock';
  if (id.includes('lbl') || id.includes('label')) return 'textLabelBlock';
  if (id.includes('frm') || id.includes('formula')) return 'formulaDisplayBlock';
  if (id.includes('list')) return 'listBlock';
  if (id.includes('db') || id.includes('database')) return 'databaseBlock';
  if (id.includes('btn') || id.includes('button')) return 'buttonBlock';
  if (id.includes('num')) return 'numberDisplayBlock';
  return null;
}

/** Exact for new IDs, heuristic for legacy ones, null if unknowable. */
export function nodeTypeFromBlockId(blockId: string): BlockNodeType | null {
  const sep = blockId.indexOf(ID_SEPARATOR);
  if (sep > 0) {
    const prefix = blockId.slice(0, sep) as BlockNodeType;
    if ((BLOCK_NODE_TYPES as readonly string[]).includes(prefix)) return prefix;
  }
  return legacyNodeTypeFromId(blockId);
}

/** The starting `value` for a block, by type. */
export function defaultValueForNodeType(nodeType: BlockNodeType | null): any {
  switch (nodeType) {
    case 'toggleBlock':
    case 'timerBlock':
      return false;
    case 'inputBlock':
    case 'textLabelBlock':
    case 'shapeBlock':
    case 'listBlock':
      return '';
    default:
      return 0;
  }
}

/**
 * Full starting runtime state for a block, by type. Used both by the
 * blockRuntimeAtom default and by insertBlock, so a freshly inserted block and
 * a lazily initialised one can never disagree.
 */
export function defaultRuntimeForNodeType(nodeType: BlockNodeType | null): BlockRuntimeState {
  const base: BlockRuntimeState = {
    value: defaultValueForNodeType(nodeType),
    visible: true,
    disabled: false,
    loading: false,
    error: null,
  };

  switch (nodeType) {
    case 'customHtmlBlock':
      return {
        ...base,
        blockName: 'My design',
        html: "<div style=\"padding:16px;border:2px solid #4f46e5;border-radius:12px;font-family:sans-serif\"><span style=\"font-size:32px;font-weight:700\">{{Count}}</span></div>",
        width: 260,
      };
    case 'dataSourceBlock':
      return {
        ...base,
        blockName: 'Live data',
        url: '',
        refreshMode: 'load',
        refreshSeconds: 60,
        outputPath: '',
        lastResponse: null,
        fetchError: null,
        backgroundColor: '#0f172a',
        textColor: '#ffffff',
        borderRadius: 8,
        width: 240,
        fontSize: 24,
      };
    case 'timerBlock':
      return {
        ...base,
        mode: 'countdown',
        duration: 10,
        autoStart: false,
        backgroundColor: '#10b981',
        textColor: '#ffffff',
      };
    case 'historyChartBlock':
      return {
        ...base,
        trackedBlockId: '',
        history: [],
        backgroundColor: '#1e293b',
        textColor: '#ffffff',
      };
    case 'databaseBlock':
      return {
        ...base,
        columns: [
          { name: 'Name', type: 'text' },
          { name: 'Age', type: 'number' },
        ],
        rows: [],
        outputMode: 'row_count',
        backgroundColor: '#ffffff',
        borderRadius: 8,
      };
    case 'listBlock':
      return {
        ...base,
        trackedBlockId: '',
        backgroundColor: '#ffffff',
        textColor: '#0f172a',
        borderRadius: 8,
      };
    case 'shapeBlock':
      return {
        ...base,
        text: '',
        role: null,
        backgroundColor: '#3b82f6',
        textColor: '#ffffff',
        borderRadius: 8,
        width: 120,
        height: 60,
      };
    default:
      return base;
  }
}

/** Extra TipTap node attrs a freshly inserted block needs beyond blockId. */
export function defaultAttrsForNodeType(nodeType: BlockNodeType): Record<string, any> {
  if (nodeType === 'buttonBlock') return { label: 'Button' };
  return {};
}

/** Approximate footprint used for non-overlapping placement of new blocks. */
export const BLOCK_FOOTPRINT = { width: 200, height: 90 };

/**
 * Short, human-readable form of a block ID for dropdowns and labels.
 * "buttonBlock__3f9a2c7b41" -> "7b41";  legacy "test_btn_1" -> "test_btn_1".
 */
export function shortBlockId(blockId: string): string {
  const sep = blockId.indexOf(ID_SEPARATOR);
  if (sep > 0) return blockId.slice(-4);
  return blockId;
}
