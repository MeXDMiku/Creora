import type { Workflow, FormulaBinding, BlockRuntimeState } from '../types/creora';
import { nodeTypeFromBlockId } from './blockRegistry';

/**
 * What is wrong with this page that nobody has noticed.
 *
 * WHY THIS IS THE OPERATIONS LAYER, NOT A PANEL
 * The third layer was always described as the AWS-console one: what is running,
 * what is published, what is broken. The panel is the easy half. The half worth
 * building is the question with a real answer -- and the answer is almost always
 * a reference to something that no longer exists.
 *
 * A block gets deleted. The wire into it stays in `workflows`. The formula that
 * mentioned it stays in `formulas`. The repeater still names it. Nothing errors,
 * nothing logs, the page simply does slightly less than it used to, and the
 * builder finds out weeks later when a customer says the total is wrong.
 *
 * Every check here is about a name or an id that points at nothing.
 */

export type Severity = 'broken' | 'warning' | 'idle';

export interface Problem {
  severity: Severity;
  /** Short, and about the page rather than about the code. */
  title: string;
  /** What it means and what to do, in one sentence. */
  detail: string;
  /** The block this is about, so the panel can select it. */
  blockId?: string;
}

export interface PageFacts {
  /** Every block id currently on the page. */
  blockIds: string[];
  /** Runtime state by block id, for names and settings. */
  states: Record<string, BlockRuntimeState | undefined>;
  workflows: Workflow[];
  formulas: FormulaBinding[];
  connections: { id: string; sourceBlockId: string; targetBlockId: string }[];
}

const IDENTIFIER = /[A-Za-z_$][A-Za-z0-9_$]*/g;

function nameOf(facts: PageFacts, blockId: string): string {
  const name = facts.states[blockId]?.blockName;
  return name && String(name).trim() !== '' ? String(name) : blockId.slice(-4);
}

function exists(facts: PageFacts, blockId: string | undefined | null): boolean {
  return !!blockId && facts.blockIds.includes(blockId);
}

/**
 * The identifiers a formula refers to.
 *
 * Formulas are written against block IDS, not names, so this is a plain scan
 * for anything that looks like a name and is not a number. It over-collects on
 * purpose: a false "this refers to X" is checked against the block list a line
 * later and disappears if X exists.
 */
export function referencedIds(formula: string | null | undefined): string[] {
  const text = formula === null || formula === undefined ? '' : String(formula);
  const found = text.match(IDENTIFIER) || [];
  return Array.from(new Set(found));
}

export function diagnosePage(facts: PageFacts): Problem[] {
  const problems: Problem[] = [];

  // --- wires that lead nowhere ---
  for (const workflow of facts.workflows || []) {
    if (!exists(facts, workflow.sourceId)) {
      problems.push({
        severity: 'broken',
        title: 'A wire starts at a block that is gone',
        detail:
          'Something was deleted and this action is still listening to it, so it can never run. Delete the wire.',
        blockId: workflow.sourceId,
      });
      continue;
    }
    for (const step of workflow.steps || []) {
      if (!exists(facts, step.targetId)) {
        problems.push({
          severity: 'broken',
          title: `"${nameOf(facts, workflow.sourceId)}" points at a block that is gone`,
          detail:
            'The block this was wired to has been deleted, so pressing it does nothing. Re-point it or remove it.',
          blockId: workflow.sourceId,
        });
      }
      // A condition can name a third block, and that one can vanish too.
      const conditions = [
        ...(step.conditions || []),
        ...(step.condition && step.condition.fieldId ? [step.condition] : []),
      ];
      for (const condition of conditions) {
        if (!exists(facts, condition.fieldId)) {
          problems.push({
            severity: 'broken',
            title: `A condition on "${nameOf(facts, workflow.sourceId)}" checks a block that is gone`,
            detail:
              'The condition can never be true, so this step is skipped every time and nothing says so.',
            blockId: workflow.sourceId,
          });
        }
      }
    }
  }

  // --- formulas referring to nothing ---
  for (const binding of facts.formulas || []) {
    if (!exists(facts, binding.targetBlockId)) {
      problems.push({
        severity: 'broken',
        title: 'A formula writes into a block that is gone',
        detail: 'It is calculated on every change and the answer goes nowhere.',
        blockId: binding.targetBlockId,
      });
      continue;
    }
    for (const id of referencedIds(binding.formula)) {
      // Anything that is not a known block is either a number, a function name,
      // or a reference to something deleted. Only the last one is a problem, and
      // only ids shaped like ours are worth complaining about.
      const looksLikeABlock = id.includes('__') || id.startsWith('test_');
      if (looksLikeABlock && !exists(facts, id)) {
        problems.push({
          severity: 'broken',
          title: `The formula in "${nameOf(facts, binding.targetBlockId)}" uses a block that is gone`,
          detail: 'It shows an error instead of a number until the formula is edited.',
          blockId: binding.targetBlockId,
        });
      }
    }
  }

  // --- blocks pointing at a Database that is not here ---
  for (const blockId of facts.blockIds) {
    const state = facts.states[blockId];
    if (!state) continue;
    const tracked = state.trackedBlockId;
    if (tracked && !exists(facts, tracked)) {
      problems.push({
        severity: 'warning',
        title: `"${nameOf(facts, blockId)}" reads a Database that is not on this page`,
        detail:
          'It still works if that Database exists on another page, and shows nothing at all if it does not.',
        blockId,
      });
    }
    for (const [field, label] of [
      ['searchBlockId', 'search box'],
      ['filterBlockId', 'filter'],
      ['sortColumnBlockId', 'sort column'],
      ['sortDirectionBlockId', 'sort direction'],
    ] as const) {
      const ref = (state as Record<string, any>)[field];
      if (ref && !exists(facts, ref)) {
        problems.push({
          severity: 'broken',
          title: `"${nameOf(facts, blockId)}" uses a ${label} that is gone`,
          detail: 'That control was deleted, so this behaves as though nothing is set.',
          blockId,
        });
      }
    }
  }

  // --- connections drawn to nothing ---
  for (const connection of facts.connections || []) {
    if (!exists(facts, connection.sourceBlockId) || !exists(facts, connection.targetBlockId)) {
      problems.push({
        severity: 'warning',
        title: 'A drawn wire has no block at one end',
        detail:
          'Only the line is left over. It does nothing, and it is drawn on the canvas where a real wire would be.',
      });
    }
  }

  // --- things that exist but were never finished ---
  for (const blockId of facts.blockIds) {
    const state = facts.states[blockId];
    if (!state) continue;

    if (state.rules && state.rules.length) {
      const bad = state.rules.filter(
        (r) => (r.type === 'matchesBlock' || r.type === 'pattern') && !r.value
      );
      if (bad.length) {
        problems.push({
          severity: 'warning',
          title: `A rule on "${nameOf(facts, blockId)}" was never finished`,
          detail: 'It has no value to check against, so it always passes.',
          blockId,
        });
      }
    }

    const wired = (facts.workflows || []).some((w) => w.sourceId === blockId);
    // Through the registry, not by matching the start of an id. Writing that
    // by hand is what made three block types unsaveable in cycle 2.
    const isTrigger = nodeTypeFromBlockId(blockId) === 'buttonBlock';
    if (isTrigger && !wired && !state.targetPageId) {
      problems.push({
        severity: 'idle',
        title: `"${nameOf(facts, blockId)}" does nothing`,
        detail: 'Nothing is wired to this button and it does not go to another page.',
        blockId,
      });
    }
  }

  return problems;
}

/** Ordered worst-first, because that is the order anybody wants to read them. */
export function sortProblems(problems: Problem[]): Problem[] {
  const rank: Record<Severity, number> = { broken: 0, warning: 1, idle: 2 };
  return [...problems].sort((a, b) => rank[a.severity] - rank[b.severity]);
}
