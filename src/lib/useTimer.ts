import { useCallback, useEffect, useState } from 'react';
import { blockRuntimeAtom } from '../state/atoms';
import { executeWorkflow } from './bindingEngine';

/**
 * A Timer block's behaviour, for both renderers.
 *
 * WHY THIS IS SHARED, AND WHY IT IS THE ONE THAT MATTERS MOST
 * The whole of it -- auto-start, ticking, countdown versus interval, when
 * onTick and onComplete fire, when the timer stops itself -- was written out
 * twice: once in the editor's block and once in the published renderer. The
 * Timer is the most stateful thing in the product and the only block that acts
 * on its own, so a divergence here is not a cosmetic one. It means a workflow
 * that fires on a published page and not while building it, or the other way
 * round, with nothing on screen to say so.
 *
 * The two renderers still differ in one thing, deliberately: the editor asks
 * for a save when the timer's running state changes, and the published page
 * does not, because a visitor pressing play must not write to the page. That
 * is passed in rather than decided here.
 */

export type TimerMode = 'countdown' | 'interval';

export interface TimerStep {
  /** The seconds to show after this tick. */
  next: number;
  /** Fire onTick. */
  tick: boolean;
  /** Fire onComplete. */
  complete: boolean;
  /** Stop the timer -- it has finished on its own. */
  stop: boolean;
}

/**
 * What one second does.
 *
 * Pulled out of the hook because a hook cannot be run by this project's
 * checks, and everything worth being sure about is in here: a countdown that
 * reaches zero fires BOTH onTick and onComplete and then stops itself, while
 * an interval counts up for ever and only ever ticks.
 *
 * The order matters and is not arbitrary. onTick fires before onComplete so a
 * workflow counting ticks sees the last one; a builder who wired "add 1 on
 * every tick" to a ten-second countdown expects ten, not nine.
 */
export function timerStep(previous: number, mode: TimerMode): TimerStep {
  if (mode === 'countdown') {
    const next = previous - 1;
    if (next <= 0) {
      // Zero, not the negative it would otherwise reach: a countdown that
      // shows -1 for an instant before stopping looks broken.
      return { next: 0, tick: true, complete: true, stop: true };
    }
    return { next, tick: true, complete: false, stop: false };
  }
  return { next: previous + 1, tick: true, complete: false, stop: false };
}

/** Where a stopped timer sits: a countdown at its full duration, an interval at zero. */
export function timerResetValue(mode: TimerMode, duration: number): number {
  return mode === 'interval' ? 0 : duration;
}

export interface UseTimerOptions {
  blockId: string;
  store: any;
  /**
   * Called when the running state changes and the page should be saved.
   * Absent on a published page: a visitor pressing play must not write to
   * somebody else's page.
   */
  onStateChanged?: () => void;
}

export function useTimer({ blockId, store, onStateChanged }: UseTimerOptions) {
  const runtimeState = store.get(blockRuntimeAtom(blockId));
  const isRunning = !!runtimeState?.value;
  const mode: TimerMode = runtimeState?.mode ?? 'countdown';
  const duration: number = runtimeState?.duration ?? 10;
  const autoStart: boolean = runtimeState?.autoStart ?? false;

  const [seconds, setSeconds] = useState(() => timerResetValue(mode, duration));

  // A stopped timer follows its settings, so changing the duration in the
  // inspector shows the new number straight away rather than after a run.
  useEffect(() => {
    if (!isRunning) setSeconds(timerResetValue(mode, duration));
  }, [duration, mode, isRunning]);

  useEffect(() => {
    if (autoStart && !isRunning) {
      store.set(blockRuntimeAtom(blockId), (curr: any) => ({ ...curr, value: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, blockId, store]);

  useEffect(() => {
    if (!isRunning) return;

    const intervalId = setInterval(() => {
      setSeconds((prev) => {
        const step = timerStep(prev, mode);
        if (step.tick) executeWorkflow(blockId, 'onTick', store);
        if (step.complete) executeWorkflow(blockId, 'onComplete', store);
        if (step.stop) {
          store.set(blockRuntimeAtom(blockId), (curr: any) => ({ ...curr, value: false }));
          onStateChanged?.();
        }
        return step.next;
      });
    }, 1000);

    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, mode, duration, blockId, store]);

  const toggle = useCallback(() => {
    store.set(blockRuntimeAtom(blockId), (curr: any) => ({ ...curr, value: !isRunning }));
    onStateChanged?.();
  }, [isRunning, blockId, store, onStateChanged]);

  return { seconds, isRunning, mode, duration, toggle };
}
