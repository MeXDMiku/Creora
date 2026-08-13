import { supabase } from './supabase';

/**
 * Whether a collection's rows belong to the visitor who wrote them.
 *
 * The switch lives with the DATA, not with whatever is displaying it, and it is
 * stored in the database rather than in the page. That is the whole point: a
 * checkbox that only asks the browser to draw fewer rows is not privacy -- the
 * rest are one fetch away for anyone who looks. With this flag set,
 * list_database_rows itself refuses to hand a visitor rows that are not theirs.
 *
 * See supabase/migrations/0004_row_ownership.sql and docs/MIGRATION_0004.md.
 */

export const MIGRATION_DOC = 'docs/MIGRATION_0004.md';

/**
 * Turn a failure into something a person can act on.
 *
 * The first case is the one that matters. Until the migration is run these
 * functions do not exist, and PostgREST answers with PGRST202 and a message
 * about schema cache -- which tells a builder nothing at all about what to do.
 */
export function describeCollectionError(error: unknown): string {
  let message = '';
  let code = '';
  if (typeof error === 'string') {
    message = error;
  } else if (error && typeof error === 'object') {
    const e = error as { message?: unknown; code?: unknown };
    message = String(e.message ?? '');
    code = String(e.code ?? '');
  }
  const lower = message.toLowerCase();

  if (
    code === 'PGRST202' ||
    lower.includes('could not find the function') ||
    lower.includes('does not exist') ||
    lower.includes('schema cache')
  ) {
    return `Per-visitor rows need one database change that has not been made yet. Run supabase/migrations/0004_row_ownership.sql — ${MIGRATION_DOC} has the steps.`;
  }
  if (lower.includes('not allowed') || code === '42501') {
    return 'Only the person who owns this page can change that.';
  }
  if (lower.includes('unknown block')) {
    return 'Save the page first — this Database has not reached the server yet.';
  }
  if (lower.includes('failed to fetch') || lower.includes('network')) {
    return 'Could not reach the server. Check the connection and try again.';
  }
  return message ? `That did not work: ${message}` : 'That did not work, and the server did not say why.';
}

export interface CollectionResult {
  value: boolean;
  error: string | null;
}

/** Is this collection private? False, with a reason, when it cannot be asked. */
export async function getCollectionPrivate(blockId: string): Promise<CollectionResult> {
  if (!blockId) return { value: false, error: null };
  try {
    const { data, error } = await supabase.rpc('get_collection_private', { p_block_id: blockId });
    if (error) return { value: false, error: describeCollectionError(error) };
    return { value: data === true, error: null };
  } catch (err) {
    return { value: false, error: describeCollectionError(err) };
  }
}

/** Make it private, or public again. Only the page's owner may. */
export async function setCollectionPrivate(blockId: string, isPrivate: boolean): Promise<CollectionResult> {
  if (!blockId) return { value: false, error: null };
  try {
    const { error } = await supabase.rpc('set_collection_private', {
      p_block_id: blockId,
      p_per_visitor: isPrivate,
    });
    if (error) return { value: !isPrivate, error: describeCollectionError(error) };
    return { value: isPrivate, error: null };
  } catch (err) {
    return { value: !isPrivate, error: describeCollectionError(err) };
  }
}
