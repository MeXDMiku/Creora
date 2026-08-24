/**
 * Primitive E: being TOLD that something changed, instead of asking.
 *
 * WHAT THIS IS NOT
 * It is not a new trigger word, and it does not add a block. The chain that
 * reacts to rows arriving already exists end to end: `fetchListBlockRows` puts
 * new rows on a Database block, that fires the block's `onChange`, and every
 * formula, list and workflow downstream already follows. The only thing missing
 * was ever *knowing* -- so this supplies the knowing and changes nothing else.
 *
 * That is why a channel going live, a viewer count and an upload finishing all
 * come from one small piece of work rather than three features.
 *
 * THE OBJECTION IT HAS TO ANSWER
 * `usePollWhileVisible` says, in writing, why this was NOT done with realtime:
 *
 *   "Realtime's postgres_changes respects RLS, and Creora's tables have RLS
 *    enabled with no policies at all -- every read goes through a SECURITY
 *    DEFINER RPC instead. So realtime would deliver nothing without either
 *    opening the tables up or adding broadcast triggers."
 *
 * That objection is correct and this does not argue with it. It sidesteps it:
 *
 *   >>> THE SIGNAL CARRIES NO DATA. <<<
 *
 * A broadcast says "block X changed" and nothing else. The page then re-reads
 * through `list_database_rows`, the same SECURITY DEFINER RPC it uses today,
 * which already decides who may see what and is already proven. Nothing is
 * opened up, and no row ever travels over the realtime channel.
 *
 * What a subscriber learns is that a table they can already poll has changed.
 * Anyone who can open the page can already observe exactly that by watching the
 * count. So the signal tells them nothing polling would not.
 *
 * AND IT IS NEVER SLOWER THAN TODAY
 * The safety net stays. When a live connection is up, the page still polls at
 * the slowest existing pace -- it just also fetches the instant it is told. So
 * the worst case with realtime equals the worst case without it, and a
 * connection that dies quietly costs one slow round rather than silence.
 * `pollPace.ts` refuses to ever stop asking for that reason, and this keeps the
 * refusal.
 *
 * WITHOUT THE MIGRATION IT DOES NOTHING, AND THAT IS FINE
 * No trigger means no broadcasts, `connected` stays false, and every page
 * behaves exactly as it does today. There is no half-working state.
 */
import { POLL_SLOW_MS, type PollPace } from './pollPace';

/** The slowest a page ever goes while it is being told. Deliberately the same
 *  number as the existing slow pace: live is a shortcut, not a licence. */
export const LIVE_HEARTBEAT_MS = POLL_SLOW_MS;

/**
 * A burst of inserts is one fetch.
 *
 * Twenty people posting in a chat inside one second is twenty broadcasts and
 * should be one read, or the signal costs more egress than the polling it
 * replaced -- which would be the whole point, inverted.
 */
export const SIGNAL_COALESCE_MS = 250;

/**
 * How long a connection may be quiet before it is treated as unproven.
 *
 * Not "dead" -- an idle table is quiet for hours and that is correct. This only
 * decides whether to trust `connected` enough to slow down, and the answer is
 * that we never slow past the existing floor anyway, so it is belt and braces.
 */
export const LIVE_STALE_MS = 15 * 60 * 1000;

/** Everyone looking at the same Database block listens to the same name. */
export function topicFor(blockId: string): string {
  return `creora:rows:${String(blockId ?? '').trim()}`;
}

export function blockIdFromTopic(topic: string): string | null {
  const t = String(topic ?? '');
  return t.startsWith('creora:rows:') ? t.slice('creora:rows:'.length) || null : null;
}

export interface LiveState {
  /** The channel says it is subscribed. */
  connected: boolean;
  /** When a signal last arrived, or null. */
  signalledAt: number | null;
  /** When rows were last actually fetched. */
  fetchedAt: number | null;
}

export const idleLive = (): LiveState => ({ connected: false, signalledAt: null, fetchedAt: null });

/**
 * How long to wait before asking again.
 *
 * THE ONE RULE: live never makes it slower than the slowest it already was.
 * A page that is being told still asks on a heartbeat, so a connection that
 * dies without saying so costs one round, not silence.
 */
export function paceFor(live: LiveState, pace: PollPace, now: number): number {
  if (!live.connected) return pace.intervalMs;
  const proven = live.signalledAt !== null && now - live.signalledAt < LIVE_STALE_MS;
  // Slow to the floor once the connection has proved itself; until then, keep
  // whatever pace the poll loop had worked out on its own.
  return proven ? LIVE_HEARTBEAT_MS : Math.min(pace.intervalMs, LIVE_HEARTBEAT_MS);
}

/** A broadcast arrived. */
export function afterSignal(live: LiveState, now: number): LiveState {
  return { ...live, signalledAt: now };
}

/** Rows were read. */
export function afterFetch(live: LiveState, now: number): LiveState {
  return { ...live, fetchedAt: now };
}

/** The channel came up or went down. Going down forgets nothing except trust. */
export function afterConnection(live: LiveState, connected: boolean): LiveState {
  return connected ? { ...live, connected: true } : { ...live, connected: false };
}

/**
 * Is there a signal that has not been read yet, and has the burst settled?
 *
 * Both halves matter. Without the first a heartbeat would fetch forever;
 * without the second a chat would fetch once per message.
 */
export function shouldFetchNow(live: LiveState, now: number): boolean {
  if (live.signalledAt === null) return false;
  if (live.fetchedAt !== null && live.fetchedAt >= live.signalledAt) return false;
  return now - live.signalledAt >= SIGNAL_COALESCE_MS;
}

/**
 * What to say about it on the Health panel.
 *
 * A builder cannot see a websocket. They can see that their page is either
 * being told or asking, and the difference is the whole feature -- so it is
 * said in words rather than left to be inferred from how fresh things feel.
 */
export function describeLive(live: LiveState, now: number): string {
  if (!live.connected) {
    return 'This page asks for new rows on a timer. Run the live-changes migration and it will be told instead.';
  }
  if (live.signalledAt === null) {
    return 'Connected for live changes. Nothing has changed yet, so nothing has been sent.';
  }
  const secs = Math.max(0, Math.round((now - live.signalledAt) / 1000));
  return `Being told about changes. Last one ${secs === 0 ? 'just now' : `${secs}s ago`}.`;
}
