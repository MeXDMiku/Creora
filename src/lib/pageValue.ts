import { blockRuntimeAtom, pageParamsAtom } from '../state/atoms';
import { executeWorkflow, recalculateAllFormulas } from './bindingEngine';
import { renderTemplate } from './format';
import { buildQuery, parseParamTemplate } from './pageParams';

/**
 * Keeping a Page value block's value equal to what the address carried.
 *
 * The block's value has to be the real value, not something only its own
 * renderer knows, because everything else in Creora reads values: a filter
 * comparing against it, a slot showing it, a condition asking whether it is
 * empty. That is the same decision the Image block made about its address and
 * the repeater made about the row you clicked.
 */

/** What this block should be showing right now. */
export function resolvePageValue(
  params: Record<string, string> | null,
  state: { paramName?: string; previewValue?: string; fallbackValue?: string } | undefined
): string {
  const name = (state?.paramName || '').trim();
  const fallback = state?.fallbackValue ?? '';

  // Null means the editor: there is no address at all, so the preview value is
  // what makes a detail page visible while it is being laid out.
  if (params === null) {
    const preview = state?.previewValue ?? '';
    return preview !== '' ? preview : fallback;
  }

  if (!name) return fallback;
  const value = params[name];
  return value === undefined || value === '' ? fallback : value;
}

export function refreshPageValue(blockId: string, store: any): void {
  const state = store.get(blockRuntimeAtom(blockId));
  if (!state) return;
  const next = resolvePageValue(store.get(pageParamsAtom), state);
  if (state.value === next) return;
  store.set(blockRuntimeAtom(blockId), { ...state, value: next });
  // Arriving with a value is a change, and anything wired to this block should
  // hear about it exactly as it would if somebody had typed it.
  executeWorkflow(blockId, 'onChange', store);
  recalculateAllFormulas(store);
}

/**
 * Turn a builder's parameter template into a query string.
 *
 * Split first, fill second, encode last. Filling first would mean a value
 * containing an ampersand had already become a second parameter before anything
 * looked at it -- the same ordering mistake that once let a filter smuggle a
 * scheme past the URL guard, in a different costume.
 */
export function buildParamsFromTemplate(
  template: string | null | undefined,
  values: Record<string, any>
): string {
  const pairs = parseParamTemplate(template);
  if (!pairs.length) return '';
  const out: Record<string, string> = {};
  for (const pair of pairs) {
    out[pair.name] = renderTemplate(pair.valueTemplate, values);
  }
  return buildQuery(out);
}
