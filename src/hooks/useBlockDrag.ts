import { useRef, useCallback } from 'react';
import { useSetAtom, useAtomValue } from 'jotai';
import { blockPositionAtom, selectedBlockIdAtom, triggerSaveAtom, isPreviewModeAtom, editingBreakpointAtom } from '../state/atoms';
import { resolveLayout } from '../lib/layout';

export function useBlockDrag(blockId: string, containerRef: React.RefObject<HTMLElement>) {
  /**
   * The one place breakpoints touch dragging.
   *
   * The drag maths is unchanged. What changed is which key it reads and writes:
   * arranging the phone layout writes into `phone`, and a block that had never
   * been placed there becomes placed the moment it is moved -- which is exactly
   * how "automatic until you touch it" is implemented.
   */
  const placement = useAtomValue(blockPositionAtom(blockId));
  const setPlacement = useSetAtom(blockPositionAtom(blockId));
  const breakpoint = useAtomValue(editingBreakpointAtom);

  const resolved = resolveLayout(placement, breakpoint);
  const position = { x: resolved.x, y: resolved.y };

  const setPosition = useCallback(
    (next: { x: number; y: number }) => {
      setPlacement((prev) =>
        breakpoint === 'phone'
          ? { ...prev, phone: { ...(prev.phone || {}), x: next.x, y: next.y } }
          : { ...prev, x: next.x, y: next.y }
      );
    },
    [setPlacement, breakpoint]
  );
  const setSelected = useSetAtom(selectedBlockIdAtom);
  const triggerSave = useSetAtom(triggerSaveAtom);
  const isPreviewMode = useAtomValue(isPreviewModeAtom);

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
    if (isPreviewMode) {
      dragState.current = {
        grabOffsetX: 0,
        grabOffsetY: 0,
        startClientX: e.clientX,
        startClientY: e.clientY,
        hasMoved: false,
      };
      return;
    }
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
  }, [position.x, position.y, containerRef, isPreviewMode]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (isPreviewMode) return;
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
  }, [setPosition, containerRef, triggerSave, isPreviewMode]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragState.current) return;
    const wasClick = !dragState.current.hasMoved;
    const didMove = dragState.current.hasMoved;
    dragState.current = null;
    if (!isPreviewMode) {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      if (wasClick) {
        setSelected(blockId);
      }
      if (didMove) {
        triggerSave(prev => prev + 1);
      }
    }
    return wasClick;
  }, [blockId, setSelected, triggerSave, isPreviewMode]);

  return {
    position,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}
