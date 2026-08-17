/**
 * Saving a page without silently overwriting a save made somewhere else.
 *
 * THE BUG THIS IS FOR
 * `save_page` is an unconditional UPDATE. Two tabs open on the same page --
 * the normal way anybody works -- and the second one to autosave replaces
 * everything the first did. No error, no warning, no copy kept. Autosave here
 * runs 500ms after a keystroke, so the losing tab overwrites the winning one
 * the moment it is touched, and nothing in the app could notice.
 *
 * THE SHAPE OF THE FIX, AND WHAT IT REFUSES TO DO
 * The client says which version it thinks it has; the server only writes if
 * that is still the version it holds. Everything below is the client's half,
 * kept out of the component so the decisions can be checked -- and they are
 * decisions, not plumbing:
 *
 *  - a stamp that is not known means SAVE ANYWAY. Failing to save is a worse
 *    failure than an unnoticed overwrite: one loses the work in front of you
 *    for certain, the other loses work sometimes.
 *  - the migration not being run means SAVE THE OLD WAY. Shipping this must not
 *    stop anybody saving until they have run some SQL.
 *  - a conflict STOPS the autosave rather than retrying. A retry either spams
 *    the same refusal or -- worse, if it drops the stamp to get through --
 *    performs the exact overwrite the whole thing exists to prevent.
 */

/** What the server said, in terms the editor can act on. */
export interface SaveOutcome {
  /** The save landed. */
  ok: boolean;
  /** Somebody else's save got there first; this tab is behind. */
  stale: boolean;
  /** The page is gone, so reloading will not help. */
  missing: boolean;
  /**
   * The guarded function is not in the database yet. The caller should save the
   * old way instead of showing anybody an error about a migration.
   */
  needsFallback: boolean;
  /** The new version stamp, when the save landed. */
  stamp: string | null;
  /** Said to a person, not to a developer. */
  message: string | null;
}

const asText = (error: unknown): { message: string; code: string } => {
  if (typeof error === 'string') return { message: error, code: '' };
  if (error && typeof error === 'object') {
    const e = error as { message?: unknown; code?: unknown };
    return { message: String(e.message ?? ''), code: String(e.code ?? '') };
  }
  return { message: '', code: '' };
};

/**
 * Is this the "you have not run the migration" error?
 *
 * Same shape as collections.ts and pageDelete.ts. Kept as its own function
 * because the answer decides whether anybody can save at all, and getting it
 * wrong in the false direction means an editor that cannot write.
 */
export function isMissingFunction(error: unknown): boolean {
  const { message, code } = asText(error);
  const lower = message.toLowerCase();
  return (
    code === 'PGRST202' ||
    lower.includes('could not find the function') ||
    lower.includes('schema cache') ||
    (lower.includes('does not exist') && lower.includes('function'))
  );
}

/** Turn whatever came back into the four things the editor needs to know. */
export function interpretSave(error: unknown, data: unknown): SaveOutcome {
  if (!error) {
    // The function returns the new stamp. A save that lands without one is not
    // an error, but the next save has nothing to compare against, so it says so
    // rather than inventing a stamp that would refuse every future write.
    const stamp = typeof data === 'string' && data ? data : null;
    return { ok: true, stale: false, missing: false, needsFallback: false, stamp, message: null };
  }

  if (isMissingFunction(error)) {
    return {
      ok: false, stale: false, missing: false, needsFallback: true, stamp: null,
      message: null,
    };
  }

  const { message, code } = asText(error);
  const lower = message.toLowerCase();

  if (lower.includes('no longer exists') || code === 'P0002') {
    return {
      ok: false, stale: false, missing: true, needsFallback: false, stamp: null,
      message:
        'This page has been deleted, so there is nowhere to save it. Copy anything you still need out of this tab before closing it — reloading will not bring it back.',
    };
  }

  if (lower.includes('changed elsewhere')) {
    return {
      ok: false, stale: true, missing: false, needsFallback: false, stamp: null,
      message:
        'This page was saved somewhere else — another tab, or another window — after this one loaded. Nothing here has been saved, and saving now would wipe out those changes. Reload to pick up the newer version, or use Save anyway if the version in this tab is the one you want to keep.',
    };
  }

  if (lower.includes('not your page') || code === '42501') {
    return {
      ok: false, stale: false, missing: false, needsFallback: false, stamp: null,
      message: 'Only the person who owns this page can save changes to it.',
    };
  }

  if (lower.includes('failed to fetch') || lower.includes('network')) {
    return {
      ok: false, stale: false, missing: false, needsFallback: false, stamp: null,
      message: 'Could not reach the server, so nothing was saved. Your changes are still here — this will try again.',
    };
  }

  return {
    ok: false, stale: false, missing: false, needsFallback: false, stamp: null,
    message: message ? `That did not save: ${message}` : 'That did not save, and the server did not say why.',
  };
}

/**
 * Whether autosave should keep running after this outcome.
 *
 * A conflict has to STOP it. Retrying either repeats the same refusal every
 * 500ms, or -- if the retry drops the stamp to force its way through -- does
 * the precise overwrite this exists to prevent. A network failure is the
 * opposite case and must keep trying, because the work is only in this tab.
 */
export function shouldKeepAutosaving(outcome: SaveOutcome): boolean {
  return !outcome.stale && !outcome.missing;
}

/**
 * Remembering which version of each page this tab believes it has.
 *
 * Per page, because switching pages saves the outgoing one -- a single stamp
 * would be compared against the wrong page the moment anybody used the tabs.
 * That is not a hypothetical: switching pages is how this editor saves.
 */
export class PageStamps {
  private stamps = new Map<string, string>();

  /** After loading or saving a page, this is where it stands. */
  record(pageId: string, stamp: string | null | undefined): void {
    if (!pageId) return;
    if (stamp) this.stamps.set(pageId, stamp);
    // A null stamp CLEARS rather than keeping the old one. A stale stamp is
    // worse than none: none saves, stale refuses.
    else this.stamps.delete(pageId);
  }

  /** What to send. Undefined means "unknown", which saves unconditionally. */
  expected(pageId: string): string | undefined {
    return this.stamps.get(pageId);
  }

  /** After a conflict, this tab no longer knows where it stands. */
  forget(pageId: string): void {
    this.stamps.delete(pageId);
  }
}
