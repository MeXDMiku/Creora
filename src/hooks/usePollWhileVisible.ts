import { useEffect, useRef } from 'react';

/**
 * Re-runs a fetch on an interval so a Database block shows rows as they arrive,
 * instead of only what existed when the page loaded.
 *
 * This is what makes a published Creora page feel shared rather than static:
 * a visitor submits on their phone and the owner's table grows on their screen
 * without a refresh.
 *
 * Polling rather than Supabase Realtime, deliberately. Realtime's
 * postgres_changes respects RLS, and Creora's tables have RLS enabled with no
 * policies at all — every read goes through a SECURITY DEFINER RPC instead. So
 * realtime would deliver nothing without either opening the tables up or adding
 * broadcast triggers and realtime.messages policies. Polling reuses the
 * authorisation that already exists and is already proven.
 *
 * It pauses whenever the tab is hidden, and refetches once on return. The free
 * plan includes 5 GB of egress a month; a background tab polling forever is a
 * silly way to spend it.
 */
export function usePollWhileVisible(fn: () => void | Promise<void>, intervalMs = 4000) {
  const saved = useRef(fn);
  saved.current = fn;

  useEffect(() => {
    let inFlight = false;

    const run = async () => {
      if (inFlight || document.visibilityState !== 'visible') return;
      inFlight = true;
      try {
        await saved.current();
      } finally {
        inFlight = false;
      }
    };

    const id = setInterval(run, intervalMs);
    // Coming back to the tab should feel instant, not "up to intervalMs late".
    const onVisible = () => {
      if (document.visibilityState === 'visible') run();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs]);
}
