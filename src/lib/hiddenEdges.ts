/**
 * The dependencies a page has and does not draw.
 *
 * WHY THIS EXISTS
 * `edgesOf` already knows every real dependency on a page and marks which ones
 * a wire is drawn for. Measured on this project's own pages, about two thirds
 * are not drawn: a formula naming a block by raw id, a List pointed at a table
 * through `trackedBlockId`, a condition asking about a field, a repeater's
 * markup filling a slot from somewhere else. Every one of them is real, and not
 * one of them is on screen.
 *
 * That is the reported cause of "I moved a block and something broke". The
 * canvas looks calm because it is showing a third of the truth, and the third
 * it shows is the third somebody already knew about.
 *
 * WHAT THIS ADDS TO `edgesOf`
 * Two things, both about being read by a person rather than counted:
 *
 *   - one row per PAIR, not per reason. A block can depend on another four
 *     different ways; that is one relationship with four reasons, and printing
 *     it four times makes a short list look like a crisis.
 *   - the reason in words. `setting:trackedBlockId` is not a sentence.
 *
 * It deliberately does NOT rank or judge. A hidden dependency is not a fault --
 * a formula reading a block is the engine working as designed. The fault is
 * only that it cannot be seen, so the honest output is a list, not a warning.
 */

import { edgesOf, type PageBlob } from './pageGraph';

export interface HiddenLink {
  /** The block being depended ON. */
  from: string;
  /** The block that depends on it. */
  to: string;
  /** Every distinct reason, in words, sorted so two runs agree. */
  reasons: string[];
}

const SETTING_WORDS: Record<string, string> = {
  trackedBlockId: 'that block shows it',
  filterBlockId: 'it filters that block',
  searchBlockId: 'it searches that block',
  sortColumnBlockId: 'it sorts that block',
  rowHtml: 'the row markup names it',
  html: 'the markup names it',
  text: 'the words name it',
  template: 'the template names it',
  filterFormula: 'a filter formula reads it',
  sortFormula: 'a sort formula reads it',
};

const VIA_WORDS: Record<string, string> = {
  'step:otherwise': 'an otherwise branch changes it',
  'step:condition': 'a condition asks about it',
  'step:condition-formula': 'a condition formula reads it',
  'step:column': 'it fills a column',
  'step:given': 'it is handed to an action',
  'step:match': 'it chooses which row',
  'step:match-formula': 'a formula chooses which row',
  formula: 'a formula reads it',
};

/**
 * The reason, as a person would say it.
 *
 * Falls back to the raw tag rather than to something vague: a reason nobody
 * wrote words for should look unfinished, not look like every other reason.
 */
export function reasonWords(via: string): string {
  if (VIA_WORDS[via]) return VIA_WORDS[via];
  if (via.startsWith('setting:')) {
    const field = via.slice('setting:'.length);
    return SETTING_WORDS[field] ?? `a setting (${field}) points at it`;
  }
  if (via.startsWith('query:')) return 'a question reads it';
  if (via.startsWith('action:')) return 'an action reads it';
  return via;
}

/**
 * Every dependency on the page that draws no wire, one row per pair.
 *
 * Sorted by the pair so two runs of the same page agree -- a list that
 * reshuffles cannot be diffed, and a diagnostic nobody can diff gets ignored.
 */
export function hiddenLinks(page: PageBlob): HiddenLink[] {
  const byPair = new Map<string, HiddenLink>();

  for (const edge of edgesOf(page)) {
    if (edge.drawn) continue;
    const key = `${edge.from}>${edge.to}`;
    const existing = byPair.get(key);
    const words = reasonWords(edge.via);
    if (existing) {
      if (!existing.reasons.includes(words)) existing.reasons.push(words);
    } else {
      byPair.set(key, { from: edge.from, to: edge.to, reasons: [words] });
    }
  }

  const links = Array.from(byPair.values());
  for (const link of links) link.reasons.sort();
  links.sort((a, b) => (a.from === b.from ? a.to.localeCompare(b.to) : a.from.localeCompare(b.from)));
  return links;
}
