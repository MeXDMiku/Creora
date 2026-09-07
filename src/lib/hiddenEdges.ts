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
  // Found in the delete warning, in a browser: a List pointed at a block for its
  // sort DIRECTION read "a setting (sortDirectionBlockId) points at it".
  sortDirectionBlockId: 'it sets which way that block sorts',
  rowHtml: 'the row markup names it',
  html: 'the markup names it',
  text: 'the words name it',
  template: 'the template names it',
  filterFormula: 'a filter formula reads it',
  sortFormula: 'a sort formula reads it',
};

const VIA_WORDS: Record<string, string> = {
  // `hiddenLinks` never sees this one -- a wire is drawn, so it is filtered out
  // before the words are asked for. `whatBreaksIfDeleted` DOES list drawn
  // dependencies, and without this the raw tag reached the reader.
  wire: 'a wire connects them',
  // Also found by looking: the delete warning read "a wire connects them · step".
  // The fallback did its job -- an unworded reason is supposed to look
  // unfinished rather than vague -- and this is the reason nobody had worded.
  //
  // Worded so it does not repeat `wire`. A pair can have both, because a drawn
  // connection makes two records: the line, and the thing it does. First draft
  // read "a wire changes it · a wire connects them", which sounds like two
  // wires. These are two facts about one.
  step: 'this makes it change',
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

/**
 * The hidden dependencies that touch one block, in either direction.
 *
 * WHY ONE BLOCK AND NOT THE WHOLE PAGE
 * Drawing every undrawn dependency at once is how you get the hairball this
 * project's own notes warn about -- and it would be a big one, because most of
 * a page's dependencies are undrawn. Kobourov's line, quoted in the docs, is
 * that you cannot route your way out of a hairball; the way out is to draw
 * fewer edges, not to draw them more cleverly.
 *
 * So the canvas shows the dependencies of the block you have SELECTED. That is
 * the moment somebody wants them -- "what does this touch, and what touches
 * it" -- and it is never more than one block's worth of lines.
 *
 * `direction` is from the selected block's point of view, because "this needs
 * that" and "that needs this" are different questions and the arrow has to know
 * which one it is drawing.
 */
export interface TouchingLink extends HiddenLink {
  /** 'needs' — the selected block depends on `from`. 'feeds' — `to` depends on it. */
  direction: 'needs' | 'feeds';
}

export function hiddenLinksTouching(page: PageBlob, blockId: string): TouchingLink[] {
  // No `if (!blockId) return []` guard: no edge has an empty end, so the filter
  // below already returns nothing, and the overlay does not call this at all
  // when nothing is selected. A guard no control can break only LOOKS tested.
  return hiddenLinks(page)
    .filter((l) => l.from === blockId || l.to === blockId)
    .map((l) => ({ ...l, direction: l.to === blockId ? 'needs' as const : 'feeds' as const }));
}
