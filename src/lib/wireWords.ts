/**
 * Saying, in a sentence, what a wire does.
 *
 * WHY
 * The Configure Action popup was headed "Configure Action" and said nothing
 * else. You drag a wire, a form appears, and you have to reconstruct from
 * memory which two blocks it is about and what the thing you are building will
 * actually do. The owner spent an evening on a wire that could not work, partly
 * for that reason.
 *
 * A sentence in the product's own words, updating as the action changes, means
 * you can tell whether you are building the thing you meant before filling in a
 * single field.
 *
 * Also: `#`, `T`, `?` and `DB` on the ports are a code somebody has to learn.
 * They become words here.
 */

/**
 * The words on the ports themselves.
 *
 * Written out in each block's JSX rather than imported, because a `title`
 * attribute cannot be a call in seventeen files without seventeen imports. They
 * are kept honest by a check that every port in every block carries one --
 * hoping they stay in step is how three block types went unsaveable.
 */
export const PORT_OUT_HINT =
  'Drag from here to another block: this hands over its value and makes that block react';
export const PORT_IN_HINT = 'Something wired into here makes this block react';

/**
 * A BRANCH'S PORTS MEAN SOMETHING ELSE, SO THEY SAY SOMETHING ELSE.
 *
 * "hands over its value" is not true of them: a branch hands over the TRIGGER it
 * was given, down one side or the other, and which side is the only fact worth
 * putting in a tooltip. Kept here rather than written loose in the block, so the
 * check that every port is labelled counts these too -- the rule is that every
 * port is labelled from one vocabulary, not that every port says one sentence.
 */
export const PORT_IF_HINT = 'Runs when the question is true';
export const PORT_ELSE_HINT = 'Runs when the question is not true';
export const PORT_BRANCH_IN_HINT = 'Something wired into here makes this block work out its question';

/** Every sentence a port may carry, so a check can count them without a list of its own. */
export const PORT_OUT_HINTS = [PORT_OUT_HINT, PORT_IF_HINT, PORT_ELSE_HINT] as const;
export const PORT_IN_HINTS = [PORT_IN_HINT, PORT_BRANCH_IN_HINT] as const;

/** What an output port hands over, in words. */
export function outputMeaning(dataType: string | null | undefined): string {
  switch (dataType) {
    case 'number':
      return 'gives a number';
    case 'string':
      return 'gives text';
    case 'boolean':
      return 'gives yes or no';
    case 'database':
      return 'gives the table';
    case 'trigger':
      return 'fires when it happens';
    default:
      return 'gives its value';
  }
}

/** What an input port accepts. Always the same, because a wire is always a trigger. */
export function inputMeaning(): string {
  return 'runs when something fires into it';
}

const EVENT_WORDS: Record<string, string> = {
  onClick: 'is pressed',
  onChange: 'changes',
  onTick: 'ticks',
  onComplete: 'reaches zero',
  onLoad: 'the page opens',
};

/** "is pressed", "changes". Falls back to something readable rather than the raw name. */
export function eventWords(event: string | null | undefined): string {
  return EVENT_WORDS[String(event || '')] || 'happens';
}

const ACTION_WORDS: Record<string, string> = {
  increment: 'add to',
  decrement: 'take away from',
  set: 'set',
  setText: 'set the words in',
  toggle: 'flip',
  reset: 'reset',
  turnOn: 'turn on',
  turnOff: 'turn off',
  setVisible: 'show',
  setHidden: 'hide',
  addRow: 'add a row to',
  updateRow: 'change a row in',
  deleteRow: 'remove a row from',
  exportCsv: 'download',
  sendWebhook: 'send',
  goToPage: 'go to',
  openUrl: 'open',
  // The one action that reaches the STORE, and the one with no words for two
  // months: every wire that ran a compiled action read back "-> runAction X".
  runAction: 'run',
  // "run" alone is the block; "run an action" is the one at the store.
  run: 'set off',
  validate: 'check the rules on',
  setLoading: 'show as busy',
  clearLoading: 'stop showing as busy',
  setDisabled: 'switch off',
  setEnabled: 'switch on',
  refresh: 'refresh',
};

export function actionWords(action: string | null | undefined): string {
  return ACTION_WORDS[String(action || '')] || String(action || 'do something to');
}

export interface WireSentenceParts {
  sourceName: string;
  targetName: string;
  event: string;
  action: string;
  /** Set when the action is only conditional, so the sentence can admit it. */
  conditional?: boolean;
  /**
   * The popup's live sentence is built before the workflow exists, so it has a
   * checkbox rather than a saved `event`. Treated exactly as `event: 'onLoad'`.
   */
  pageLoad?: boolean;
  /**
   * Where a `goToPage` or `openUrl` step actually goes.
   *
   * Those two ignore their target block entirely -- the destination rides in
   * the step's `value` -- so a sentence built from targetName says the wrong
   * thing with total confidence. Seen on screen: dragging Button 1 to a
   * Submissions table and choosing "Go to another page" read
   * "When Button 1 is pressed -> go to Submissions", naming a table it will
   * never open. Checks could not catch that; it took looking at it.
   */
  destinationName?: string;
}

/**
 * The whole wire, as one line.
 *
 *   "When Button 1 is pressed → add a row to Submissions"
 *
 * Names, not ids. A sentence that says `buttonBlock__1426237deb` teaches
 * nothing, and the block names are right there.
 */
/** Actions whose sentence must name where they GO, not what they were dragged to. */
const GOES_SOMEWHERE = new Set(['goToPage', 'openUrl']);

export function wireSentence(parts: WireSentenceParts): string {
  const source = (parts.sourceName || 'this').trim() || 'this';
  const target = GOES_SOMEWHERE.has(parts.action)
    ? (parts.destinationName || '').trim() ||
      (parts.action === 'goToPage' ? 'no page yet' : 'no address yet')
    : (parts.targetName || 'that').trim() || 'that';
  const sentence =
    // "When Submit the page opens" reads as nonsense, and the source block is
    // genuinely irrelevant for onLoad -- it only anchors the workflow. So the
    // sentence drops it rather than printing something no one would say.
    parts.event === 'onLoad' || parts.pageLoad
      ? 'When the page opens → ' + actionWords(parts.action) + ' ' + target
      : 'When ' + source + ' ' + eventWords(parts.event) + ' → ' + actionWords(parts.action) + ' ' + target;
  return parts.conditional ? sentence + ', but only sometimes' : sentence;
}
