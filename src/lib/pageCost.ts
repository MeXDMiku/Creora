import { byteLength, describeBytes } from './pageSize';

/**
 * What this page costs to keep online.
 *
 * WHY A PANEL AND NOT A DOCUMENT
 * Creora has to run on free infrastructure, and a builder has no way at all to
 * see how close they are. The failure is not a bill -- it is a project that
 * pauses, or a page that stops loading, weeks after the decision that caused it,
 * with nothing connecting the two.
 *
 * WHY THE LIMITS ARE NOT IN HERE
 * They belong to somebody else and they change. A number typed into a product
 * goes stale silently and then lies with confidence -- which is exactly what
 * this project's own capability audit did for six days. So this reports what is
 * MEASURED and points at the dashboard that knows the real figures.
 *
 * The one exception is the shape of the advice: what to DO about a heavy page
 * does not change when a limit does.
 */

export interface CostLine {
  label: string;
  value: string;
  /** Said underneath, when there is something worth doing about it. */
  advice: string | null;
  /** Worth drawing attention to. */
  heavy: boolean;
}

const DATA_URL = /^data:[^;]*;base64,/;

/** Blocks holding a picture pasted in rather than linked. */
export function inlinedImages(
  blockIds: string[],
  stateOf: (id: string) => any,
): { blockId: string; bytes: number }[] {
  const found: { blockId: string; bytes: number }[] = [];
  for (const id of blockIds || []) {
    const state = stateOf(id);
    if (!state || typeof state !== 'object') continue;
    for (const key of Object.keys(state)) {
      const value = (state as any)[key];
      if (typeof value === 'string' && DATA_URL.test(value)) {
        found.push({ blockId: id, bytes: byteLength(value) });
        break;
      }
    }
  }
  return found.sort((a, b) => b.bytes - a.bytes);
}

/**
 * The lines the panel shows.
 *
 * Rows are counted per page rather than per project because that is what can be
 * measured from here without another round trip -- and the panel says so, since
 * a number whose scope is unstated is a number somebody will read as the wrong
 * one.
 */
export function costLines(input: {
  pageBytes: number;
  rowsOnThisPage: number;
  pageCount: number;
  inlined: { blockId: string; bytes: number }[];
  nameOf: (blockId: string) => string;
}): CostLine[] {
  const { pageBytes, rowsOnThisPage, pageCount, inlined, nameOf } = input;
  const lines: CostLine[] = [];

  lines.push({
    label: 'This page weighs',
    value: describeBytes(pageBytes),
    advice:
      pageBytes >= 512 * 1024
        ? 'It is uploaded whole every time you pause typing, and downloaded again by every visitor.'
        : null,
    heavy: pageBytes >= 512 * 1024,
  });

  lines.push({
    label: 'Rows on this page',
    value: String(rowsOnThisPage),
    advice: null,
    heavy: false,
  });

  lines.push({
    label: 'Pages in this project',
    value: String(pageCount),
    advice: null,
    heavy: false,
  });

  if (inlined.length) {
    const worst = inlined[0];
    lines.push({
      label: inlined.length === 1 ? 'Picture pasted in' : 'Pictures pasted in',
      value: describeBytes(inlined.reduce((total, i) => total + i.bytes, 0)),
      // The specific block, because "you have an inlined image" leaves somebody
      // opening every block on the page to find out which.
      advice: `"${nameOf(worst.blockId)}" holds one. Upload it instead and the block keeps a link, which costs almost nothing.`,
      heavy: true,
    });
  }

  return lines;
}
