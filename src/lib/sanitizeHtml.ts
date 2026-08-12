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

function isSafeUrl(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v.startsWith('javascript:') || v.startsWith('vbscript:')) return false;
  // data: is only safe for images; data:text/html is a script vector.
  if (v.startsWith('data:') && !v.startsWith('data:image/')) return false;
  return true;
}

export interface SanitizeResult {
  html: string;
  /** What was removed, so the builder is told rather than left confused. */
  removed: string[];
}

export function sanitizeHtml(input: string | undefined | null): SanitizeResult {
  const removed: string[] = [];
  if (!input || typeof input !== 'string') return { html: '', removed };
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    // No DOM to parse with. Refuse rather than pass it through unchecked.
    return { html: '', removed: ['could not be checked in this environment'] };
  }

  const doc = new DOMParser().parseFromString(`<div id="creora-root">${input}</div>`, 'text/html');
  const root = doc.getElementById('creora-root');
  if (!root) return { html: '', removed: ['could not be read as HTML'] };

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
        if (URL_ATTRS.has(name) && !isSafeUrl(attr.value)) {
          removed.push(`${name} on <${tag}>`);
          child.removeAttribute(attr.name);
          continue;
        }
      }

      walk(child);
    }
  };

  walk(root);
  return { html: root.innerHTML, removed: Array.from(new Set(removed)) };
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

/** Fill {{Name}} slots with values, escaped, AFTER the markup has been cleaned. */
export function fillSlots(safeHtml: string, values: Record<string, any>): string {
  return safeHtml.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, raw) => {
    const key = String(raw).trim();
    return key in values ? escapeHtmlText(values[key]) : '';
  });
}
