import { atom, useAtomValue } from 'jotai';
import { useMemo } from 'react';
import { blockValuesByName } from '../state/atoms';

/**
 * Resolve slot names to the live values of the blocks with those names.
 *
 * Referencing by NAME rather than by wire is deliberate. One piece of markup
 * usually wants several values at once -- a stopwatch showing a count, a label
 * and a status -- and a block has a single output port. Names sidestep that
 * entirely, and they read better.
 *
 * The derived atom is rebuilt only when the slot list changes, so this stays one
 * hook no matter how many slots the markup has.
 */
/**
 * Which of the asked-for names a set of blocks actually answers.
 *
 * Pulled out of the hook so it can be checked without React or a store. It is
 * four lines, and those four lines were wrong for the whole life of the
 * built-in slots -- see the comment inside. A rule that decides whether a
 * fallback is ever reached is worth being able to check directly.
 */
export function slotValuesFrom(byName: Record<string, any>, slots: string[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const slot of slots) {
    /**
     * A NAME NO BLOCK OWNS IS LEFT OUT, rather than added as undefined.
     *
     * THE BUG: this used to copy every name it was asked about, so a name
     * nothing owned still arrived as a key holding undefined. fillSlots
     * decides whether to fall back to a built-in with `key in values` -- a
     * present key means "a block answered this" -- so `{{now}}` and
     * `{{today}}` rendered EMPTY in Custom HTML and in row markup. They worked
     * in a workflow's text, which is a different function with no such layer
     * in front of it, and that is where they were checked.
     *
     * The precedence the built-ins document -- a block called "now" beats ours
     * -- survives, because a block called "now" is genuinely in byName and is
     * copied here like any other, including when its value is empty.
     */
    if (slot in byName) out[slot] = byName[slot];
  }
  return out;
}

/**
 * EVERY block's value, by the name printed on it.
 *
 * Different from useSlotValues on purpose. That one is asked for a LIST of
 * names and deliberately leaves out the ones no block owns, so `{{today}}` can
 * fall through to a built-in. A formula cannot be asked for its list in
 * advance -- the names it uses are inside a condition, which is a string that
 * has not been parsed yet -- so this hands over the lot and lets the expression
 * engine pick.
 *
 * Read through an atom for the same reason useTableScope is: a value changing
 * in another block has to move this list, or a filter reading "and me" would
 * keep answering with whoever was signed in when the page last rendered. A
 * stale answer is worse than a missing one, because it looks like an answer.
 */
export function useAllBlockValues(): Record<string, any> {
  const valuesAtom = useMemo(() => atom((get) => blockValuesByName({ get })), []);
  return useAtomValue(valuesAtom);
}

export function useSlotValues(slots: string[]): Record<string, any> {
  // Joined on a character a name cannot contain. It used to be a space,
  // which quietly broke every slot whose name had one in it -- {{Row number}},
  // or any block called "Total price".
  const key = slots.join('\u0000');

  const valuesAtom = useMemo(
    () =>
      atom((get) => {
        // Same resolution the binding engine uses, via one function, so a
        // template and a workflow can never disagree about which block a name
        // refers to.
        const byName = blockValuesByName({ get });
        return slotValuesFrom(byName, key ? key.split('\u0000') : []);
      }),
    [key]
  );

  return useAtomValue(valuesAtom);
}
