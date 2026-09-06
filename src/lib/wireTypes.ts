/**
 * What may be wired into what.
 *
 * WHY THIS FILE EXISTS
 * The rule lived inline in App.tsx as a six-branch `if` chain inside a
 * 4,500-line pointer handler. That meant two things, and the second is worse
 * than the first: nobody could read the whole rule in one place, and no check
 * could reach it. `grep isCompatible scripts/checks.ts` returned nothing --
 * the one mechanism deciding which connections are expressible at all had zero
 * coverage, in a suite of 2,187 checks with 115 negative controls.
 *
 * THE RULE, AND THE TWO REFUSALS THAT WERE WRONG
 * The old chain allowed six pairs and refused everything else. Its mistake was
 * treating a trigger as though it handed over a value.
 *
 * It does not. `wireWords.ts` states the input port's contract outright, for
 * every block, with no exceptions: "runs when something fires into it". A
 * trigger carries nothing. It says WHEN, not WHAT. So the old
 * `trigger -> number | boolean | database` was an accidental shortlist rather
 * than a rule, and it refused `Button -> Text Label` -- "when the button is
 * pressed, set the words in the label" -- which is one of the first things
 * anybody tries. It also stranded six of the seventeen block types, which
 * report `unknown` and could therefore not be the target of anything at all.
 *
 * A source that carries a VALUE is a different question: the value has to fit
 * where it lands, so those still have to match.
 *
 * WHY `unknown` STILL REFUSES
 * A block that has not been told what it gives cannot be checked, and the house
 * doctrine splits on which way to fail: a filter that cannot be worked out
 * keeps every row, a rule that cannot be worked out refuses. A wire is neither
 * -- it is authoring -- but a wire built on a value nobody can name produces a
 * page that is broken in a way no error explains. So it refuses, and says which
 * end it could not name, which the old message could not do.
 */

import type { BlockDataType } from '../state/atoms';

export interface WireVerdict {
  ok: boolean;
  /** Why not, in the product's own words. Null when it may be wired. */
  reason: string | null;
}

/** The type, as a person would say it. Never the internal word. */
export function typeWords(dataType: BlockDataType): string {
  switch (dataType) {
    case 'trigger': return 'a trigger';
    case 'number': return 'a number';
    case 'boolean': return 'a yes or no';
    case 'string': return 'text';
    case 'database': return 'a table';
    default: return 'an unknown value';
  }
}

/**
 * May a wire be drawn from a block that gives `source` into one that holds
 * `target`?
 *
 * Order matters here. `unknown` is tested before sameness on purpose, so that
 * `unknown -> unknown` refuses rather than passing the `source === target`
 * test by accident -- two blocks nobody can name are not a match, they are two
 * questions.
 */
export function canWire(source: BlockDataType, target: BlockDataType): WireVerdict {
  // A trigger hands over nothing, so there is nothing to fit. It may fire into
  // anything -- which is what every input port already promises in words.
  if (source === 'trigger') return { ok: true, reason: null };

  if (source === 'unknown')
    return { ok: false, reason: 'That block has not been told what kind of value it gives yet.' };

  if (target === 'unknown')
    return { ok: false, reason: 'That block has not been told what kind of value it holds yet.' };

  if (source === target) return { ok: true, reason: null };

  return {
    ok: false,
    reason: `This gives ${typeWords(source)}, and that holds ${typeWords(target)}.`,
  };
}
