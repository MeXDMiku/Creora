import { useEffect, useRef, useState } from 'react';
import { startingPace, nextPace, type PollPace } from '../lib/pollPace';
import { supabase } from '../lib/supabase';
import {
  topicFor, idleLive, paceFor, afterSignal, afterFetch, afterConnection,
  SIGNAL_COALESCE_MS, type LiveState,
} from '../lib/liveChanges';

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
 *
 * AND SINCE 24 AUG IT CAN ALSO BE TOLD.
 * Pass a `blockId` and it subscribes to that block's signal topic. The signal
 * carries no data -- see lib/liveChanges.ts for why that is the whole trick --
 * so being told means "ask now" rather than "here are the rows", and the read
 * still goes through the same RPC with the same authorisation as before.
 *
 * THE TIMER NEVER STOPS. A live connection shortcuts the wait; it does not
 * replace it. paceFor() will not go slower than POLL_SLOW_MS, which is where
 * this already rested, so the worst case with realtime is the worst case
 * without it -- and a socket that dies quietly costs one slow round rather
 * than the silence pollPace.ts exists to refuse.
 *
 * Without migration 0010 nothing broadcasts, `connected` stays false, and this
 * behaves exactly as it did.
 */
export function usePollWhileVisible(
  fn: () => void | Promise<void> | boolean | Promise<boolean>,
  intervalMs?: number,
  /** Listen for this block's changes as well as asking on a timer. */
  blockId?: string,
) {
  const saved = useRef(fn);
  saved.current = fn;
  const pace = useRef<PollPace>(startingPace());
  const live = useRef<LiveState>(idleLive());
  /**
   * State, not only the ref, because something has to be able to DRAW this.
   * Only the CONNECTION is state -- a signal would re-render once per message,
   * which on a busy table is exactly the cost this feature exists to remove.
   */
  const [connected, setConnected] = useState(false);

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
      timer = setTimeout(run, intervalMs ?? paceFor(live.current, pace.current, Date.now()));
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
        live.current = afterFetch(live.current, Date.now());
      } finally {
        inFlight = false;
        schedule();
      }
    };

    schedule();

    /**
     * BEING TOLD. A burst is one read: twenty people posting inside a second is
     * twenty broadcasts, and reading twenty times would cost more egress than
     * the polling this replaces -- the whole point, inverted. So each signal
     * restarts a short settle timer and the read happens when it goes quiet.
     */
    let settle: ReturnType<typeof setTimeout> | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    if (blockId) {
      // A private channel needs the socket to carry the caller's token.
      void supabase.realtime?.setAuth?.();
      channel = supabase
        .channel(topicFor(blockId), { config: { private: true } })
        .on('broadcast', { event: 'rows' }, () => {
          live.current = afterSignal(live.current, Date.now());
          if (settle) clearTimeout(settle);
          settle = setTimeout(() => {
            if (stopped) return;
            if (timer) clearTimeout(timer);
            void run();
          }, SIGNAL_COALESCE_MS);
        })
        .subscribe((status: string) => {
          const up = status === 'SUBSCRIBED';
          live.current = afterConnection(live.current, up);
          setConnected(up);
        });
    }

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
      if (settle) clearTimeout(settle);
      if (channel) void supabase.removeChannel(channel);
      live.current = afterConnection(live.current, false);
      setConnected(false);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs, blockId]);

  return { connected, live };
}
