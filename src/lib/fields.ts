/**
 * What kind of field an Input block is.
 *
 * WHY THIS IS ONE BLOCK AND NOT SIX
 * Dropdown, number, date, long text, radio and checkboxes are the same thing
 * wearing different clothes: something a visitor puts a value into. They differ
 * in how they are drawn and in almost nothing else.
 *
 * Six separate block types would each need validation wiring, error display,
 * required, disabled, busy, placeholder and the touched rule -- all of which the
 * Input block already has and all of which would drift apart the first time one
 * of them was fixed and the others were not. This is the same decision the Shape
 * block made with roles, and the same one the Image block made when its value
 * turned out to be an address.
 *
 * THE VALUE IS ALWAYS A STRING
 * Even for checkboxes, where it is the chosen options joined by a comma. That is
 * deliberate: the operator vocabulary in conditions.ts already has `contains`,
 * so "did they tick Express delivery" works with no new concept, and a Database
 * column holding "a, b" reads correctly in a table and in a CSV. An array would
 * have needed its own operators, its own display rule and its own column type.
 */

export type FieldType =
  | 'text'
  | 'longText'
  | 'number'
  | 'email'
  | 'password'
  | 'date'
  | 'time'
  | 'dropdown'
  | 'radio'
  | 'checkboxes';

export const FIELD_TYPES: {
  type: FieldType;
  label: string;
  /** The browser input type, where one exists. */
  inputType?: string;
  needsOptions?: boolean;
  hint?: string;
}[] = [
  { type: 'text', label: 'One line of text', inputType: 'text' },
  { type: 'longText', label: 'Several lines of text' },
  { type: 'number', label: 'A number', inputType: 'number', hint: 'Gives phones a number keypad, and desktops the little arrows.' },
  { type: 'email', label: 'An email address', inputType: 'email', hint: 'Phones show the @ key. Add the email rule as well if it must be valid.' },
  { type: 'password', label: 'A password', inputType: 'password', hint: 'Hidden as they type. Creora does not store it any differently -- it goes into a row like any other value.' },
  { type: 'date', label: 'A date', inputType: 'date', hint: 'The browser draws its own calendar, which is better than any we would build.' },
  { type: 'time', label: 'A time', inputType: 'time' },
  { type: 'dropdown', label: 'Pick one from a list', needsOptions: true },
  { type: 'radio', label: 'Pick one, all shown', needsOptions: true },
  { type: 'checkboxes', label: 'Pick any number', needsOptions: true, hint: 'The value is the ticked options joined by a comma, so "contains" works on it.' },
];

export function fieldMeta(type: FieldType | undefined) {
  return FIELD_TYPES.find((f) => f.type === (type || 'text')) || FIELD_TYPES[0];
}

export function needsOptions(type: FieldType | undefined): boolean {
  return !!fieldMeta(type).needsOptions;
}

const OPTION_SPLIT = /[\r\n]+/;

/**
 * Read the options a builder typed.
 *
 * One per line, because a comma-separated list cannot contain a comma and
 * somebody will want "Bristol, Avon" as one option on their first afternoon.
 * Blank lines are dropped so a trailing newline is not a blank choice, and
 * duplicates are dropped because two identical options cannot be told apart
 * once they are a value.
 */
export function parseOptions(raw: string | null | undefined): string[] {
  const text = raw === null || raw === undefined ? '' : String(raw);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split(OPTION_SPLIT)) {
    const option = line.trim();
    if (option === '' || seen.has(option)) continue;
    seen.add(option);
    out.push(option);
  }
  return out;
}

/** The ticked options, read back out of the stored value. */
export function parseChosen(value: any): string[] {
  if (value === null || value === undefined) return [];
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v !== '');
}

/**
 * Tick or untick one option, keeping the builder's order rather than the order
 * they were clicked in. A list that reorders itself as you tick things reads as
 * a bug, and the stored value would change without the answer changing.
 */
export function toggleChosen(value: any, option: string, ticked: boolean, options: string[]): string {
  const chosen = new Set(parseChosen(value));
  if (ticked) chosen.add(option);
  else chosen.delete(option);
  return options.filter((o) => chosen.has(o)).join(', ');
}

/**
 * A value that is no longer one of the options is not silently kept.
 *
 * A builder removes "Medium" from a dropdown; a half-filled form still holds it.
 * Leaving it means a value that cannot be re-selected and cannot be explained.
 * Returns the value to keep, which may be empty.
 */
export function pruneToOptions(value: any, type: FieldType | undefined, options: string[]): string {
  if (!needsOptions(type)) return value === null || value === undefined ? '' : String(value);
  if (options.length === 0) return '';
  if (type === 'checkboxes') {
    return options.filter((o) => parseChosen(value).includes(o)).join(', ');
  }
  const single = value === null || value === undefined ? '' : String(value).trim();
  return options.includes(single) ? single : '';
}
