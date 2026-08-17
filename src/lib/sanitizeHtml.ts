/**
 * Clean a builder's own HTML before it goes on a page.
 *
 * WHY THIS IS NOT OPTIONAL
 * Every Creora page is served from one domain. A builder who could put a
 * <script> on their page could read localStorage on that domain -- which holds
 * the Supabase auth token of anybody who visits, including other builders. One
 * person's page could take over another person's account. "Creora handles the
 * backend so you don't have to worry" has to include not letting that happen.
 *
 * So: markup and styling yes, behaviour no. Their design renders exactly as they
 * made it; anything that could *run* is removed. Logic comes from nodes, which
 * is the whole point of the product.
 */

import { isSafeUrlValue, safeUrl } from './urls';
import { parseSlot, applyFilters, builtInSlotValue, type FilterOptions } from './format';
// Slots can hold a calculation (`{{calc: Price * Qty}}`), so the display layer
// needs the same evaluator the engine uses. Sharing it is the point: a sum that
// meant one thing in a Formula block and another in row markup would be a new
// version of the drift bug this codebase already has five of.
import { evaluateExpression, identifiersIn } from './formula';

const ALLOWED_TAGS = new Set([
  'div','span','p','a','br','hr','strong','b','em','i','u','s','small','mark','sub','sup',
  'h1','h2','h3','h4','h5','h6','blockquote','pre','code',
  'ul','ol','li','dl','dt','dd',
  'table','thead','tbody','tfoot','tr','td','th','caption','colgroup','col',
  'img','picture','source','figure','figcaption',
  'section','article','header','footer','main','aside','nav','address',
  'svg','g','path','circle','ellipse','rect','line','polyline','polygon','text','tspan',
  'defs','lineargradient','radialgradient','stop','clippath','mask','use','symbol','title',
  'style',
]);

/** Attributes that can execute or navigate somewhere dangerous. */
const URL_ATTRS = new Set(['href', 'src', 'xlink:href', 'action', 'formaction', 'poster', 'data']);

/**
 * Attributes where an inline picture is a picture rather than a curiosity.
 * `src="data:image/png;..."` is ordinary; `href="data:image/png;..."` is a
 * link to a file that is not this site, and there is no reason to allow it.
 */
const INLINE_IMAGE_ATTRS = new Set(['src', 'poster', 'xlink:href']);

/**
 * This used to be a hand-rolled denylist that compared a trimmed, lowercased
 * string against 'javascript:'. It missed `java&#10;script:`, which the DOM
 * decodes to a real newline and browsers execute regardless. It now delegates
 * to the one URL policy in the project. See src/lib/urls.ts.
 */
function isSafeUrl(value: string, attrName: string): boolean {
  return isSafeUrlValue(value, { allowInlineImages: INLINE_IMAGE_ATTRS.has(attrName) });
}

const LEADING_SLOT = /^\s*\{\{\s*([^}]+?)\s*\}\}/;

/**
 * The slot standing at the front of a URL attribute's value, if there is one.
 *
 * Pulled out of the DOM walk so it can be checked by `npm run check`. The walk
 * around it needs a browser; this does not, and this is the part with a
 * judgement in it -- a slot at the front decides the scheme, a slot anywhere
 * later cannot, because the literal text in front of it already did.
 *
 *   href="{{Link}}"        -> "Link"      (decides the scheme: must be checked)
 *   href="/user/{{Id}}"    -> null        (scheme is already "/", Id is inert)
 *   href="{{A}}/{{B}}"     -> "A"         (only the first one can decide it)
 */
export function leadingSlotName(attributeValue: string | null | undefined): string | null {
  if (!attributeValue) return null;
  const match = LEADING_SLOT.exec(attributeValue);
  if (!match) return null;
  // The name without its filters, because that is the key the guard is
  // checked against when the slot is filled.
  return parseSlot(match[1]).name || null;
}

export interface SanitizeResult {
  html: string;
  /** What was removed, so the builder is told rather than left confused. */
  removed: string[];
  /**
   * Slots that decide a URL's scheme, and so must be checked when they are
   * filled. Hand these to fillSlots; it will not check anything without them.
   */
  urlSlots: string[];
}

export function sanitizeHtml(input: string | undefined | null): SanitizeResult {
  const removed: string[] = [];
  const urlSlots = new Set<string>();
  if (!input || typeof input !== 'string') return { html: '', removed, urlSlots: [] };
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    // No DOM to parse with. Refuse rather than pass it through unchecked.
    return { html: '', removed: ['could not be checked in this environment'], urlSlots: [] };
  }

  const doc = new DOMParser().parseFromString(`<div id="creora-root">${input}</div>`, 'text/html');
  const root = doc.getElementById('creora-root');
  if (!root) return { html: '', removed: ['could not be read as HTML'], urlSlots: [] };

  const walk = (el: Element) => {
    // Copy: the list is live and we remove as we go.
    for (const child of Array.from(el.children)) {
      const tag = child.tagName.toLowerCase();

      if (!ALLOWED_TAGS.has(tag)) {
        removed.push(`<${tag}>`);
        child.remove();
        continue;
      }

      for (const attr of Array.from(child.attributes)) {
        const name = attr.name.toLowerCase();

        // onclick, onerror, onload — anything that runs.
        if (name.startsWith('on')) {
          removed.push(`${name} on <${tag}>`);
          child.removeAttribute(attr.name);
          continue;
        }
        if (URL_ATTRS.has(name)) {
          /**
           * A slot standing at the front of a URL attribute decides that
           * address's scheme, and its value does not exist yet. Record it, so
           * whoever fills it is made to check it. Without this, sanitising
           * before filling means `href="{{Message}}"` is checked while it still
           * says `{{Message}}` and never checked again.
           *
           * A slot LATER in the value -- href="/user/{{Id}}" -- cannot change
           * the scheme, because the literal text in front of it already did.
           */
          const leading = leadingSlotName(attr.value);
          if (leading) {
            urlSlots.add(leading);
            continue;
          }
          if (!isSafeUrl(attr.value, name)) {
            removed.push(`${name} on <${tag}>`);
            child.removeAttribute(attr.name);
            continue;
          }
        }
      }

      walk(child);
    }
  };

  walk(root);
  return { html: root.innerHTML, removed: Array.from(new Set(removed)), urlSlots: Array.from(urlSlots) };
}

/** Values are inserted as text, never as markup. */
export function escapeHtmlText(value: any): string {
  const s = value === null || value === undefined ? '' : String(value);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Slot names a builder wrote, without their filters.
 *
 *   "{{Total}}"                  -> ["Total"]
 *   "{{Created | date: D MMM}}"  -> ["Created"]
 *
 * The name is what gets looked up, so everything that resolves values -- block
 * names, database columns -- keeps working without knowing filters exist.
 */
export function findSlots(html: string | undefined | null): string[] {
  if (!html) return [];
  const names = new Set<string>();
  const re = /\{\{\s*([^}]+?)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const name = parseSlot(m[1]).name;
    if (!name) continue;

    /**
     * A computed slot reports the names INSIDE it, not itself.
     *
     * This function is how the value layer knows what to go and fetch: whatever
     * it returns is looked up by name and handed to fillSlots. `{{calc: Total *
     * 2}}` asked for a block called "calc: Total * 2", got nothing, and then
     * the calculation could not find `Total` and rendered empty -- on a page
     * that looked entirely correct in the editor. A repeater hid this, because
     * its rows supply every column whether they were asked for or not, so the
     * feature worked in the one place it was tried and nowhere else.
     */
    const calc = /^calc\s*:\s*([\s\S]+)$/i.exec(name);
    if (calc) {
      for (const inner of identifiersIn(calc[1])) names.add(inner);
      continue;
    }
    names.add(name);
  }
  return Array.from(names);
}

/**
 * The values a calculation can see: what is on the page, plus `now` and
 * `today`.
 *
 * WHY A PROXY AND NOT A COPY
 * Without this, `{{today}}` answers and `{{calc: today}}` says the block does
 * not exist -- the same word meaning two different things one bracket apart,
 * which nobody could be expected to guess. A copy would mean deciding up front
 * which built-ins to include, and doing it per row: a repeater showing 200 rows
 * builds this 200 times. Answering on demand costs nothing until something asks.
 *
 * A block on the page always wins, exactly as it does for a plain slot -- the
 * page's own names are consulted first, and merely OWNING the name is enough,
 * so a block called `now` holding nothing still beats the clock.
 *
 * The precedence lives entirely in `get`. Swapping the two halves of `has`
 * changes nothing -- both orders answer true when either side has the name --
 * and a negative control that broke `has` stayed green while the rule was
 * intact underneath. If you are testing this, break `get`.
 */
function withBuiltIns(values: Record<string, any>, options: FilterOptions): Record<string, any> {
  return new Proxy(values, {
    has: (target, prop) =>
      prop in target || (typeof prop === 'string' && builtInSlotValue(prop, options) !== undefined),
    get: (target, prop) =>
      prop in target
        ? (target as any)[prop]
        : typeof prop === 'string'
          ? builtInSlotValue(prop, options)
          : undefined,
  });
}

/**
 * Fill {{Name}} slots with values, escaped, AFTER the markup has been cleaned.
 *
 * `urlSlots` is not optional in spirit. Pass the list sanitizeHtml handed back,
 * every time. A slot that decides a URL's scheme was necessarily unchecked when
 * the markup was cleaned -- it still said `{{Name}}` -- and this is the only
 * place left that can check it. Omit the list and a value out of a database
 * row goes straight into an href.
 */
export function fillSlots(
  safeHtml: string,
  values: Record<string, any>,
  urlSlots?: string[],
  options: FilterOptions = {}
): string {
  const guarded = new Set(urlSlots || []);
  return safeHtml.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, raw) => {
    const { name: key, filters } = parseSlot(String(raw));

    /**
     * A calculation, when the slot asks for one.
     *
     * Row markup could show `{{Price}}` and `{{Qty}}` and had no way at all to
     * show what they come to. A shop row displaying "3 x £200" could not
     * display £600 -- writing `{{Price}} * {{Qty}}` renders the literal text
     * "200 * 3", because slots fill and the asterisk just sits there.
     *
     * It lands before the filter pipeline rather than beside it, so a
     * calculation can still be formatted the way any other value can:
     *
     *     {{calc: Price * Qty | money: £}}   ->   £600.00
     *
     * Columns are bare names here, not braces. That is a real difference from a
     * repeater's FILTER formula, and it is deliberate: parseSlot has already
     * split this string on `|`, so a nested `{{...}}` cannot survive being
     * parsed twice. Arithmetic is almost always over Price, Qty, Total and
     * friends, which are single words; a column called "Your name" is not
     * something anyone multiplies.
     */
    const calcMatch = /^calc\s*:\s*([\s\S]+)$/i.exec(key);

    /**
     * WHY THIS SETS `value` INSTEAD OF RETURNING ITS OWN ANSWER
     *
     * The first version of this returned the calculated text directly, and that
     * was a hole: a slot standing at the front of a URL attribute is recorded
     * in `urlSlots` by its whole name, `calc: ...` included, and the check that
     * uses that list lives at the BOTTOM of this function. Returning early
     * walked straight past it, so
     *
     *     <a href="{{calc: concat('javascri', 'pt:alert(1)')}}">
     *
     * put a javascript: URL into an href -- escaping is no defence, it is a
     * scheme, not markup. Exactly the thing the header of this file says must
     * never be possible.
     *
     * So a calculation is a third way of PRODUCING a value, and nothing more.
     * All three ways meet at the same tail below: filters, then the URL check,
     * then escaping. One exit means a future fourth source cannot reintroduce
     * this by forgetting a step it never knew about.
     */
    let value: any;
    if (calcMatch) {
      try {
        value = evaluateExpression(calcMatch[1], withBuiltIns(values, options));
      } catch {
        // Empty, not an error message. A visitor reading somebody's published
        // page must never be shown "Referenced block Prcie does not exist" --
        // the Health panel is where a builder is told.
        return '';
      }
    } else if (key in values) {
      // A real value first. `now` and `today` only answer when nothing on the
      // page has that name, so a column called "now" beats ours.
      value = values[key];
    } else {
      value = builtInSlotValue(key, options);
      if (value === undefined) return '';
    }

    // Filters run BEFORE the URL check, deliberately: a `default:` could
    // otherwise put an address into an href that nothing had looked at.
    if (filters.length) value = applyFilters(value, filters, options);

    if (guarded.has(key)) {
      // Inline images are allowed here: a data:image in a link is a link to a
      // picture, which is odd but not dangerous. Everything without a safe
      // scheme becomes nothing, and an empty href does nothing at all.
      const cleaned = safeUrl(value === null || value === undefined ? '' : String(value), {
        allowInlineImages: true,
      });
      return cleaned ? escapeHtmlText(cleaned) : '';
    }
    return escapeHtmlText(value);
  });
}
