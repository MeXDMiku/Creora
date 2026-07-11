import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useAtomValue, useSetAtom, useStore } from 'jotai';
import { executeWorkflow } from '../lib/bindingEngine';
import { blockRuntimeAtom, activeWireAtom, snapTargetAtom, triggerSaveAtom, contextMenuAtom, getPortBadge, getBlockTypeDisplayName } from '../state/atoms';
import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { useBlockDrag } from '../hooks/useBlockDrag';

const TimerBlockComponent = (props: NodeViewProps) => {
  const { node } = props;
  const { blockId } = node.attrs;
  const store = useStore();
  const [isHovered, setIsHovered] = useState(false);
  const setActiveWire = useSetAtom(activeWireAtom);
  const activeWire = useAtomValue(activeWireAtom);
  const snapTarget = useAtomValue(snapTargetAtom);
  const triggerSave = useSetAtom(triggerSaveAtom);
  const setContextMenu = useSetAtom(contextMenuAtom);

  const atomInstance = useMemo(() => blockRuntimeAtom(blockId), [blockId]);
  const runtimeState = useAtomValue(atomInstance, { store });

  const containerRef = useRef<HTMLElement | null>(null);
  if (!containerRef.current) {
    containerRef.current = document.getElementById('editor-container');
  }

  const { position, handlePointerDown, handlePointerMove, handlePointerUp } = useBlockDrag(blockId, containerRef as React.RefObject<HTMLElement>);

  // Timer configuration values
  const isRunning = !!runtimeState?.value;
  const mode = runtimeState?.mode ?? 'countdown';
  const duration = runtimeState?.duration ?? 10;
  const autoStart = runtimeState?.autoStart ?? false;

  // Track the actual seconds ticked
  const [seconds, setSeconds] = useState(mode === 'interval' ? 0 : duration);

  // Keep countdown/interval seconds in sync when the timer is stopped
  useEffect(() => {
    if (!isRunning) {
      setSeconds(mode === 'interval' ? 0 : duration);
    }
  }, [duration, mode, isRunning]);

  // Handle autoStart on mount
  useEffect(() => {
    if (autoStart && !isRunning) {
      store.set(atomInstance, (curr) => ({ ...curr, value: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, atomInstance, store]);

  // Handle ticking interval with strict useEffect cleanup to prevent orphaned intervals
  useEffect(() => {
    if (!isRunning) return;

    console.log(`[TimerBlock:${blockId}] Ticker interval started. Mode: ${mode}, Start Seconds: ${seconds}`);

    const intervalId = setInterval(() => {
      setSeconds((prev) => {
        if (mode === 'countdown') {
          const next = prev - 1;
          if (next <= 0) {
            console.log(`[TimerBlock:${blockId}] Countdown finished. Triggering onTick and onComplete.`);
            executeWorkflow(blockId, 'onTick', store);
            executeWorkflow(blockId, 'onComplete', store);
            
            // Automatically stop the timer
            store.set(atomInstance, (curr) => ({ ...curr, value: false }));
            triggerSave((s) => s + 1);
            return 0;
          }
          console.log(`[TimerBlock:${blockId}] Tick. Seconds remaining: ${next}`);
          executeWorkflow(blockId, 'onTick', store);
          return next;
        } else {
          // Interval mode: count up
          const next = prev + 1;
          console.log(`[TimerBlock:${blockId}] Tick. Seconds elapsed: ${next}`);
          executeWorkflow(blockId, 'onTick', store);
          return next;
        }
      });
    }, 1000);

    return () => {
      console.log(`[TimerBlock:${blockId}] Ticker interval cleared.`);
      clearInterval(intervalId);
    };
  }, [isRunning, mode, duration, blockId, store, atomInstance, triggerSave]);

  // Handle play/pause toggles
  const toggleTimer = useCallback(() => {
    const nextRunning = !isRunning;
    store.set(atomInstance, (curr) => ({ ...curr, value: nextRunning }));
    triggerSave((s) => s + 1);
  }, [isRunning, store, atomInstance, triggerSave]);

  const onPointerUp = (e: React.PointerEvent) => {
    handlePointerUp(e);
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const x = e.clientX - containerRect.left;
    const y = e.clientY - containerRect.top;
    setContextMenu({
      blockId,
      x,
      y,
      visible: true,
    });
  };

  const onOutputPortPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const portEl = e.currentTarget as HTMLElement;
    const portRect = portEl.getBoundingClientRect();
    const portCenterX = portRect.left + portRect.width / 2 - containerRect.left;
    const portCenterY = portRect.top + portRect.height / 2 - containerRect.top;
    setActiveWire({
      sourceBlockId: blockId,
      sourceX: portCenterX,
      sourceY: portCenterY,
      currentX: portCenterX,
      currentY: portCenterY,
    });
  };

  const isWireActive = activeWire !== null;
  const isWireSource = isWireActive && activeWire.sourceBlockId === blockId;
  const showLeftPort = isHovered || (isWireActive && !isWireSource);
  const isSnapTarget = snapTarget === blockId;
  const showRightPort = isHovered;

  return (
    <NodeViewWrapper 
      as="div" 
      className="timer-block-wrapper" 
      style={{ 
        display: 'block', 
        position: 'absolute', 
        left: `${position.x}px`, 
        top: `${position.y}px`, 
        width: runtimeState?.width !== undefined ? `${runtimeState.width}px` : 'max-content',
        opacity: runtimeState?.opacity !== undefined ? runtimeState.opacity / 100 : 1
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={onPointerUp}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onContextMenu={onContextMenu}
    >
      <div 
        style={{ 
          position: 'absolute',
          top: '-16px',
          left: '0',
          fontSize: '10px', 
          opacity: 0.6, 
          color: '#cbd5e1', 
          userSelect: 'none', 
          fontWeight: 500,
          whiteSpace: 'nowrap',
        }}
      >
        {runtimeState?.blockName || getBlockTypeDisplayName('timerBlock')}
      </div>
      <div
        contentEditable={false}
        style={{
          padding: '8px 16px',
          background: runtimeState?.backgroundColor || '#10b981',
          color: runtimeState?.textColor || 'white',
          borderRadius: runtimeState?.borderRadius !== undefined ? `${runtimeState.borderRadius}px` : '8px',
          cursor: 'pointer',
          border: 'none',
          fontSize: runtimeState?.fontSize !== undefined ? `${runtimeState.fontSize}px` : '14px',
          userSelect: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          width: runtimeState?.width !== undefined ? '100%' : 'auto',
          boxSizing: 'border-box'
        }}
      >
        <span style={{ fontSize: '16px' }}>⏱️</span>
        <span style={{ fontWeight: 600 }}>{seconds}s</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleTimer();
          }}
          style={{
            background: 'rgba(255, 255, 255, 0.25)',
            border: 'none',
            color: 'white',
            borderRadius: '4px',
            padding: '2px 8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            fontSize: '11px',
            fontWeight: 'bold',
            transition: 'background 0.2s',
            outline: 'none'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.4)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)')}
        >
          {isRunning ? '⏸️ Stop' : '▶️ Start'}
        </button>
      </div>
      
      {/* Left (input) port */}
      <div
        contentEditable={false}
        data-port-input={blockId}
        style={{
          position: 'absolute',
          left: '-5px',
          top: '50%',
          transform: isSnapTarget ? 'translateY(-50%) scale(1.5)' : 'translateY(-50%)',
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          backgroundColor: '#22c55e',
          border: '2px solid white',
          boxShadow: isSnapTarget ? '0 0 8px 2px #22c55e' : 'none',
          opacity: showLeftPort ? 1 : 0,
          pointerEvents: showLeftPort ? 'all' as const : 'none' as const,
          transition: 'transform 0.15s, box-shadow 0.15s, opacity 0.15s',
        }}
      >
        <span style={{
          position: 'absolute',
          left: '12px',
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: '10px',
          fontWeight: 'bold',
          color: '#22c55e',
          pointerEvents: 'none',
          userSelect: 'none',
        }}>
          {getPortBadge('trigger')}
        </span>
      </div>
      
      {/* Right (output) port */}
      <div
        contentEditable={false}
        data-port-output={blockId}
        onPointerDown={onOutputPortPointerDown}
        style={{
          position: 'absolute',
          right: '-5px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          backgroundColor: '#6366f1',
          border: '2px solid white',
          opacity: showRightPort ? 1 : 0,
          pointerEvents: showRightPort ? 'all' as const : 'none' as const,
          cursor: 'crosshair',
          transition: 'opacity 0.15s',
        }}
      >
        <span style={{
          position: 'absolute',
          right: '12px',
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: '10px',
          fontWeight: 'bold',
          color: '#6366f1',
          pointerEvents: 'none',
          userSelect: 'none',
        }}>
          {getPortBadge('trigger')}
        </span>
      </div>
    </NodeViewWrapper>
  );
};

export const TimerBlock = Node.create({
  name: 'timerBlock',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      blockId: {
        default: () => 'tmr_' + Math.random().toString(36).substring(2, 11),
      }
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="timer-block"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-type': 'timer-block', ...HTMLAttributes }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TimerBlockComponent, { as: 'div' });
  },
});
