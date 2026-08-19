/**
 * How big a page is, and what is making it big.
 *
 * WHY THIS EXISTS AT ALL
 * Creora has to run on free infrastructure. That is not a preference -- it is
 * the condition the whole project is built under, and nothing in the code was
 * measuring it.
 *
 * The page blob is written by autosave 500ms after every keystroke, whole, every
 * time. So its size is not a storage question, it is a BANDWIDTH question
 * multiplied by how fast somebody types. A 3MB page is 3MB uploaded per pause
 * for thought.
 *
 * TWO THINGS MAKE A PAGE BIG, AND BOTH ARE INVISIBLE
 *
 *  - an inlined image. `data:image/png;base64,...` is a real URL and the Image
 *    block accepts one, so a builder who pastes a photo instead of a link has a
 *    3MB page and no way to know. The backlog has called this "the single
 *    biggest storage risk in the product" since 11 Aug.
 *  - collected rows. They are held in the block's runtime state, and the whole
 *    of that state was being saved -- so a table with 500 rows was stored twice,
 *    once in `database_rows` where it belongs and once inside the page, and
 *    re-uploaded on every keystroke.
 *
 * Nothing here deletes anything. It measures, names the biggest contributor, and
 * lets the editor decide -- because a save that silently refuses is worse than
 * one that is merely large.
 */

/** Above this, say something. A normal page is a few tens of kilobytes. */
export const PAGE_WARN_BYTES = 512 * 1024;

/**
 * Above this, refuse.
 *
 * A page over two megabytes has something inlined in it -- there is no way to
 * reach that with markup and settings. Refusing is the kinder answer: the
 * alternative is uploading it again every 500ms for the rest of the session,
 * which is how a free tier is spent without anybody deciding to spend it.
 */
export const PAGE_REFUSE_BYTES = 2 * 1024 * 1024;

export interface PagePart {
  /** A block id, or one of the payload's own sections. */
  name: string;
  bytes: number;
  /** Set when this part is big for a reason worth naming. */
  reason: string | null;
}

export interface PageMeasurement {
  bytes: number;
  parts: PagePart[];
  /** The single biggest thing, or null when the page is empty. */
  biggest: PagePart | null;
}

/** Bytes as UTF-8, which is what actually travels, not characters. */
export function byteLength(value: unknown): number {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? null);
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
  // Node before the global, and any environment without it: close enough to
  // report on, and never smaller than the truth for ASCII.
  return unescape(encodeURIComponent(text)).length;
}

const DATA_URL = /^data:[^;]*;base64,/;

/** Why a part is big, when the reason is one somebody can act on. */
function reasonFor(state: any): string | null {
  if (!state || typeof state !== 'object') return null;
  for (const key of Object.keys(state)) {
    const value = (state as any)[key];
    if (typeof value === 'string' && DATA_URL.test(value)) {
      return 'a picture pasted into the page instead of linked';
    }
  }
  if (Array.isArray(state.rows) && state.rows.length > 0) {
    return `${state.rows.length} collected rows held inside the page`;
  }
  return null;
}

export function measurePage(payload: any): PageMeasurement {
  const parts: PagePart[] = [];

  const states = payload?.runtimeStates || {};
  for (const blockId of Object.keys(states)) {
    parts.push({
      name: blockId,
      bytes: byteLength(states[blockId]),
      reason: reasonFor(states[blockId]),
    });
  }

  // The sections that are not per-block, so a page that is big for a reason
  // other than one block still says what it is.
  for (const section of ['documentContent', 'positions', 'connections', 'formulas']) {
    if (payload?.[section] !== undefined) {
      parts.push({ name: section, bytes: byteLength(payload[section]), reason: null });
    }
  }

  parts.sort((a, b) => b.bytes - a.bytes);
  return {
    bytes: byteLength(payload),
    parts,
    biggest: parts.length ? parts[0] : null,
  };
}

/** Human-readable size, for a sentence rather than a log. */
export function describeBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface PageSizeVerdict {
  /** Whether the save should go ahead. */
  save: boolean;
  /** Said to the builder. Null when there is nothing worth saying. */
  message: string | null;
}

/**
 * What to do about a page of this size.
 *
 * The message names the biggest part AND why it is big, because "this page is
 * 3MB" is not something anybody can act on, and "the Photo block holds a
 * picture pasted into the page instead of linked" is.
 */
export function verdictForPage(
  measurement: PageMeasurement,
  nameOf: (blockId: string) => string = id => id,
): PageSizeVerdict {
  const { bytes, biggest } = measurement;
  if (bytes < PAGE_WARN_BYTES) return { save: true, message: null };

  const culprit = biggest
    ? `The largest part is "${nameOf(biggest.name)}"${biggest.reason ? ` — ${biggest.reason}` : ''}.`
    : '';

  if (bytes >= PAGE_REFUSE_BYTES) {
    return {
      save: false,
      message:
        `This page is ${describeBytes(bytes)}, which is too big to keep saving — it would be uploaded again every time you pause typing. ` +
        `${culprit} Nothing has been lost: fix that and it will save again.`,
    };
  }

  return {
    save: true,
    message:
      `This page is ${describeBytes(bytes)} and gets uploaded whole every time you pause typing. ` +
      `${culprit}`,
  };
}
