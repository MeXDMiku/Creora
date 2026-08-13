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
        const out: Record<string, any> = {};
        for (const slot of key ? key.split('\u0000') : []) out[slot] = byName[slot];
        return out;
      }),
    [key]
  );

  return useAtomValue(valuesAtom);
}
