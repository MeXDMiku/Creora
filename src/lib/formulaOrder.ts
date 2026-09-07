/**
 * The order formulas have to be worked out in.
 *
 * THE BUG THIS IS FOR, MEASURED BEFORE IT WAS WRITTEN
 * `recalculateAllFormulas` ran a fixed TWO passes, rebuilding the scope once
 * per pass. A pass therefore advances a chain by exactly one link, so two
 * passes resolve a chain two deep and no further. With
 *
 *   B = A + 1,  C = B + 1,  D = C + 1,  E = D + 1     and A = 1
 *
 * it gives  [2, 3, 2, 2]  where the answer is  [2, 3, 4, 5]  -- and the same
 * three wrong numbers whatever order the formulas are declared in, because the
 * limit is the pass count, not the listing.
 *
 * That is the worst shape a bug can have here. D does not error, does not
 * blank, does not say "cannot work this out". It shows 2, which is a perfectly
 * plausible number, on a page whose author has no reason to doubt it.
 *
 * WHY NOT SIMPLY RUN MORE PASSES
 * Because "more" is a guess, and the next chain is one longer than the guess.
 * A formula's inputs are known -- they are the block ids it names -- so the
 * order that works can be worked out rather than approximated. One pass in
 * dependency order is right at any depth, and it is less work than two passes.
 *
 * AND IT MAKES THE CIRCLE SAYABLE
 * Passes cannot tell a deep chain from a loop; both just stop improving. An
 * ordering CAN: whatever is left when nothing can go next is exactly what is
 * caught in a circle. Those come back separately, so the caller can say so
 * rather than print the number the last pass happened to leave behind. The
 * house rule for something that cannot be worked out is to refuse, not to
 * guess, and a formula reading its own answer is the plainest case of it.
 */

import { referencedIds } from './diagnose';

export interface FormulaLike {
  targetBlockId?: string;
  formula?: string;
}

export interface FormulaPlan<T> {
  /** Every formula that can be worked out, inputs before the things that use them. */
  order: T[];
  /**
   * The blocks caught in a circle, sorted so two runs agree. None of these is
   * in `order` -- there is no order that works -- and the caller must say so
   * instead of showing a number.
   */
  inCircle: string[];
}

/**
 * Sort the formulas so that anything a formula reads has already been worked
 * out by the time it runs.
 *
 * Only OTHER FORMULAS constrain the order. A formula reading a Button or a
 * table is reading something already settled before any of this starts, so it
 * puts no constraint on anything.
 *
 * Ties keep declaration order, so the same page always plans the same way and
 * two runs can be compared.
 */
export function planFormulas<T extends FormulaLike>(formulas: T[]): FormulaPlan<T> {
  const list = (formulas ?? []).filter((f) => f && f.targetBlockId);
  const targets = new Set(list.map((f) => String(f.targetBlockId)));

  /** What each formula waits for: the other formula targets it names. */
  const waitsFor = new Map<T, Set<string>>();
  for (const f of list) {
    const needs = new Set<string>();
    for (const id of referencedIds(f.formula)) {
      // Self-reference is a circle of one. It cannot be worked out in an order,
      // and reading your own previous answer is exactly the silent wrongness
      // this file exists to stop.
      if (targets.has(id)) needs.add(id);
    }
    waitsFor.set(f, needs);
  }

  const done = new Set<string>();
  const order: T[] = [];
  const left = [...list];

  // Repeatedly take everything whose inputs are all ready, in declaration order.
  // Whatever cannot be taken when nothing moved is caught in a circle.
  for (;;) {
    const ready = left.filter((f) => {
      const needs = waitsFor.get(f)!;
      for (const id of needs) if (!done.has(id)) return false;
      return true;
    });
    if (!ready.length) break;
    // One loop, not two. It was two, with a comment claiming that marking a
    // whole batch done at once stopped two formulas naming each other from
    // letting one another through -- which is not a thing that can happen:
    // `ready` is chosen before any of this runs, so what is added to `done`
    // here cannot change it. A negative control broke the split and nothing
    // went red, which is how a line that defends against nothing gets found.
    for (const f of ready) {
      order.push(f);
      left.splice(left.indexOf(f), 1);
      done.add(String(f.targetBlockId));
    }
  }

  return {
    order,
    inCircle: Array.from(new Set(left.map((f) => String(f.targetBlockId)))).sort(),
  };
}

/**
 * What to put in a block that is caught in a circle, in the product's words.
 * Never a number: a number here is a guess wearing an answer's clothes.
 */
export function circleMessage(blockId: string, inCircle: string[]): string {
  const others = inCircle.filter((id) => id !== blockId);
  if (!others.length) return 'This reads its own answer, so there is nothing to work out from.';
  return others.length === 1
    ? 'This and one other block each wait for the other, so neither can be worked out.'
    : `This and ${others.length} other blocks wait for each other in a circle, so none can be worked out.`;
}
