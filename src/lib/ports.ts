/**
 * Which output a wire left from.
 *
 * WHY THIS EXISTS
 * A block has had exactly one output since Creora started: `data-port-output`
 * carries a block id and nothing else, and a connection is
 * `{id, sourceBlockId, targetBlockId}`. That is enough right up until a node
 * needs to answer a question two ways -- an If/Else -- at which point "which
 * wire is this" stops being answerable from the block alone.
 *
 * THE MIGRATION RULE, WHICH IS THE WHOLE RISK
 * Every connection and every workflow step already saved has no `sourcePort`.
 * There are pages in the wild. So ABSENT MUST MEAN `out`, everywhere, forever
 * -- not "unknown", not a default filled in on load, not a value written back
 * into old data. A half-migrated port model breaks every existing wire, which
 * is the one outcome that cannot be walked back.
 *
 * So there is one function that answers it, and everything asks that function
 * rather than writing `?? 'out'` in fourteen places, because the fourteenth is
 * where it gets written as `?? 'if'` by mistake.
 */

export const OUTPUT_PORTS = ['out', 'if', 'else'] as const;
export type OutputPort = (typeof OUTPUT_PORTS)[number];

/**
 * The port a connection or step left from.
 *
 * Anything unrecognised also reads as `out`. That is deliberate: a page saved
 * by a newer version, or corrupted, should behave like an ordinary wire rather
 * than vanish. A wire in the wrong place is visible and fixable; a wire that
 * silently does not run is the failure this project keeps finding.
 */
export function portOf(value: unknown): OutputPort {
  return value === 'if' || value === 'else' ? value : 'out';
}

/** True when this is the plain output every block has always had. */
export function isDefaultPort(value: unknown): boolean {
  return portOf(value) === 'out';
}

/**
 * What to write when saving. `out` is written as ABSENT, so a page that uses no
 * branches saves exactly the bytes it saved before this existed -- and an old
 * Creora reading it back finds nothing new.
 */
export function portToSave(value: unknown): OutputPort | undefined {
  const p = portOf(value);
  return p === 'out' ? undefined : p;
}

/** The port, in the product's words. */
export function portWords(value: unknown): string {
  const p = portOf(value);
  if (p === 'if') return 'when it is true';
  if (p === 'else') return 'when it is not';
  return 'when it fires';
}
