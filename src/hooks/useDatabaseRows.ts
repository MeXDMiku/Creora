import { useEffect, useState, useCallback } from 'react';
import { useAtomValue } from 'jotai';
import { blockRuntimeAtom } from '../state/atoms';
import { supabase } from '../lib/supabase';
import { usePollWhileVisible } from './usePollWhileVisible';
import type { Row } from '../lib/rows';

/**
 * The rows of a Database, for a block that is not that Database.
 *
 * Two sources, in this order, and the order is the point:
 *
 * 1. If the Database block is on this page, its own rows are used directly.
 *    One loader, so a repeater can never show a different count from the table
 *    sitting next to it. Two components fetching the same thing separately is
 *    exactly how the editor and the published renderer drifted apart before.
 *
 * 2. If it is not on this page -- a gallery page with no visible table, which
 *    is the normal case -- this fetches for itself.
 *
 * `poll` is for published pages: a visitor should see a new row appear without
 * refreshing, which is the whole shared-state idea. It pauses on a hidden tab.
 */
export function useDatabaseRows(trackedBlockId: string | undefined | null, poll = false) {
  const key = trackedBlockId || '';
  const tracked = useAtomValue(blockRuntimeAtom(key));
  const [fetched, setFetched] = useState<Row[]>([]);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const trackedRows = (tracked?.rows || []) as Row[];
  const trackedIsHere = trackedRows.length > 0;

  const load = useCallback(async () => {
    if (!key || trackedIsHere) return;
    try {
      const { data, error: rpcError } = await supabase.rpc('list_database_rows', { p_block_id: key });
      if (rpcError) {
        setError(rpcError.message || 'Could not load the rows');
        setLoadState('error');
        return;
      }
      setFetched(((data || []) as any[]).map((item) => ({ id: item.id, ...item.row_data })));
      setError(null);
      setLoadState('ready');
    } catch (err: any) {
      setError(err?.message || 'Could not load the rows');
      setLoadState('error');
    }
  }, [key, trackedIsHere]);

  useEffect(() => {
    if (!key || trackedIsHere) {
      setLoadState('ready');
      return;
    }
    setLoadState('loading');
    void load();
  }, [key, trackedIsHere, load]);

  /**
   * `key` is the tracked block, so a List hears about the table it is showing
   * rather than about itself -- which is the block that actually changes.
   */
  usePollWhileVisible(() => {
    if (poll) void load();
  }, 4000, poll ? key : undefined);

  return {
    rows: trackedIsHere ? trackedRows : fetched,
    columns: (tracked?.columns || []) as { name: string; type: string }[],
    /** True while the first load is still out. Lets a page say "loading" once, not forever. */
    isLoading: loadState === 'loading',
    error,
  };
}
