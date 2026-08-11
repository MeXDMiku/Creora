import { useEffect, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import { blockRuntimeAtom } from '../state/atoms';
import { animationClass, ANIMATION_DURATION_MS } from '../lib/animations';

/**
 * Returns a CSS class while a block's value is settling after a change.
 *
 * Two things worth knowing:
 *
 * - It does not fire on mount. Otherwise every block on a published page would
 *   animate on arrival, including ones whose value never actually changed.
 * - Re-triggering a CSS animation needs the class removed and re-added; setting
 *   it again while it is already applied does nothing. Hence the off / one
 *   frame / on cycle, which also handles a second change mid-animation.
 */
export function useValueChangeAnimation(blockId: string): string | undefined {
  const runtime = useAtomValue(blockRuntimeAtom(blockId));
  const preset = animationClass(runtime?.animateOnChange);
  const value = runtime?.value;

  const [playing, setPlaying] = useState(false);
  const previous = useRef<any>(value);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      previous.current = value;
      return;
    }
    if (Object.is(previous.current, value)) return;
    previous.current = value;
    if (!preset) return;

    let frame = 0;
    setPlaying(false);
    frame = requestAnimationFrame(() => setPlaying(true));
    const done = setTimeout(() => setPlaying(false), ANIMATION_DURATION_MS);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(done);
    };
  }, [value, preset]);

  return playing && preset ? preset : undefined;
}
