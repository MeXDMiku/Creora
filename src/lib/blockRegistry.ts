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
  'visitorBlock',
  'imageBlock',
  'repeatBlock',
  'pageValueBlock',
] as const;

export type BlockNodeType = (typeof BLOCK_NODE_TYPES)[number];

const NODE_TYPE_SET: ReadonlySet<string> = new Set(BLOCK_NODE_TYPES);

/**
 * "Is this TipTap node one of our blocks?"
 *
 * This existed nine times as a hand-written `name === 'buttonBlock' || ...`
 * chain across App.tsx and atoms.ts, and three of those chains were the save
 * paths. Every block added after those chains were written -- Live Data, My
 * Design, Visitor -- was therefore invisible to saving, to the block-id index
 * and to every dropdown, which meant their settings were thrown away on reload.
 *
 * One list, in the file that already owns the list.
 */
export function isBlockNodeType(name: string | undefined | null): name is BlockNodeType {
  return !!name && NODE_TYPE_SET.has(name);
}

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
    // An Image block's value IS its address. That is the whole design: every
    // action, condition and wire that already works on text works on a picture
    // without a single line written for it.
    case 'imageBlock':
    // A repeater's value is whatever row was last clicked, so it starts empty.
    case 'repeatBlock':
    // A page value is whatever the address carried, so it starts empty too.
    case 'pageValueBlock':
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
    case 'pageValueBlock':
      return {
        ...base,
        blockName: 'Page value',
        value: '',
        paramName: 'id',
        previewValue: '',
        fallbackValue: '',
        backgroundColor: '#0f172a',
        textColor: '#ffffff',
        borderRadius: 8,
        fontSize: 14,
        width: 200,
      };
    case 'repeatBlock':
      return {
        ...base,
        blockName: 'For each row',
        value: '',
        trackedBlockId: '',
        rowHtml:
          '<div style="padding:12px;border:1px solid #e2e8f0;border-radius:10px;font-family:sans-serif">' +
          '<div style="font-weight:600">{{Name}}</div>' +
          '<div style="color:#64748b;font-size:13px">{{Age}}</div>' +
          '</div>',
        emptyHtml: '<div style="color:#64748b;font-family:sans-serif">Nothing here yet.</div>',
        layout: 'list',
        gridColumns: 3,
        gap: 12,
        sortDirection: 'asc',
        filterOperator: 'equals',
        pageSize: 0,
        showPager: true,
        prevLabel: 'Previous',
        nextLabel: 'Next',
        width: 360,
      };
    case 'imageBlock':
      return {
        ...base,
        blockName: 'Image',
        value: '',
        alt: '',
        objectFit: 'cover',
        allowVisitorUpload: false,
        width: 240,
        height: 160,
        borderRadius: 8,
        uploadError: null,
      };
    case 'visitorBlock':
      return {
        ...base,
        blockName: 'Visitor',
        visitorField: 'signedIn',
        value: false,
        backgroundColor: '#334155',
        textColor: '#ffffff',
        borderRadius: 8,
        fontSize: 16,
      };
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

/**
 * Strip the parts of a block's state that belong to one person looking at the
 * page right now, rather than to the page itself.
 *
 * `touched` and `validationError` are the reason this exists: the builder types
 * into their own form while designing it, the field goes red, and without this
 * that red is saved and shown to every visitor before they have typed anything.
 * `loading` is worse -- a page saved mid-send or mid-upload would come back
 * with a button
 * permanently stuck as busy and no way to press it. `fetchError` is the same
 * shape of mistake: last week's failed API call is not a fact about the page.
 *
 * Applied on save AND on load. On save so it is never written; on load so pages
 * that were already saved with it come back clean.
 */
export function withoutVisitorState<T extends Record<string, any>>(
  state: T,
  nodeType?: BlockNodeType | null
): T {
  if (!state || typeof state !== 'object') return state;
  const next: Record<string, any> = { ...state };
  delete next.touched;
  delete next.validationError;
  delete next.fetchError;
  delete next.uploadError;
  next.loading = false;

  /**
   * The value, for the blocks whose value is "whatever the last person typed".
   *
   * This was missed for ten cycles and it was visible on the live site the
   * whole time: a Feedback page served `dsad` and `321dsa` in its two fields,
   * because the builder had typed them while building and the value was saved
   * into the page and restored for every visitor. If they had typed a real
   * email or a private note, it would have been published.
   *
   * It cannot be stripped for everything -- a Number Display's value is the
   * shared count, which is the entire product. Only the blocks a person types
   * or clicks into.
   */
  if (nodeType && VALUE_IS_THE_VISITORS.has(nodeType)) {
    next.value = defaultValueForNodeType(nodeType);
  }
  return next as T;
}

/**
 * Blocks whose value belongs to whoever is looking, not to the page.
 *
 * A repeater's value is the row last clicked -- publishing it means every
 * visitor arrives with somebody else's selection already made.
 */
const VALUE_IS_THE_VISITORS: ReadonlySet<string> = new Set(['inputBlock', 'repeatBlock']);

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

// ---------------------------------------------------------------- .creora I/O
/**
 * The name a block type goes by inside a `.creora` file.
 *
 * WHY THIS EXISTS
 * The exporter and the importer each carried their own hand-written
 * `if (typeName === 'buttonBlock') ... else if ...` chain. The exporter's
 * covered 11 of the 17 block types and initialised its variable to `'text'`,
 * so an Image, a For-each-row, a My Design, a Live Data, a Page value and a
 * Visitor block were every one of them written into the backup file as
 * `type: 'text'`. The importer's chain covered 10 and dropped the rest.
 *
 * That is the same bug as the nine `name === 'buttonBlock' || ...` chains this
 * file was created to kill, wearing `else if` instead of `||` -- which is
 * exactly why the guard in scripts/checks.ts could not see it. It sat in the
 * export format, which is the one thing promised to a builder as theirs.
 *
 * One table. Both directions read it. A block type added to BLOCK_NODE_TYPES
 * without a name here fails to compile, because Record<BlockNodeType, ...>
 * demands every key.
 */
export const PORTABLE_TYPE_BY_NODE_TYPE: Record<BlockNodeType, string> = {
  buttonBlock: 'button',
  numberDisplayBlock: 'number',
  toggleBlock: 'toggle',
  inputBlock: 'input',
  textLabelBlock: 'text',
  formulaDisplayBlock: 'formula',
  timerBlock: 'timer',
  historyChartBlock: 'chart',
  databaseBlock: 'database',
  listBlock: 'list',
  shapeBlock: 'shape',
  dataSourceBlock: 'dataSource',
  customHtmlBlock: 'customHtml',
  visitorBlock: 'visitor',
  imageBlock: 'image',
  repeatBlock: 'repeat',
  pageValueBlock: 'pageValue',
};

const NODE_TYPE_BY_PORTABLE_TYPE: Record<string, BlockNodeType> = Object.fromEntries(
  Object.entries(PORTABLE_TYPE_BY_NODE_TYPE).map(([node, portable]) => [portable, node as BlockNodeType])
) as Record<string, BlockNodeType>;

/** What to call this block inside a `.creora` file. */
export function portableTypeFromNodeType(nodeType: BlockNodeType): string {
  return PORTABLE_TYPE_BY_NODE_TYPE[nodeType];
}

/**
 * Read a `.creora` type name back.
 *
 * `hasFormula` exists for files written before formulaDisplayBlock had a name
 * of its own: every one of them says `number` for both, and the only way to
 * tell them apart is whether a formula targets the block. Files written from
 * now on say `formula` outright and never reach that branch.
 */
export function nodeTypeFromPortableType(
  portableType: string | undefined | null,
  hasFormula = false,
): BlockNodeType | null {
  if (!portableType) return null;
  if (portableType === 'number' && hasFormula) return 'formulaDisplayBlock';
  return NODE_TYPE_BY_PORTABLE_TYPE[portableType] ?? null;
}


/**
 * What a block is called on screen.
 *
 * Was a chain of seventeen `type.includes('button')` tests ending in
 * `return 'Block'`, which is the same shape as the .creora exporter: a
 * hand-written list of seventeen that a new block type silently falls out of.
 * Add a type without a line here and every dropdown, label and inspector header
 * called it "Block" -- no error, no clue, just a page full of blocks all named
 * the same thing.
 *
 * Record<BlockNodeType, string> refuses to compile with one missing.
 */
export const BLOCK_DISPLAY_NAMES: Record<BlockNodeType, string> = {
  buttonBlock: 'Button',
  numberDisplayBlock: 'Number Display',
  toggleBlock: 'Toggle',
  inputBlock: 'Input',
  textLabelBlock: 'Text Label',
  formulaDisplayBlock: 'Formula',
  timerBlock: 'Timer',
  historyChartBlock: 'History Chart',
  databaseBlock: 'Database',
  listBlock: 'List',
  shapeBlock: 'Shape',
  dataSourceBlock: 'Live Data',
  customHtmlBlock: 'My Design',
  visitorBlock: 'Visitor',
  imageBlock: 'Image',
  repeatBlock: 'For each row',
  pageValueBlock: 'Page value',
};
