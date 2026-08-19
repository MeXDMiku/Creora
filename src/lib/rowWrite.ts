/**
 * What to say when the server refuses to store a row.
 *
 * WHY THIS EXISTS AT ALL
 * The workflow that adds a row used to add it to the page and then fire the
 * insert into the background, logging a warning if it failed. So a visitor
 * pressed Submit, watched their row appear, and nothing had been stored. They
 * had no way to know, and neither did the builder -- the count went up, the
 * table filled in, and the data was not there.
 *
 * That is the one kind of wrong this project keeps deciding against: not
 * visibly wrong, invisibly wrong. A row that vanishes with a message can be
 * submitted again. A row that looks saved and is not cannot.
 */

export interface RowWriteFailure {
  /** Said to whoever is looking at the page. Never a developer's sentence. */
  message: string;
  /** True when trying again in a moment is the right advice. */
  retryable: boolean;
}

/**
 * Turn a failure into something a person can act on.
 *
 * The first two cases are the row limits from migration 0007, and they are the
 * reason this file was written: they are the failures a VISITOR can trip, on a
 * page belonging to somebody else, having done nothing wrong.
 */
export function describeRowWriteError(error: unknown): RowWriteFailure {
  let message = '';
  let code = '';
  if (typeof error === 'string') message = error;
  else if (error && typeof error === 'object') {
    const e = error as { message?: unknown; code?: unknown };
    message = String(e.message ?? '');
    code = String(e.code ?? '');
  }
  const lower = message.toLowerCase();

  if (code === 'P0003' || lower.includes('too many submissions')) {
    return {
      message: 'Too many submissions in a short time. Wait a moment and try again.',
      retryable: true,
    };
  }
  if (code === 'P0004' || lower.includes('reached its limit')) {
    // Addressed to the visitor, because that is who reads it -- but it says
    // enough that they can tell the owner something useful.
    return {
      message: 'This form has reached the number of entries it can hold, so nothing was saved. Let the site owner know.',
      retryable: false,
    };
  }
  /**
   * A column marked "used once" already holds this value (migration 0008).
   *
   * The server names the column, and that name is the whole value of the
   * message: "that is already taken" without saying WHAT leaves a visitor
   * guessing which of five fields to change.
   */
  if (code === 'P0005' || lower.includes('is already taken')) {
    const named = /that (.+?) is already taken/i.exec(message);
    return {
      message: named
        ? `That ${named[1]} is already taken. Choose another one — nothing was saved.`
        : 'That value is already taken. Choose another one — nothing was saved.',
      // Retrying the same value fails the same way. Retrying a different one is
      // a new submission, not a retry.
      retryable: false,
    };
  }

  /**
   * The server refusing a value's SHAPE (migration 0009).
   *
   * These reach a visitor who typed something the column cannot hold. The
   * server names the column, which is the whole value of the message -- the
   * browser's own rules already said this in nicer words, so anybody seeing
   * THIS message either has an old page open or is not using the form.
   */
  if (code === 'P0006' || / has to be a (number|date)$/.test(message.trim())) {
    return {
      message: `${message.charAt(0).toUpperCase()}${message.slice(1)}. Nothing was saved.`,
      retryable: false,
    };
  }
  if (code === 'P0007' || lower.includes('too long')) {
    return {
      message: 'That entry is too long to store. Shorten it and try again — nothing was saved.',
      retryable: false,
    };
  }

  if (lower.includes('failed to fetch') || lower.includes('network')) {
    return {
      message: 'Could not reach the server, so this was not saved. Check the connection and try again.',
      retryable: true,
    };
  }
  if (lower.includes('not allowed') || lower.includes('unknown block') || code === '42501') {
    return {
      message: 'This form is not accepting entries. Nothing was saved.',
      retryable: false,
    };
  }
  return {
    message: message
      ? `That was not saved: ${message}`
      : 'That was not saved, and the server did not say why.',
    retryable: true,
  };
}

/**
 * Take back a row that was shown before the server had agreed to it.
 *
 * Optimistic insert is the right shape -- waiting on a round trip before the
 * page moves feels broken -- but it has to be UNDONE when the round trip says
 * no. Leaving the row is the lie this whole file exists to stop.
 *
 * Matching on id rather than on position: by the time an answer comes back,
 * other rows may have arrived, and removing "the last one" would take
 * somebody else's.
 */
export function withoutRow<T extends { id: string }>(rows: T[] | undefined | null, rowId: string): T[] {
  return (rows || []).filter(r => r?.id !== rowId);
}
