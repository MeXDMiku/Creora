import { atom, useAtomValue } from 'jotai';
import { useMemo } from 'react';
import { tableScope } from './bindingEngine';
import type { TableScope } from './formula';

/**
 * The tables on this page, for markup that calculates over one.
 *
 * WHY A DERIVED ATOM AND NOT A PLAIN CALL
 * A row could read a value but never a whole table, so `{{calc: Total /
 * sumOf("Orders", "Total")}}` -- a row's share of the total, which is most of
 * what anybody wants a percentage for -- was not sayable.
 *
 * Reading it through an atom is the part that has to be right. Building the map
 * inline would compute the correct answer once and then never again: a row
 * added to a DIFFERENT block changes this total, and nothing in a repeater
 * subscribes to another block's rows. The page would keep showing the total as
 * it stood when the component last happened to render.
 *
 * A stale number is worse than a missing one. It looks like an answer.
 *
 * The atom reads every block's runtime, so jotai subscribes to all of them and
 * a row arriving anywhere re-renders whatever displays a total. That is a real
 * cost and it is the right one: the alternative is a dashboard that is quietly
 * out of date.
 */
export function useTableScope(): TableScope {
  // Built once. The atom itself never changes; what it reads does.
  const tablesAtom = useMemo(() => atom((get) => tableScope({ get } as any)), []);
  return useAtomValue(tablesAtom);
}
