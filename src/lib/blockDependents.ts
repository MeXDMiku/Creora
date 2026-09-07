/**
 * What would be left pointing at nothing if this block went.
 *
 * WHY THIS EXISTS
 * `deleteBlock` in App.tsx cleans up four things: the block's own node, its
 * atoms, the connections at either end, and the formulas that write INTO it.
 * Every one of those is a place the block is the TARGET.
 *
 * Nothing cleans up, or even mentions, the places the block is the SOURCE --
 * which is most of them, and all of the invisible ones:
 *
 *   a formula somewhere else that names it by raw id
 *   a List, Search or Sort pointed at it through a setting
 *   a workflow condition that asks about it
 *   a step that fills a column from it, or hands it to an action
 *   a question whose answer is drawn from it
 *   an action that reads it
 *
 * So deleting a block silently breaks other blocks, and the canvas shows no
 * reason why, because two thirds of what a page depends on is not drawn. That
 * is the reported "I deleted something and another thing broke".
 *
 * WHAT THIS DOES AND DOES NOT DO
 * It answers the question and stops there. It does not delete anything, does
 * not rewrite the page, and does not rank. Silently repairing a formula whose
 * input vanished would be guessing at what somebody meant, and the house rule
 * for a thing that cannot be worked out is to say so rather than to guess.
 */

import { edgesOf, type PageBlob } from './pageGraph';
import { reasonWords } from './hiddenEdges';

export interface Breakage {
  /** The block, question or action that would be left pointing at nothing. */
  dependent: string;
  /** Every distinct reason, in words, sorted so two runs agree. */
  reasons: string[];
  /**
   * True when a wire is drawn for it. Those are the ones somebody can already
   * see, and the only ones today's delete cleans up -- so a warning that showed
   * every dependency equally would bury the ones that are actually a surprise.
   */
  drawn: boolean;
}

/**
 * Everything that depends on `blockId`, one row per dependent.
 *
 * Sorted with the INVISIBLE ones first, then by name: a list whose surprises
 * are at the bottom is a list that gets skimmed.
 */
export function whatBreaksIfDeleted(page: PageBlob, blockId: string): Breakage[] {
  // No `if (!blockId) return []` guard here on purpose: `edgesOf` already
  // refuses an edge with an empty end, so a second guard would be a line no
  // control could break -- which is a line that only LOOKS tested.
  const byDependent = new Map<string, Breakage>();

  for (const edge of edgesOf(page)) {
    if (edge.from !== blockId) continue;
    const existing = byDependent.get(edge.to);
    const words = reasonWords(edge.via);
    if (existing) {
      if (!existing.reasons.includes(words)) existing.reasons.push(words);
      // Drawn if ANY reason is drawn: one wire is enough to make it visible.
      existing.drawn = existing.drawn || edge.drawn;
    } else {
      byDependent.set(edge.to, { dependent: edge.to, reasons: [words], drawn: edge.drawn });
    }
  }

  const rows = Array.from(byDependent.values());
  for (const row of rows) row.reasons.sort();
  rows.sort((a, b) =>
    a.drawn === b.drawn ? a.dependent.localeCompare(b.dependent) : (a.drawn ? 1 : -1));
  return rows;
}

/**
 * The one-line version, for a place that has room for a sentence and not a list.
 * Empty string when nothing depends on it, so the caller can say nothing at all
 * rather than say "0 things".
 */
export function breakageSummary(rows: Breakage[]): string {
  if (!rows.length) return '';
  const hidden = rows.filter(r => !r.drawn).length;
  const one = rows.length === 1;
  const uses = one ? '1 thing on this page uses it' : `${rows.length} things on this page use it`;
  if (!hidden) return `${uses}.`;
  if (hidden === rows.length) return `${uses}, and no wire shows ${one ? 'it' : 'them'}.`;
  return `${uses}, and ${hidden} of them have no wire.`;
}

/**
 * The workflows a page should be left with after a block is deleted.
 *
 * THE ONE THAT WAS MISSED
 * The old line dropped a workflow whose source was the block, or any of whose
 * steps TARGETED it. `elseTargetId` -- the "otherwise" branch of a step -- was
 * not looked at, and `bindingEngine` resolves that branch as
 * `step.elseTargetId || step.targetId`. So a step whose otherwise pointed at a
 * deleted block kept pointing at it, and fired into a block that was not there.
 *
 * Clearing it rather than dropping the step is deliberate: `|| step.targetId`
 * is the documented default, so clearing puts the step back to the behaviour it
 * had before somebody chose an otherwise. Dropping the whole step would throw
 * away the part that still works, and inventing a new otherwise would be
 * guessing.
 */
export function workflowsAfterDeleting<T extends { sourceId?: string; steps?: any[] }>(
  workflows: T[],
  blockId: string,
): T[] {
  if (!blockId) return workflows ?? [];
  const out: T[] = [];
  for (const w of workflows ?? []) {
    if (!w) continue;
    if (w.sourceId === blockId) continue;
    const steps = w.steps ?? [];
    if (steps.some((s: any) => s?.targetId === blockId)) continue;
    if (!steps.some((s: any) => s?.elseTargetId === blockId)) { out.push(w); continue; }
    out.push({
      ...w,
      steps: steps.map((s: any) => (s?.elseTargetId === blockId ? { ...s, elseTargetId: undefined } : s)),
    });
  }
  return out;
}

/**
 * What to call a node in a sentence a person reads.
 *
 * A block has runtime state to ask for its name; a question and an action do
 * not, and without this they printed their raw internal id -- `query:q1` --
 * into panels whose whole point is words. Shared rather than written twice,
 * because the Health panel and the delete warning say the same thing and two
 * copies of a sentence drift the same way two copies of a cleanup do.
 */
export function nodeName(
  id: string,
  blockName: (blockId: string) => string,
  queries: { id?: string; name?: string; def?: { from?: any } }[] = [],
  actions: { id?: string; name?: string }[] = [],
): string {
  if (id.startsWith('query:')) {
    const q = queries.find((x) => `query:${x?.id}` === id);
    return `the question "${q?.name || (typeof q?.def?.from === 'string' ? q.def.from : '') || 'unnamed'}"`;
  }
  if (id.startsWith('action:')) {
    const a = actions.find((x) => `action:${x?.id}` === id);
    return `the action "${a?.name || 'unnamed'}"`;
  }
  return blockName(id);
}
