import type { ValidationRule } from '../lib/validation';
export type { ValidationRule };

/**
 * What a block is called inside a `.creora` file.
 *
 * This union stopped at ten while the product grew to seventeen block types,
 * and the exporter quietly wrote every unlisted one as 'text'. The names live
 * in PORTABLE_TYPE_BY_NODE_TYPE in lib/blockRegistry.ts, which is the single
 * table both the exporter and the importer read; this union is that table's
 * value type written out, and the two are held together by a check.
 */
export type BlockType =
  | 'button'
  | 'number'
  | 'formula'
  | 'toggle'
  | 'input'
  | 'text'
  | 'timer'
  | 'chart'
  | 'database'
  | 'list'
  | 'shape'
  | 'dataSource'
  | 'customHtml'
  | 'visitor'
  | 'image'
  | 'repeat'
  | 'pageValue';

export type ConditionOperator =
  | 'is ON' | 'is OFF' | 'is_ON' | 'is_OFF'
  | 'equals' | 'notEquals'
  | 'greaterThan' | 'greater than' | 'lessThan' | 'less than'
  | 'greaterOrEqual' | 'lessOrEqual'
  | 'contains' | 'notContains'
  | 'isEmpty' | 'isNotEmpty'
  // Asks the block's own rules, not its value. "Only submit if the email field
  // is actually an email" needs this and cannot be said with the operators above.
  | 'isValid' | 'isInvalid';

export interface StepCondition {
  fieldId: string;
  operator: ConditionOperator;
  value?: any;
  /**
   * A whole formula instead of one field-operator-value row.
   *
   * When this is set the other three are ignored. It exists because a condition
   * could only ever compare ONE block against ONE fixed value, so "only submit
   * when the order is over 500" -- Qty times Price -- was not sayable at all,
   * no matter how many conditions were added. The formula language already
   * knew how to say it; conditions just had no way to ask.
   */
  expression?: string;
}

export interface WorkflowStep {
  targetId: string;
  action:
    | 'increment' | 'decrement' | 'set' | 'toggle' | 'reset'
    | 'setVisible' | 'setHidden'
    | 'addRow' | 'updateRow' | 'deleteRow'
    | 'exportCsv' | 'sendWebhook'
    // --- going somewhere ---
    // Cut deliberately in cycle 8 with a condition written into BACKLOG.md:
    // "worth doing only when something genuinely needs CONDITIONAL navigation".
    // onLoad and formula conditions both landed today, so gating a page on who
    // is looking at it, and redirecting after a form is submitted, are now
    // ordinary things to want and impossible to say.
    //
    // As a STEP rather than a block setting, it also fixes the race recorded on
    // 11 Aug: a Button with a target page navigated so fast that its own
    // increment never saved. A step runs in order, after the row is written.
    | 'goToPage' | 'openUrl'
    // --- Form states ---
    // `validate` shows the errors that were already true but hidden: a field is
    // only marked touched once, so a page does not shout at someone the moment
    // it loads. Pressing submit is what makes every field touched at once.
    // Text out of other values: "Hello {{First}}", with filters.
    | 'setText'
    | 'validate'
    | 'setLoading' | 'clearLoading'
    | 'setDisabled' | 'setEnabled';
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
  /**
   * Refuse to run this step when a field it reads is invalid.
   *
   * Defaults to ON for row-writing actions, which is the safe default and not a
   * ceiling: the checkbox is right there in the action popup, so a builder who
   * wants a draft row written from a half-filled form can have one.
   */
  requireValid?: boolean;
  /**
   * Act on every matching row rather than only the first.
   *
   * updateRow and deleteRow both found one row with findIndex and stopped, so
   * "delete all completed", "clear the cart" and "mark everything as read" were
   * not sayable -- pressing the button repeatedly was the workaround, and it
   * only worked if you knew to.
   *
   * Off by default and it must stay that way: a step saved before this existed
   * changed exactly one row, and turning that into "all of them" would rewrite
   * data the next time somebody pressed a button they had been pressing for
   * weeks.
   */
  applyToAll?: boolean;
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

/**
 * `onLoad` is the page opening, and it is the last of the four primitives the
 * record named as missing -- `when a value changes`, `for each row`, `on page
 * load`, `every N seconds`. The other three arrived; this one was recorded as
 * closed by the Live Data block, which was an overclaim: that block refreshes
 * ITSELF on open and on a timer. Nothing else on the page could run when the
 * page opened, so a page could not set itself up, greet a visitor, or decide
 * what to show before being touched.
 *
 * A workflow still hangs off a source block, because the whole engine is built
 * that way and inventing a page-shaped trigger source would mean a second kind
 * of workflow. The block simply anchors it: "when the page opens -> set Total
 * to 0" is a workflow whose source happens to be Total.
 */
export type TriggerEvent = 'onClick' | 'onChange' | 'onTick' | 'onComplete' | 'onLoad';

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
  columns?: { name: string; type: ColumnType; unique?: boolean }[];
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
  columns?: { name: string; type: ColumnType; unique?: boolean }[];
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
  /** Raw CSS declarations the builder wrote, merged last so they win. */
  customCss?: string;
  /** The builder's own markup. Values go in {{Block Name}} slots. */
  html?: string;
  /** Which fact about the current visitor a Visitor block emits. */
  visitorField?: string;
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
  // --- Validation and form states ---
  /** Ordered. The first rule that fails is the message shown. */
  rules?: ValidationRule[];
  /** When to check. 'blur' by default: complaining mid-word is hostile. */
  validateOn?: 'change' | 'blur' | 'submit';
  /** Has this field been visited or submitted yet? Errors stay hidden until it has. */
  touched?: boolean;
  /**
   * Kept apart from `error` on purpose. `error` is the formula channel, and one
   * shared field would mean a formula failure and a bad email overwriting each
   * other with no way to tell which was which.
   */
  validationError?: string | null;
  /** The grey hint inside an empty field. */
  placeholder?: string;
  /** What kind of field this Input is. See src/lib/fields.ts. */
  fieldType?: string;
  /** The choices, one per line, for dropdown / radio / checkboxes. */
  options?: string;
  /**
   * How tall a several-lines field is. Named `lines` and not `rows` because
   * `rows` on this same interface is a Database's data, and one of them would
   * have quietly won.
   */
  lines?: number;
  /** The builder can turn our error line off entirely and show it their own way. */
  showErrorText?: boolean;
  errorColor?: string;
  /** What a button says while it is busy. Blank keeps the normal label. */
  busyText?: string;
  // --- Image ---
  /** What the picture is, for someone who cannot see it. */
  alt?: string;
  /** How the picture fills its box. 'cover' crops, 'contain' letterboxes. */
  objectFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  /** Can a visitor to the published page replace this picture? */
  allowVisitorUpload?: boolean;
  /** The words on the upload area. Blank uses ours. */
  uploadHint?: string;
  /** Why the last upload did not work, in words. Never saved. */
  uploadError?: string | null;
  // --- For each row ---
  /** Which column orders the rows. Blank keeps the order they arrived in. */
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  /** Show at most this many. Blank means all of them, up to the safety ceiling. */
  maxRows?: number;
  /** One row's markup, with {{Column}} slots. Repeated per row. */
  rowHtml?: string;
  /** What to show when no rows match. A list with nothing in it must say so. */
  emptyHtml?: string;
  /** 'list' stacks them, 'grid' lays them out in columns. */
  layout?: 'list' | 'grid';
  /** How many across, in grid layout. */
  gridColumns?: number;
  /** Space between rows, in pixels. */
  gap?: number;
  /** Clicking a row puts that row's value for this column into this block. */
  clickColumn?: string;
  // --- Search, filter, sort, paginate: the live half ---
  /** Which block holds the text a visitor is searching for. */
  searchBlockId?: string;
  /** Columns the search looks at. Empty means all of them. */
  searchColumns?: string[];
  /** Any operator from conditions.ts. Defaults to equals. */
  filterOperator?: string;
  /** Take the filter's value from this block instead of the fixed one. */
  filterBlockId?: string;
  /**
   * A formula over the row's own columns, e.g. `{{Price}} * {{Qty}} > 500`.
   * Wins over filterColumn/filterOperator/filterValue when set — it says the
   * more specific thing, and silently ANDing them would be a rule nobody wrote.
   */
  filterFormula?: string;
  /** A block whose value names the column to sort by. */
  sortColumnBlockId?: string;
  /** A block -- usually a Toggle -- where true means last-to-first. */
  sortDirectionBlockId?: string;
  /** Rows per page. Zero or blank means no paging. */
  pageSize?: number;
  /** Draw the built-in Previous / Next row. Off means build your own. */
  showPager?: boolean;
  prevLabel?: string;
  nextLabel?: string;
  // --- Page value: what this page was opened with ---
  /** Which named value in the address this block reads. */
  paramName?: string;
  /** Stood in for while designing, when there is no address at all. */
  previewValue?: string;
  /** Used on a real page when the address does not carry that value. */
  fallbackValue?: string;
  // --- Opening another page with values ---
  /** Clicking a row opens this page. */
  clickTargetPageId?: string;
  /** What to carry, e.g. "id={{Row id}}&tab=details". Filled per row. */
  clickParams?: string;
  /** What a Button carries when it navigates. Same shape. */
  targetParams?: string;
}

/**
 * What a column holds.
 *
 * `date` arrived last, after the formula language learned to ask questions
 * about dates -- daysUntil, isBefore, "three days left". Those functions were
 * shipped against data the product could not store: a booking's date was a TEXT
 * column, so it sorted alphabetically ("17 Aug" before "2 Sep") and every
 * formula reading it depended on whoever typed it choosing a shape the parser
 * happened to understand.
 *
 * A date column stores ISO text. Not a Date object -- rows are JSON in a jsonb
 * column and go through a save, a load, a CSV export and an import, and a Date
 * survives none of those. ISO survives all of them, sorts correctly as plain
 * text, and is what every date function here already reads.
 */
export type ColumnType = 'text' | 'number' | 'boolean' | 'date';

export interface DatabaseField {
  id: string;
  name: string;
  type: ColumnType;
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
