import { atom, useAtomValue } from 'jotai';
import { useMemo } from 'react';
import { blockRuntimeAtom, allBlockIdsAtom, isGarbageName, getBlockTypeDisplayName } from '../state/atoms';
import { nodeTypeFromBlockId } from './blockRegistry';

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
  const key = slots.join(' ');

  const valuesAtom = useMemo(
    () =>
      atom((get) => {
        const byName: Record<string, any> = {};
        for (const id of get(allBlockIdsAtom)) {
          const state = get(blockRuntimeAtom(id));
          const name = isGarbageName(state?.blockName)
            ? getBlockTypeDisplayName(nodeTypeFromBlockId(id) ?? '')
            : (state!.blockName as string);
          // First one wins, so a later duplicate name cannot silently steal a slot.
          if (!(name in byName)) byName[name] = state?.value;
        }
        const out: Record<string, any> = {};
        for (const slot of key ? key.split(' ') : []) out[slot] = byName[slot];
        return out;
      }),
    [key]
  );

  return useAtomValue(valuesAtom);
}
