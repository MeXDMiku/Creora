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
  return match ? match[1].trim() : null;
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

/** Slot names a builder wrote, e.g. "{{Total}}" -> ["Total"]. */
export function findSlots(html: string | undefined | null): string[] {
  if (!html) return [];
  const names = new Set<string>();
  const re = /\{\{\s*([^}]+?)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) names.add(m[1].trim());
  return Array.from(names);
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
  urlSlots?: string[]
): string {
  const guarded = new Set(urlSlots || []);
  return safeHtml.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, raw) => {
    const key = String(raw).trim();
    if (!(key in values)) return '';
    const value = values[key];
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
