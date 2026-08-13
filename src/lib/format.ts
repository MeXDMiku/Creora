/**
 * Turning a value into the words a visitor should read.
 *
 * WHY THIS EXISTS
 * "For each row" shipped a blog list that renders {{Created}} as
 * 2026-08-13T11:25:09.390Z. There was no way to make that say "13 Aug 2026",
 * and no way to make 4.5 say GBP 4.50. Every real page hits this in the first
 * ten minutes, so the repeater was only half a feature without it.
 *
 * THE SHAPE: A PIPELINE INSIDE THE SLOT
 *
 *     {{Created | date: D MMM YYYY}}
 *     {{Created | ago}}
 *     {{Price   | money: GBP}}
 *     {{Body    | truncate: 120}}
 *     {{now     | plus: 7 days | date: dddd}}
 *
 * Filters run left to right, and they work everywhere a slot already works --
 * My Design, For each row, and anything added later -- because they live inside
 * fillSlots rather than inside a block.
 *
 * EVERY FILTER IS TOTAL
 * Nothing here ever produces "NaN", "Invalid Date" or "undefined" on a page a
 * stranger is reading. A filter that cannot do its job returns the value
 * untouched, or nothing at all. `default:` is how a builder decides what
 * "nothing" should look like.
 *
 * THE CLOCK IS AN ARGUMENT
 * Anything time-dependent takes `now` rather than calling Date.now() inside
 * itself, so `npm run check` can pin it. A test that passes in August and fails
 * in September is not a test.
 */

export interface FilterStep {
  name: string;
  arg: string;
}

export interface ParsedSlot {
  /** The block or column being asked for. */
  name: string;
  filters: FilterStep[];
}

const PIPE_SPLIT = /(?<!\\)\|/;
const THOUSANDS = /\B(?=(\d{3})+(?!\d))/g;

/**
 * Split "Created | date: D MMM YYYY" into the name and the steps.
 *
 * A backslash escapes a pipe, for the rare template that genuinely wants one in
 * a default value. Everything before the first unescaped pipe is the name, which
 * is what keeps `findSlots` and the URL-slot guard working: they care about the
 * name, and the name is always the first thing.
 */
export function parseSlot(raw: string | null | undefined): ParsedSlot {
  const text = (raw === null || raw === undefined ? '' : String(raw)).trim();
  if (text === '') return { name: '', filters: [] };

  const parts = text.split(PIPE_SPLIT).map((p) => p.replace(/\\\|/g, '|'));
  const name = (parts.shift() || '').trim();

  const filters: FilterStep[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed === '') continue;
    const colon = trimmed.indexOf(':');
    if (colon === -1) {
      filters.push({ name: trimmed.toLowerCase(), arg: '' });
    } else {
      filters.push({
        name: trimmed.slice(0, colon).trim().toLowerCase(),
        arg: trimmed.slice(colon + 1).trim(),
      });
    }
  }
  return { name, filters };
}

function isBlank(value: any): boolean {
  return value === null || value === undefined || value === '';
}

function asNumber(value: any): number | null {
  if (typeof value === 'number') return isNaN(value) ? null : value;
  const text = String(value ?? '').trim().replace(/,/g, '');
  if (text === '') return null;
  const n = Number(text);
  return isNaN(n) ? null : n;
}

/**
 * Read a date from whatever a column happens to hold.
 *
 * Databases here are JSON, so a date is whatever was put in: an ISO string, a
 * millisecond number, or something a person typed. Anything unreadable returns
 * null and every date filter then leaves the value alone -- showing the raw
 * text is far better than showing "Invalid Date".
 */
export function toDate(value: any): Date | null {
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    // Ten-digit numbers are seconds, which is what most APIs send.
    const ms = value < 100000000000 ? value * 1000 : value;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  const text = String(value ?? '').trim();
  if (text === '') return null;
  if (/^\d+$/.test(text)) return toDate(Number(text));
  const d = new Date(text);
  return isNaN(d.getTime()) ? null : d;
}

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DAYS_LONG = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

/**
 * Format a date with tokens a person can guess.
 *
 * Longest token first, always: match MMMM before MMM before MM before M, or
 * "MMMM" comes out as "AugAug".
 *
 * Square brackets mean "these are my own words, leave them alone", which is the
 * convention anyone who has formatted a date before already knows. It is not
 * decoration: `a` is the am/pm token, so without escaping,
 * "D MMM YYYY at HH:mm" renders as "3 Aug 2026 amt 09:05". A check caught that
 * within a minute of being written, which is the entire argument for writing
 * them.
 */
export function formatDate(date: Date, pattern: string): string {
  const hours24 = date.getHours();
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;

  const tokens: [string, string][] = [
    ['YYYY', String(date.getFullYear())],
    ['YY', pad(date.getFullYear() % 100)],
    ['MMMM', MONTHS_LONG[date.getMonth()]],
    ['MMM', MONTHS_SHORT[date.getMonth()]],
    ['MM', pad(date.getMonth() + 1)],
    ['DD', pad(date.getDate())],
    ['dddd', DAYS_LONG[date.getDay()]],
    ['ddd', DAYS_SHORT[date.getDay()]],
    ['HH', pad(hours24)],
    ['hh', pad(hours12)],
    ['mm', pad(date.getMinutes())],
    ['ss', pad(date.getSeconds())],
    ['A', hours24 < 12 ? 'AM' : 'PM'],
    ['a', hours24 < 12 ? 'am' : 'pm'],
    ['D', String(date.getDate())],
    ['M', String(date.getMonth() + 1)],
    ['H', String(hours24)],
    ['h', String(hours12)],
  ];

  let out = '';
  let i = 0;
  outer: while (i < pattern.length) {
    if (pattern[i] === '[') {
      const close = pattern.indexOf(']', i + 1);
      if (close !== -1) {
        out += pattern.slice(i + 1, close);
        i = close + 1;
        continue;
      }
      // An unclosed bracket is a typo, and the intent behind it is obvious:
      // everything after it was meant to be their own words. Formatting the
      // rest anyway turns "D [Aug" into "3 [AMug", which helps nobody.
      out += pattern.slice(i);
      break;
    }
    for (const [token, value] of tokens) {
      if (pattern.startsWith(token, i)) {
        out += value;
        i += token.length;
        continue outer;
      }
    }
    out += pattern[i];
    i += 1;
  }
  return out;
}

const UNIT_MS: Record<string, number> = {
  second: 1000,
  minute: 60 * 1000,
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
};

/** "3 days", "1 week", "day" -> milliseconds. Null when it cannot be read. */
export function parseDuration(arg: string): number | null {
  const text = (arg || '').trim().toLowerCase();
  if (text === '') return null;
  const match = /^(-?\d+(?:\.\d+)?)?\s*([a-z]+)$/.exec(text);
  if (!match) return null;
  const amount = match[1] === undefined ? 1 : Number(match[1]);
  const unit = match[2].replace(/s$/, '');
  if (unit === 'month') {
    // Deliberately absent from UNIT_MS: months are not a fixed length, and a
    // "month" that is silently 30 days is a bug someone finds in February.
    return null;
  }
  const ms = UNIT_MS[unit];
  if (ms === undefined || isNaN(amount)) return null;
  return amount * ms;
}

/**
 * "3 hours ago", "in 2 days", "just now".
 *
 * Rounded down and capped at weeks: past that, a real date is more useful than
 * "8 weeks ago", and every reader knows it.
 */
export function relativeTime(date: Date, now: Date): string {
  const diff = now.getTime() - date.getTime();
  const future = diff < 0;
  const ms = Math.abs(diff);

  if (ms < 45 * 1000) return 'just now';

  const scale: [number, string][] = [
    [UNIT_MS.week, 'week'],
    [UNIT_MS.day, 'day'],
    [UNIT_MS.hour, 'hour'],
    [UNIT_MS.minute, 'minute'],
  ];

  for (const [size, unit] of scale) {
    if (ms >= size) {
      const n = Math.floor(ms / size);
      // Past a month, a real date beats counting weeks. Nobody reads
      // "7 weeks ago" and pictures a day; everybody reads "14 Jun" and does.
      if (unit === 'week' && n > 4) return formatDate(date, 'D MMM YYYY');
      const label = n === 1 ? unit : unit + 's';
      return future ? 'in ' + n + ' ' + label : n + ' ' + label + ' ago';
    }
  }
  return 'just now';
}

function withThousands(text: string): string {
  const [whole, fraction] = text.split('.');
  const grouped = whole.replace(THOUSANDS, ',');
  return fraction === undefined ? grouped : grouped + '.' + fraction;
}

function titleCase(text: string): string {
  return text.replace(/\S+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

export interface FilterOptions {
  /** The clock. Passed in so a check can pin it and a page can use the real one. */
  now?: Date;
}

/**
 * Run one filter. Returns the value untouched when the filter does not apply,
 * which is what keeps a page readable when a column turns out to hold something
 * unexpected. A wrong-looking date is a nuisance; "Invalid Date" is a bug report.
 */
function applyOne(value: any, step: FilterStep, options: FilterOptions): any {
  const now = options.now || new Date();
  const arg = step.arg;

  switch (step.name) {
    // --- text ---
    case 'upper':
      return String(value ?? '').toUpperCase();
    case 'lower':
      return String(value ?? '').toLowerCase();
    case 'title':
      return titleCase(String(value ?? ''));
    case 'trim':
      return String(value ?? '').trim();
    case 'truncate': {
      const limit = Number(arg);
      const text = String(value ?? '');
      if (!isFinite(limit) || limit <= 0 || text.length <= limit) return text;
      // Cut at a space where there is one nearby, so a card does not end
      // mid-word. The ellipsis counts, so the result never exceeds the limit.
      const cut = text.slice(0, limit - 1);
      const space = cut.lastIndexOf(' ');
      return (space > limit - 15 ? cut.slice(0, space) : cut).trimEnd() + '…';
    }
    case 'default':
      return isBlank(value) ? arg : value;

    // --- numbers ---
    case 'round': {
      const n = asNumber(value);
      if (n === null) return value;
      const places = arg === '' ? 0 : Number(arg);
      if (!isFinite(places)) return value;
      const factor = Math.pow(10, places);
      return (Math.round(n * factor) / factor).toFixed(Math.max(0, places));
    }
    case 'number': {
      const n = asNumber(value);
      if (n === null) return value;
      const places = arg === '' ? 0 : Number(arg);
      return withThousands(n.toFixed(isFinite(places) ? Math.max(0, places) : 0));
    }
    case 'money': {
      const n = asNumber(value);
      if (n === null) return value;
      // The symbol is the builder's, because a currency list would be a ceiling
      // and there is nothing to guess correctly.
      const symbol = arg === '' ? '' : arg;
      const body = withThousands(Math.abs(n).toFixed(2));
      return (n < 0 ? '-' : '') + symbol + body;
    }
    case 'percent': {
      const n = asNumber(value);
      if (n === null) return value;
      const places = arg === '' ? 0 : Number(arg);
      return (n * 100).toFixed(isFinite(places) ? Math.max(0, places) : 0) + '%';
    }

    // --- dates ---
    case 'date': {
      const d = toDate(value);
      if (!d) return value;
      return formatDate(d, arg === '' ? 'D MMM YYYY' : arg);
    }
    case 'time': {
      const d = toDate(value);
      if (!d) return value;
      return formatDate(d, arg === '' ? 'HH:mm' : arg);
    }
    case 'ago': {
      const d = toDate(value);
      if (!d) return value;
      return relativeTime(d, now);
    }
    case 'plus':
    case 'minus': {
      const d = toDate(value);
      const ms = parseDuration(arg);
      if (!d || ms === null) return value;
      const shifted = new Date(d.getTime() + (step.name === 'plus' ? ms : -ms));
      // Still a date, so it can be formatted by whatever comes next in the pipe.
      return shifted;
    }

    default:
      // An unknown filter is a typo. Leaving the value alone means the page
      // still reads; silently emptying it would look like missing data.
      return value;
  }
}

export function applyFilters(value: any, filters: FilterStep[], options: FilterOptions = {}): any {
  let current = value;
  for (const step of filters) current = applyOne(current, step, options);
  // A Date that reached the end without being formatted still has to become
  // words. This is the readable default rather than the ISO string.
  if (current instanceof Date) return formatDate(current, 'D MMM YYYY');
  return current;
}

/**
 * Values every template can use without a block or a column of that name.
 * Resolved only when nothing real has that name, so a column called "now"
 * always wins -- the builder's data beats ours.
 */
export function builtInSlotValue(name: string, options: FilterOptions = {}): any {
  const now = options.now || new Date();
  const key = name.trim().toLowerCase();
  if (key === 'now') return now;
  if (key === 'today') {
    const midnight = new Date(now.getTime());
    midnight.setHours(0, 0, 0, 0);
    return midnight;
  }
  return undefined;
}

/**
 * Fill {{slots}} in a plain string. Not markup, so nothing is escaped.
 *
 * This is the twin of fillSlots and the difference matters: fillSlots produces
 * HTML, so every value is escaped and URL slots are checked. This produces a
 * VALUE -- a label, a message, a row about to be written -- where escaping
 * would put &amp; in someone's name.
 */
export function renderTemplate(
  template: string | null | undefined,
  values: Record<string, any>,
  options: FilterOptions = {}
): string {
  const text = template === null || template === undefined ? '' : String(template);
  return text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, raw) => {
    const { name, filters } = parseSlot(String(raw));
    let value: any;
    if (name in values) {
      value = values[name];
    } else {
      value = builtInSlotValue(name, options);
      if (value === undefined) return '';
    }
    const out = filters.length ? applyFilters(value, filters, options) : value;
    if (out instanceof Date) return formatDate(out, 'D MMM YYYY');
    return out === null || out === undefined ? '' : String(out);
  });
}

/** For the inspector: what a builder can type, and what it does. */
export const FILTERS: { name: string; example: string; does: string }[] = [
  { name: 'date', example: '{{Created | date: D MMM YYYY}}', does: 'A date, written how you want it' },
  { name: 'time', example: '{{Created | time: HH:mm}}', does: 'Just the clock time' },
  { name: 'ago', example: '{{Created | ago}}', does: '"3 hours ago", "in 2 days"' },
  { name: 'plus', example: '{{now | plus: 7 days | date}}', does: 'Move a date forward' },
  { name: 'minus', example: '{{Due | minus: 1 week | date}}', does: 'Move a date back' },
  { name: 'money', example: '{{Price | money: $}}', does: 'Two decimals, thousands separated' },
  { name: 'number', example: '{{Views | number}}', does: '1,204,000' },
  { name: 'round', example: '{{Score | round: 1}}', does: 'Fewer decimals' },
  { name: 'percent', example: '{{Rate | percent: 1}}', does: '0.125 becomes 12.5%' },
  { name: 'upper', example: '{{Name | upper}}', does: 'SHOUTING' },
  { name: 'lower', example: '{{Tag | lower}}', does: 'quiet' },
  { name: 'title', example: '{{Name | title}}', does: 'Like This' },
  { name: 'trim', example: '{{Note | trim}}', does: 'Removes stray spaces' },
  { name: 'truncate', example: '{{Body | truncate: 120}}', does: 'Cuts long text at a word' },
  { name: 'default', example: '{{Photo | default: none yet}}', does: 'What to show when it is empty' },
];
