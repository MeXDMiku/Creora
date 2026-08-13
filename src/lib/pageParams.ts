/**
 * A page that can be opened with values, and can ask what it was opened with.
 *
 * WHY THIS IS THE SMALLEST ITEM WITH THE LARGEST REACH
 * A blog could list posts and not show a post. A directory could list businesses
 * and not show a business. Clicking a row already put its value somewhere, and
 * buttons already navigated -- what was missing was that a PAGE COULD NOT
 * RECEIVE A VALUE. Three of the ten site types in CAPABILITIES.md were blocked
 * on that single sentence.
 *
 * Named values rather than "the row id", deliberately. `?id=abc` is the common
 * case, but `?category=shoes&sort=price` costs nothing extra and is the same
 * idea, and a design that only carries row ids would need replacing the first
 * time somebody wants a filtered link.
 *
 * ENCODING IS THE WHOLE JOB
 * Everything here is one bug: a value with a space, an ampersand, a slash or a
 * hash in it. "Tea & Coffee" becomes two parameters if it is not encoded, and
 * the second one is nonsense. That is why building a query string is a function
 * with checks rather than string concatenation at a call site.
 */

const PAIR_SPLIT = /[&;]/;

export type Params = Record<string, string>;

/**
 * Read "?a=1&b=two" into an object.
 *
 * Written by hand rather than with URLSearchParams so it behaves identically
 * everywhere, including in `npm run check` where there is no DOM, and so the
 * decoding rules are visible rather than assumed.
 */
export function parseParams(search: string | null | undefined): Params {
  const out: Params = {};
  let text = (search === null || search === undefined ? '' : String(search)).trim();
  if (text.startsWith('?')) text = text.slice(1);
  if (text === '') return out;

  for (const pair of text.split(PAIR_SPLIT)) {
    if (pair === '') continue;
    const eq = pair.indexOf('=');
    const rawName = eq === -1 ? pair : pair.slice(0, eq);
    const rawValue = eq === -1 ? '' : pair.slice(eq + 1);
    const name = decodeParam(rawName);
    if (name === '') continue;
    // First one wins. A repeated name is almost always a mistake, and taking
    // the last silently would make the mistake harder to see.
    if (!(name in out)) out[name] = decodeParam(rawValue);
  }
  return out;
}

/**
 * Decode one piece, without throwing.
 *
 * decodeURIComponent throws on a lone percent sign, which is exactly the sort
 * of thing a hand-edited address contains. A blank page because somebody typed
 * a % is not an acceptable outcome, so a broken escape is left as it was typed.
 */
function decodeParam(raw: string): string {
  const plussed = raw.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(plussed);
  } catch {
    return plussed;
  }
}

/** One value, or the fallback when it is absent or empty. */
export function readParam(
  search: string | null | undefined,
  name: string,
  fallback = ''
): string {
  if (!name) return fallback;
  const value = parseParams(search)[name.trim()];
  return value === undefined || value === '' ? fallback : value;
}

/**
 * Build "?a=1&b=two" from an object, encoding both halves.
 *
 * Empty values are dropped rather than written as `a=`. A link that says
 * `?category=` reads as "the category is blank" to anything downstream, when
 * what was meant was "there is no category".
 */
export function buildQuery(params: Params | null | undefined): string {
  if (!params) return '';
  const parts: string[] = [];
  for (const name of Object.keys(params)) {
    const key = name.trim();
    if (key === '') continue;
    const value = params[name];
    if (value === undefined || value === null || String(value) === '') continue;
    parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
  }
  return parts.length ? '?' + parts.join('&') : '';
}

/**
 * Read the builder's parameter template into pairs, BEFORE the values are
 * filled in.
 *
 * They write `id={{Row id}}&tab=details`. Splitting first and filling second is
 * what makes encoding possible at all: fill first and a value containing an
 * ampersand has already become a second parameter by the time anyone looks.
 * This is the ordering bug that this file exists to prevent, and it is the same
 * shape as the one that let a filter smuggle a scheme past the URL guard.
 */
export function parseParamTemplate(template: string | null | undefined): { name: string; valueTemplate: string }[] {
  const text = (template === null || template === undefined ? '' : String(template)).trim();
  if (text === '') return [];
  const out: { name: string; valueTemplate: string }[] = [];
  for (const pair of text.replace(/^\?/, '').split(PAIR_SPLIT)) {
    const trimmed = pair.trim();
    if (trimmed === '') continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const name = trimmed.slice(0, eq).trim();
    if (name === '') continue;
    out.push({ name, valueTemplate: trimmed.slice(eq + 1).trim() });
  }
  return out;
}
