import { useRef, useCallback } from 'react';
import { useSetAtom, useAtomValue } from 'jotai';
import { blockPositionAtom, selectedBlockIdAtom, triggerSaveAtom } from '../state/atoms';

export function useBlockDrag(blockId: string, containerRef: React.RefObject<HTMLElement>) {
  const position = useAtomValue(blockPositionAtom(blockId));
  const setPosition = useSetAtom(blockPositionAtom(blockId));
  const setSelected = useSetAtom(selectedBlockIdAtom);
  const triggerSave = useSetAtom(triggerSaveAtom);

  const dragState = useRef<{
    grabOffsetX: number;
    grabOffsetY: number;
    startClientX: number;
    startClientY: number;
    hasMoved: boolean;
  } | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    if (e.button !== 0) return; // Only drag on left click
    const container = containerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const cursorXInContainer = e.clientX - containerRect.left;
    const cursorYInContainer = e.clientY - containerRect.top;

    dragState.current = {
      grabOffsetX: cursorXInContainer - position.x,
      grabOffsetY: cursorYInContainer - position.y,
      startClientX: e.clientX,
      startClientY: e.clientY,
      hasMoved: false,
    };

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [position.x, position.y, containerRef]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current) return;
    const container = containerRef.current;
    if (!container) return;

    const dx = e.clientX - dragState.current.startClientX;
    const dy = e.clientY - dragState.current.startClientY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > 5) {
      dragState.current.hasMoved = true;
      const containerRect = container.getBoundingClientRect();
      const cursorXInContainer = e.clientX - containerRect.left;
      const cursorYInContainer = e.clientY - containerRect.top;

      setPosition({
        x: cursorXInContainer - dragState.current.grabOffsetX,
        y: cursorYInContainer - dragState.current.grabOffsetY,
      });
      triggerSave(prev => prev + 1);
    }
  }, [setPosition, containerRef, triggerSave]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragState.current) return;
    const wasClick = !dragState.current.hasMoved;
    const didMove = dragState.current.hasMoved;
    dragState.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    if (wasClick) {
      setSelected(blockId);
    }
    if (didMove) {
      triggerSave(prev => prev + 1);
    }
    return wasClick;
  }, [blockId, setSelected, triggerSave]);

  return {
    position,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}
