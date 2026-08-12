/**
 * Validation rules, and the one function that decides whether a value passes.
 *
 * WHY THIS FILE EXISTS
 * A form without validation is a form that silently writes rubbish into your
 * database. Every other capability in the queue -- collections, sign-in,
 * payments -- writes rows, and this is what stands between a row and a typo.
 *
 * THE RULE THAT SHAPES THE DESIGN
 * A default is never a ceiling. So:
 *   - every rule carries an optional `message`, and the builder's own words
 *     always beat ours;
 *   - the error text is a value the builder can put anywhere, including inside
 *     their own markup, rather than a widget we force underneath the field;
 *   - rules are a list, so a field can require several things at once, and the
 *     list is ordered so the builder controls which complaint is heard first.
 *
 * EMPTY IS ONLY AN ERROR IF YOU SAID SO
 * Any rule other than `required` passes on an empty value. "Optional, but if
 * filled must be an email" is by far the most common shape of an optional
 * field, and it is unexpressible if `email` rejects blank.
 */

export type ValidationRuleType =
  | 'required'
  | 'email'
  | 'number'
  | 'wholeNumber'
  | 'url'
  | 'phone'
  | 'minLength'
  | 'maxLength'
  | 'min'
  | 'max'
  | 'startsWith'
  | 'endsWith'
  | 'pattern'
  | 'matchesBlock';

export interface ValidationRule {
  type: ValidationRuleType;
  /** What the rule is measured against. Unused by `required` / `email` / etc. */
  value?: string | number;
  /** The builder's own wording. Beats the default message. */
  message?: string;
}

/**
 * What the inspector needs to draw a rule row, and what the engine needs to
 * explain a failure. Kept beside the rule itself so adding a rule is one edit
 * in one file rather than four edits in four.
 */
export const RULE_TYPES: {
  type: ValidationRuleType;
  label: string;
  /** Does this rule need a second input next to it? */
  needsValue: boolean;
  valueKind?: 'text' | 'number' | 'block';
  placeholder?: string;
  hint?: string;
}[] = [
  { type: 'required', label: 'Must be filled in', needsValue: false },
  { type: 'email', label: 'Must be an email address', needsValue: false },
  { type: 'number', label: 'Must be a number', needsValue: false },
  { type: 'wholeNumber', label: 'Must be a whole number', needsValue: false },
  { type: 'url', label: 'Must be a web address', needsValue: false },
  { type: 'phone', label: 'Must be a phone number', needsValue: false },
  { type: 'minLength', label: 'At least this many characters', needsValue: true, valueKind: 'number', placeholder: '8' },
  { type: 'maxLength', label: 'At most this many characters', needsValue: true, valueKind: 'number', placeholder: '280' },
  { type: 'min', label: 'Number is at least', needsValue: true, valueKind: 'number', placeholder: '1' },
  { type: 'max', label: 'Number is at most', needsValue: true, valueKind: 'number', placeholder: '100' },
  { type: 'startsWith', label: 'Starts with', needsValue: true, valueKind: 'text', placeholder: '+44' },
  { type: 'endsWith', label: 'Ends with', needsValue: true, valueKind: 'text', placeholder: '.com' },
  {
    type: 'pattern',
    label: 'Matches my own pattern',
    needsValue: true,
    valueKind: 'text',
    placeholder: '^[A-Z]{2}[0-9]{4}$',
    hint: 'A regular expression. This is the escape hatch: if none of the rules above describe your field, describe it yourself.',
  },
  {
    type: 'matchesBlock',
    label: 'Must match another field',
    needsValue: true,
    valueKind: 'block',
    hint: 'For "confirm your email" and "repeat your password".',
  },
];

export function ruleMeta(type: ValidationRuleType) {
  return RULE_TYPES.find((r) => r.type === type);
}

/**
 * The patterns. Deliberately permissive rather than clever.
 *
 * The email one does not attempt RFC 5322. A stricter regex rejects addresses
 * that genuinely work, and a form that refuses a real customer's real email is
 * worse than one that accepts a fake one -- the fake one bounces, the real one
 * leaves.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const URLISH = /^(https?:\/\/)?[^\s.]+\.[^\s]{2,}$/;
/** Digits, with the punctuation people actually type. 7-15 digits per E.164. */
const PHONE_ALLOWED = /^[+()\-.\s\d]+$/;

function asText(value: any): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

export function isBlank(value: any): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function defaultMessage(rule: ValidationRule, fieldName: string): string {
  const field = fieldName || 'This';
  switch (rule.type) {
    case 'required':
      return `${field} is required`;
    case 'email':
      return `${field} must be an email address`;
    case 'number':
      return `${field} must be a number`;
    case 'wholeNumber':
      return `${field} must be a whole number`;
    case 'url':
      return `${field} must be a web address`;
    case 'phone':
      return `${field} must be a phone number`;
    case 'minLength':
      return `${field} must be at least ${rule.value} characters`;
    case 'maxLength':
      return `${field} must be ${rule.value} characters or fewer`;
    case 'min':
      return `${field} must be ${rule.value} or more`;
    case 'max':
      return `${field} must be ${rule.value} or less`;
    case 'startsWith':
      return `${field} must start with ${rule.value}`;
    case 'endsWith':
      return `${field} must end with ${rule.value}`;
    case 'pattern':
      return `${field} is not in the right format`;
    case 'matchesBlock':
      return `${field} does not match`;
    default:
      return `${field} is not valid`;
  }
}

/** True when the value satisfies the rule. Blank passes everything but `required`. */
function passes(value: any, rule: ValidationRule, resolve?: (blockId: string) => any): boolean {
  const blank = isBlank(value);

  if (rule.type === 'required') return !blank;
  // Every other rule describes the shape of a value that is there.
  if (blank) return true;

  const text = asText(value).trim();

  switch (rule.type) {
    case 'email':
      return EMAIL.test(text);
    case 'number':
      return text !== '' && !isNaN(Number(text));
    case 'wholeNumber': {
      const n = Number(text);
      return text !== '' && !isNaN(n) && Number.isInteger(n);
    }
    case 'url':
      return URLISH.test(text);
    case 'phone': {
      if (!PHONE_ALLOWED.test(text)) return false;
      const digits = text.replace(/\D/g, '').length;
      return digits >= 7 && digits <= 15;
    }
    case 'minLength':
      return asText(value).length >= Number(rule.value ?? 0);
    case 'maxLength':
      return asText(value).length <= Number(rule.value ?? Infinity);
    case 'min': {
      const n = Number(text);
      return !isNaN(n) && n >= Number(rule.value ?? -Infinity);
    }
    case 'max': {
      const n = Number(text);
      return !isNaN(n) && n <= Number(rule.value ?? Infinity);
    }
    case 'startsWith':
      return text.startsWith(String(rule.value ?? ''));
    case 'endsWith':
      return text.endsWith(String(rule.value ?? ''));
    case 'pattern': {
      // A bad regex is the builder's typo, not a crash. An unparseable pattern
      // fails open: a field nobody can submit is a worse bug than a field that
      // accepts too much, and the inspector says the pattern is broken.
      try {
        return new RegExp(String(rule.value ?? '')).test(text);
      } catch {
        return true;
      }
    }
    case 'matchesBlock': {
      if (!resolve || !rule.value) return true;
      const other = resolve(String(rule.value));
      return asText(other).trim() === text;
    }
    default:
      return true;
  }
}

/** True when `pattern` is something JavaScript can actually compile. */
export function isValidPattern(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

/**
 * The whole point of the file: the first complaint, or null when there is none.
 *
 * First rather than all, because a field showing three red lines at once reads
 * as broken. Order is the builder's, so which complaint wins is their call.
 */
export function validateValue(
  value: any,
  rules: ValidationRule[] | undefined,
  opts?: { fieldName?: string; resolve?: (blockId: string) => any }
): string | null {
  if (!rules || rules.length === 0) return null;
  for (const rule of rules) {
    if (!passes(value, rule, opts?.resolve)) {
      const own = rule.message && rule.message.trim() !== '' ? rule.message.trim() : null;
      return own ?? defaultMessage(rule, opts?.fieldName ?? '');
    }
  }
  return null;
}
