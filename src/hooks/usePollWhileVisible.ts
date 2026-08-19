import { useEffect, useRef } from 'react';
import { startingPace, nextPace, type PollPace } from '../lib/pollPace';

/**
 * Re-runs a fetch so a Database block shows rows as they arrive, instead of
 * only what existed when the page loaded.
 *
 * This is what makes a published Creora page feel shared rather than static:
 * a visitor submits on their phone and the owner's table grows on their screen
 * without a refresh.
 *
 * Polling rather than Supabase Realtime, deliberately. Realtime's
 * postgres_changes respects RLS, and Creora's tables have RLS enabled with no
 * policies at all -- every read goes through a SECURITY DEFINER RPC instead. So
 * realtime would deliver nothing without either opening the tables up or adding
 * broadcast triggers and realtime.messages policies. Polling reuses the
 * authorisation that already exists and is already proven.
 *
 * IT PAUSES WHEN THE TAB IS HIDDEN, AND SLOWS DOWN WHEN NOTHING IS HAPPENING.
 * `list_database_rows` returns EVERYTHING -- there is no "only what changed" --
 * so a table with a thousand rows is about half a megabyte per poll, and a
 * visitor sitting on the page for five minutes costs 37 MB against a free plan
 * that includes 5 GB a month. Most of those polls change nothing: a page open
 * on a desk all afternoon asks nine hundred times and gets the same answer nine
 * hundred times.
 *
 * So the caller says whether the answer was different, and the pace follows.
 * See lib/pollPace.ts for why it slows rather than stops.
 */
export function usePollWhileVisible(
  fn: () => void | Promise<void> | boolean | Promise<boolean>,
  intervalMs?: number,
) {
  const saved = useRef(fn);
  saved.current = fn;
  const pace = useRef<PollPace>(startingPace());

  useEffect(() => {
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    /**
     * A chain of timeouts rather than an interval, because the delay changes
     * between rounds. setInterval cannot do that without being torn down and
     * rebuilt, which would restart the clock every time the pace moved.
     */
    const schedule = () => {
      if (stopped) return;
      timer = setTimeout(run, intervalMs ?? pace.current.intervalMs);
    };

    const run = async () => {
      if (stopped) return;
      if (inFlight || document.visibilityState !== 'visible') {
        schedule();
        return;
      }
      inFlight = true;
      try {
        // A caller that returns nothing is treated as "something changed", so
        // anything not yet reporting keeps the old fast pace rather than
        // quietly going slow behind its own back.
        const changed = await saved.current();
        pace.current = nextPace(pace.current, changed !== false);
      } finally {
        inFlight = false;
        schedule();
      }
    };

    schedule();

    // Coming back to the tab should feel instant, not "up to a minute late" --
    // and it starts fast again, because somebody has just chosen to look.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      pace.current = startingPace();
      if (timer) clearTimeout(timer);
      run();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs]);
}
