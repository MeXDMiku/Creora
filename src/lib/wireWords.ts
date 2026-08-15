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
  validate: 'check the rules on',
  setLoading: 'show as busy',
  clearLoading: 'stop showing as busy',
  setDisabled: 'switch off',
  setEnabled: 'switch on',
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
}

/**
 * The whole wire, as one line.
 *
 *   "When Button 1 is pressed → add a row to Submissions"
 *
 * Names, not ids. A sentence that says `buttonBlock__1426237deb` teaches
 * nothing, and the block names are right there.
 */
export function wireSentence(parts: WireSentenceParts): string {
  const source = (parts.sourceName || 'this').trim() || 'this';
  const target = (parts.targetName || 'that').trim() || 'that';
  const sentence =
    'When ' + source + ' ' + eventWords(parts.event) + ' → ' + actionWords(parts.action) + ' ' + target;
  return parts.conditional ? sentence + ', but only sometimes' : sentence;
}
