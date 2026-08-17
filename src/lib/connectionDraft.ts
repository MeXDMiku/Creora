/**
 * Guessing which block a column wants.
 *
 * WHY THIS EXISTS
 * Wiring a button into a Database, every column starts as "Fixed value" with
 * nothing in it -- which is the one thing almost nobody wants. To get a typed
 * value into a column you had to know to change the source to "From block" and
 * then pick the right one, per column, with no hint that this was the step you
 * were missing. The owner's words: "how do a user know if I type something
 * should be updated in the database, its so damn hard figuring out and finding
 * no way to do it".
 *
 * So the columns arrive already filled in with the fields that obviously belong
 * to them, and the builder changes the ones that are wrong. A guess that is
 * right most of the time and visible when it is not beats a blank that is
 * wrong every time and looks deliberate.
 */

/** Letters and digits only, lowercased. "Your name " and "NAME" both become "name". */
export function normaliseName(value: string | null | undefined): string {
  return (value === null || value === undefined ? '' : String(value))
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export interface Candidate {
  id: string;
  label: string;
  /** Only fields a person types into are worth guessing from. */
  dataType?: string;
  type?: string;
}

/**
 * How well a block's name answers to a column's name, 0 when it does not.
 *
 * Exact beats contains beats nothing. "Your name" -> Name scores as contains,
 * which is exactly the shape of every label anybody writes.
 */
export function matchScore(columnName: string, blockLabel: string): number {
  const column = normaliseName(columnName);
  const block = normaliseName(blockLabel);
  if (!column || !block) return 0;
  if (column === block) return 3;
  if (block.includes(column)) return 2;
  if (column.includes(block)) return 1;
  return 0;
}

/**
 * A mapping per column, guessed from the blocks on the page.
 *
 * Each block is used at most once: two columns both grabbing the same input is
 * worse than one column left blank, because it looks like it worked. Best
 * matches are assigned first so "Name" wins the name field before "Nickname"
 * can take it.
 */
export function guessMappings(
  columns: { name: string }[],
  candidates: Candidate[]
): Record<string, { source: 'fixed' | 'block'; value: string }> {
  const out: Record<string, { source: 'fixed' | 'block'; value: string }> = {};
  for (const column of columns) out[column.name] = { source: 'fixed', value: '' };

  const pairs: { column: string; id: string; score: number }[] = [];
  for (const column of columns) {
    for (const candidate of candidates) {
      const score = matchScore(column.name, candidate.label);
      if (score > 0) pairs.push({ column: column.name, id: candidate.id, score });
    }
  }
  pairs.sort((a, b) => b.score - a.score || a.column.localeCompare(b.column));

  const usedBlocks = new Set<string>();
  const filledColumns = new Set<string>();
  for (const pair of pairs) {
    if (usedBlocks.has(pair.id) || filledColumns.has(pair.column)) continue;
    out[pair.column] = { source: 'block', value: pair.id };
    usedBlocks.add(pair.id);
    filledColumns.add(pair.column);
  }
  return out;
}

export interface StepDraft {
  action: string;
  mappings?: Record<string, { source: 'fixed' | 'block'; value: string }>;
  matchColumn?: string;
  matchValue?: { source: 'fixed' | 'block'; value: string };
  webhookUrl?: string;
  value?: string;
}

/**
 * Why this action cannot possibly do anything, or null.
 *
 * The popup used to accept anything. The owner built an Update Row with no
 * value to match on and every column empty, pressed Connect, and got a wire
 * that looked real and did nothing -- no error, no run-log entry that meant
 * anything, no way to tell. Refusing to create it, and saying why, is the
 * difference between a tool and a form.
 */
export function whyItCannotWork(draft: StepDraft): string | null {
  const filled = (m?: { source: string; value: string }) =>
    !!m && String(m.value ?? '').trim() !== '';

  if (draft.action === 'addRow') {
    const mapped = Object.values(draft.mappings || {}).filter(filled);
    if (mapped.length === 0) {
      return 'Every column is empty, so this would add a blank row. Point at least one column at a field, or type a fixed value into it.';
    }
    return null;
  }

  if (draft.action === 'updateRow' || draft.action === 'deleteRow') {
    if (!draft.matchColumn) {
      return 'Nothing says WHICH row to change. Choose a column to find it by.';
    }
    if (!filled(draft.matchValue)) {
      return 'Nothing says which row to find. "' + draft.matchColumn + ' equals ..." has no value, so it will never match anything.';
    }
    if (draft.action === 'updateRow') {
      const mapped = Object.values(draft.mappings || {}).filter(filled);
      if (mapped.length === 0) {
        return 'It finds the row and then changes nothing. Fill in at least one column.';
      }
    }
    return null;
  }

  if (draft.action === 'sendWebhook' && !String(draft.webhookUrl ?? '').trim()) {
    return 'There is nowhere to send it. Paste the address from Zapier, Make or n8n.';
  }

  if (draft.action === 'setText' && !String(draft.value ?? '').trim()) {
    return 'There are no words to set it to.';
  }

  // A step that goes nowhere looks identical to one that works until it is
  // pressed, which is the whole reason this function exists.
  if (draft.action === 'goToPage' && !String(draft.value ?? '').trim()) {
    return 'No page is chosen, so this would go nowhere.';
  }
  if (draft.action === 'openUrl' && !String(draft.value ?? '').trim()) {
    return 'There is no address to open.';
  }

  return null;
}

/**
 * An existing wire, read back into the fields the popup shows.
 *
 * WHY THIS EXISTS
 * A wire could only be deleted. There was one option on its menu and it was
 * "Delete". So changing "add a row" into "add a row, but only if the email is
 * filled in" meant removing the wire and rebuilding it: the action, every
 * column mapping, the match column, every condition, the otherwise branch --
 * all retyped from memory, because nothing on screen still showed them.
 *
 * WHY IT IS A PURE FUNCTION AND NOT A PILE OF SETTERS
 * The dangerous failure here is not a crash. It is one field that quietly does
 * not come back: a builder opens a wire, changes the action, presses Connect,
 * and the three conditions they wrote last week are gone with no warning. That
 * is unnoticeable until it has already happened, and it is the same shape as
 * every silent-loss bug in this project's record.
 *
 * So the reading direction is one function with one job, and a check feeds it a
 * step carrying EVERY field the popup can produce and asserts each one comes
 * back. A field added to the popup without a line here fails that check.
 */

export interface WireDraft {
  action: string;
  amount: number;
  /** Always the string form, because that is what the input holds. */
  value: string;
  requireValid: boolean | undefined;
  webhookUrl: string;
  mappings: Record<string, { source: 'fixed' | 'block'; value: string }>;
  matchColumn: string;
  matchValueSource: 'fixed' | 'block';
  matchValueVal: string;
  applyToAll: boolean;
  isConditional: boolean;
  matchMode: 'all' | 'any';
  conds: { fieldId: string; operator: string; value: string; expression?: string }[];
  elseEnabled: boolean;
  elseAction: string;
  elseTargetId: string;
  elseValue: string;
  elseAmount: number;
  onPageLoad: boolean;
  timerEvent: 'onTick' | 'onComplete';
  goToPageId: string;
  openUrlValue: string;
}

/** The sentinel the field dropdown uses to mean "this condition is a formula". */
export const EXPRESSION_CONDITION = '__expression__';

const str = (v: any) => (v === undefined || v === null ? '' : String(v));

export function draftFromWorkflow(workflow: any): WireDraft {
  const step = (workflow?.steps || [])[0] || {};
  const action = str(step.action) || 'increment';
  const event = str(workflow?.sourceEvent);

  /**
   * `conditions` wins when present, `condition` is the older single shape, and
   * a row counts as real if it has EITHER a field or an expression -- the same
   * test the engine and the Health panel use. Reading only `fieldId` here would
   * drop every formula condition on load, which is exactly how two other places
   * in this codebase lost them.
   */
  const isReal = (c: any) => !!c && (!!c.fieldId || str(c.expression).trim() !== '');
  const rawConds: any[] =
    Array.isArray(step.conditions) && step.conditions.filter(isReal).length
      ? step.conditions.filter(isReal)
      : isReal(step.condition)
        ? [step.condition]
        : [];

  const conds = rawConds.map((c: any) =>
    str(c.expression).trim() !== ''
      ? { fieldId: EXPRESSION_CONDITION, operator: 'equals', value: '', expression: str(c.expression) }
      : { fieldId: str(c.fieldId), operator: str(c.operator) || 'equals', value: str(c.value), expression: '' },
  );

  return {
    action,
    amount: typeof step.amount === 'number' ? step.amount : 1,
    // Navigation keeps its destination in `value`, and those have their own
    // fields below -- leaving it here too would show a page id in the "set to"
    // box the moment somebody switched action.
    value: action === 'goToPage' || action === 'openUrl' ? '' : str(step.value),
    // undefined means "whatever this action defaults to", and that distinction
    // has to survive: pre-filling it would freeze today's default onto a step
    // for ever.
    requireValid: typeof step.requireValid === 'boolean' ? step.requireValid : undefined,
    webhookUrl: str(step.webhookUrl),
    mappings: (step.mappings && typeof step.mappings === 'object' ? step.mappings : {}) as WireDraft['mappings'],
    matchColumn: str(step.matchColumn),
    matchValueSource: step.matchValue?.source === 'block' ? 'block' : 'fixed',
    matchValueVal: str(step.matchValue?.value),
    applyToAll: step.applyToAll === true,
    isConditional: conds.length > 0,
    matchMode: step.match === 'any' ? 'any' : 'all',
    conds: conds.length ? conds : [{ fieldId: '', operator: 'equals', value: '', expression: '' }],
    elseEnabled: !!step.elseAction,
    elseAction: str(step.elseAction) || 'set',
    elseTargetId: str(step.elseTargetId),
    elseValue: str(step.elseValue),
    elseAmount: typeof step.elseAmount === 'number' ? step.elseAmount : 1,
    onPageLoad: event === 'onLoad',
    timerEvent: event === 'onComplete' ? 'onComplete' : 'onTick',
    goToPageId: action === 'goToPage' ? str(step.value) : '',
    openUrlValue: action === 'openUrl' ? str(step.value) : '',
  };
}

/**
 * A popup showing nothing yet.
 *
 * WHY THIS EXISTS RATHER THAN LETTING THE FIELDS KEEP THEIR VALUES
 * The popup returns null when there is no wire pending, and returning null does
 * not unmount a component -- every useState survives. So the fields carried
 * over from one opening to the next, and once an EXISTING wire could be loaded
 * that stopped being untidy and became wrong: change a wire with three
 * conditions, cancel, draw a fresh wire between two other blocks, and the popup
 * opened already holding those three conditions and the old action.
 *
 * Both openings go through the same WireDraft now -- an existing wire through
 * draftFromWorkflow, a new one through here -- so a field can never be
 * hydrated-but-not-reset or the other way round. A check asserts the two
 * produce the same set of keys, which is what makes that guarantee hold when
 * somebody adds a field later.
 */
export function defaultWireDraft(): WireDraft {
  return {
    action: 'increment',
    amount: 1,
    value: '',
    // undefined, not false: "whatever this action defaults to" is a real third
    // state and flattening it here would freeze today's default onto new steps.
    requireValid: undefined,
    webhookUrl: '',
    mappings: {},
    matchColumn: '',
    matchValueSource: 'fixed',
    matchValueVal: '',
    applyToAll: false,
    isConditional: false,
    matchMode: 'all',
    conds: [{ fieldId: '', operator: 'equals', value: '', expression: '' }],
    elseEnabled: false,
    elseAction: 'set',
    elseTargetId: '',
    elseValue: '',
    elseAmount: 1,
    onPageLoad: false,
    timerEvent: 'onTick',
    goToPageId: '',
    openUrlValue: '',
  };
}
