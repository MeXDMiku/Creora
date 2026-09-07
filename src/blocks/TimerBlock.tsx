import { Node } from '@tiptap/core';
import { useTimer } from '../lib/useTimer';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useAtomValue, useSetAtom, useStore } from 'jotai';
import { blockRuntimeAtom, activeWireAtom, snapTargetAtom, triggerSaveAtom, contextMenuAtom, getPortBadge, getBlockTypeDisplayName } from '../state/atoms';
import { useMemo, useRef, useState } from 'react';
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

  /**
   * The whole of a Timer's behaviour lives in lib/useTimer.ts, shared with the
   * published renderer. It was written out twice, and the Timer is the only
   * block that acts on its own -- a divergence here means a workflow that fires
   * on a published page and not while building it, with nothing on screen to
   * say so.
   *
   * The editor asks for a save when the running state changes; the published
   * page does not, because a visitor pressing play must not write to somebody
   * else's page. That difference is passed in rather than decided in there.
   */
  const { seconds, isRunning, toggle: toggleTimer } = useTimer({
    blockId,
    store,
    onStateChanged: () => triggerSave((s) => s + 1),
  });

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
      data-block-id={blockId}
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
        title="Something wired into here makes this block react"
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
        title="Drag from here to another block: this hands over its value and makes that block react"
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
        parseHTML: (element: HTMLElement) => element.getAttribute('data-blockid'),
        renderHTML: (attributes: Record<string, any>) =>
          attributes.blockId ? { 'data-blockid': attributes.blockId } : {},
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
