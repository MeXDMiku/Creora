export type BlockType = 
  | 'button'
  | 'number'
  | 'toggle'
  | 'input'
  | 'text'
  | 'timer'
  | 'chart'
  | 'database'
  | 'list'
  | 'shape';

export type ConditionOperator =
  | 'is ON' | 'is OFF' | 'is_ON' | 'is_OFF'
  | 'equals' | 'notEquals'
  | 'greaterThan' | 'greater than' | 'lessThan' | 'less than'
  | 'greaterOrEqual' | 'lessOrEqual'
  | 'contains' | 'notContains'
  | 'isEmpty' | 'isNotEmpty';

export interface StepCondition {
  fieldId: string;
  operator: ConditionOperator;
  value?: any;
}

export interface WorkflowStep {
  targetId: string;
  action: 'increment' | 'decrement' | 'set' | 'toggle' | 'reset' | 'setVisible' | 'setHidden' | 'addRow' | 'updateRow' | 'deleteRow' | 'exportCsv' | 'sendWebhook';
  amount?: number;
  value?: any;
  /** A single condition. Kept because every page saved before conditions[] uses it. */
  condition?: StepCondition | null;
  /**
   * Many conditions, combined by `match`. This is what makes "do it, but not if
   * X, and only if Y" expressible — one condition never could.
   */
  conditions?: StepCondition[];
  /** 'all' = every condition must pass (AND). 'any' = one is enough (OR). Default 'all'. */
  match?: 'all' | 'any';
  mappings?: Record<string, { source: 'fixed' | 'block'; value: string }>;
  matchColumn?: string;
  matchSource?: 'fixed' | 'block';
  /** Matches the shape used by `mappings` — the engine reads .source and .value. */
  matchValue?: { source: 'fixed' | 'block'; value: string };
  /** Where a sendWebhook step posts to. */
  webhookUrl?: string;
  // --- Otherwise: what to do when the conditions do NOT pass ---
  // Real if/else, without needing a second output port on the canvas. The
  // visible branch node is a separate, larger piece of work; this is the
  // capability, which is what a page actually needs.
  elseAction?: WorkflowStep['action'];
  /** Defaults to the step's own targetId when not set. */
  elseTargetId?: string;
  elseValue?: any;
  elseAmount?: number;
}

export type TriggerEvent = 'onClick' | 'onChange' | 'onTick' | 'onComplete';

export interface Workflow {
  id: string;
  sourceId: string;
  sourceEvent: TriggerEvent;
  steps: WorkflowStep[];
  permission?: 'public' | 'authenticated' | 'author' | 'admin';
}

export interface Connection {
  id: string;
  sourceBlockId: string;
  targetBlockId: string;
}

export interface StyleConfig {
  backgroundColor?: string;
  color?: string;
  borderRadius?: number;
  fontSize?: number;
  fontWeight?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  opacity?: number;
  width?: number | string;
  height?: number | string;
  borderWidth?: number;
  borderColor?: string;
  borderStyle?: string;
  shadow?: string | null;
}

export interface AnimationConfig {
  hoverScale?: number;
  clickScale?: number;
  entrance?: string;
  entranceDuration?: number;
  entranceDelay?: number;
  entranceTrigger?: string;
  hover?: any;
  click?: any;
}

export interface BlockProps {
  blockName?: string;
  label?: string;
  defaultValue?: any;
  trackedBlockId?: string;
  history?: number[];
  columns?: { name: string; type: 'text' | 'number' | 'boolean' }[];
  rows?: { id: string; [key: string]: any }[];
  outputMode?: string;
  targetPageId?: string;
}

export interface Block {
  id: string;
  type: BlockType;
  props: BlockProps;
  styles: StyleConfig;
  animations?: AnimationConfig;
  // Written by the .creora exporter, which serialises more than the editor
  // keeps in memory.
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  parentId?: string | null;
  children?: any[];
  pageId?: string;
}

export interface Page {
  id: string;
  /** Never set at runtime — the app and the .creora file both use `name`. */
  title?: string;
  /** Display name used by the tab bar and the .creora file. */
  name?: string;
  route?: string;
  layoutTemplateId?: string | null;
  databases?: any[];
  blocks: Block[];
  workflows: Workflow[];
  formulas?: FormulaBinding[];
}

export interface CreoraFile {
  version: string;
  activePageId?: string;
  pages: Page[];
  metadata?: Record<string, any>;
  layoutTemplates?: any[];
}

export interface FormulaBinding {
  id: string;
  targetBlockId: string;
  targetProperty: 'value';
  formula: string;
  pageId: string;
}

export interface BlockRuntimeState {
  blockName?: string;
  value: any;
  visible: boolean;
  disabled: boolean;
  loading: boolean;
  error: string | null;
  backgroundColor?: string;
  borderRadius?: number;
  min?: number;
  max?: number;
  opacity?: number;
  width?: number;
  height?: number;
  text?: string;
  role?: string | null;
  fontSize?: number;
  textColor?: string;
  mode?: 'countdown' | 'interval';
  duration?: number;
  autoStart?: boolean;
  trackedBlockId?: string;
  history?: number[];
  columns?: { name: string; type: 'text' | 'number' | 'boolean' }[];
  rows?: { id: string; [key: string]: any }[];
  outputMode?: string;
  /** Which column sum / average / lowest / highest works on. */
  outputColumn?: string;
  /** Optional "only rows where this column equals this value" - a count with a condition. */
  filterColumn?: string;
  filterValue?: string;
  targetPageId?: string;
  // Style fields the inspector writes and renderBlockStyles reads. These were
  // used at runtime long before they were declared.
  borderWidth?: number;
  borderColor?: string;
  borderStyle?: string;
  boxShadowPreset?: string;
  textAlign?: string;
  /** Animation preset played when this block's value changes. See src/lib/animations.ts */
  animateOnChange?: string;
  // --- Data Source: live data pulled from an API ---
  /** The address to call. */
  url?: string;
  /** 'load' once when the page opens · 'interval' every N seconds · 'trigger' only when wired */
  refreshMode?: 'load' | 'interval' | 'trigger';
  refreshSeconds?: number;
  /** Path into the response that this block emits, chosen from a real fetch. */
  outputPath?: string;
  /** The last response, kept so the picker can show real values. */
  lastResponse?: any;
  lastFetchedAt?: number;
  /** Set when a fetch fails, so a live page never silently shows stale data. */
  fetchError?: string | null;
}

export interface DatabaseField {
  id: string;
  name: string;
  type: 'text' | 'number' | 'boolean';
}

export interface DatabaseRow {
  id: string;
  [key: string]: any;
}

/** What list_pages() actually returns, and what the page tab bar renders. */
export interface PageSummary {
  id: string;
  name: string;
}

/** One row from get_page(). The RPC is untyped, so call sites cast to this. */
export interface PageRow {
  id: string;
  blocks: any;
  workflows: any;
  updated_at: string;
  is_published: boolean;
}
