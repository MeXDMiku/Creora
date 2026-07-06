import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useAtomValue, useSetAtom, useStore, useAtom } from 'jotai';
import { executeWorkflow } from '../lib/bindingEngine';
import { blockRuntimeAtom, activeWireAtom, snapTargetAtom, triggerSaveAtom, selectedBlockIdAtom, contextMenuAtom, getPortBadge } from '../state/atoms';
import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { useBlockDrag } from '../hooks/useBlockDrag';

const InputBlockComponent = (props: NodeViewProps) => {
  const { node } = props;
  const { blockId } = node.attrs;
  const store = useStore();
  const [isHovered, setIsHovered] = useState(false);
  const setActiveWire = useSetAtom(activeWireAtom);
  const activeWire = useAtomValue(activeWireAtom);
  const triggerSave = useSetAtom(triggerSaveAtom);
  const setContextMenu = useSetAtom(contextMenuAtom);

  const atomInstance = useMemo(() => blockRuntimeAtom(blockId), [blockId]);
  const runtimeState = useAtomValue(atomInstance, { store });

  const containerRef = useRef<HTMLElement | null>(null);
  if (!containerRef.current) {
    containerRef.current = document.getElementById('editor-container');
  }

  const { position, handlePointerDown, handlePointerMove, handlePointerUp } = useBlockDrag(blockId, containerRef as React.RefObject<HTMLElement>);

  const runtimeValue = typeof runtimeState?.value === 'string' ? runtimeState.value : '';

  // Native DOM ref for context menu — bypasses React's synthetic events entirely
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const handleContextMenu = useCallback((e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
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
  }, [blockId, setContextMenu]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    el.addEventListener('contextmenu', handleContextMenu, true);
    return () => {
      el.removeEventListener('contextmenu', handleContextMenu, true);
    };
  }, [handleContextMenu]);

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

  const showRightPort = isHovered;

  return (
    <NodeViewWrapper 
      ref={wrapperRef}
      as="div" 
      className="input-block-wrapper" 
      style={{ 
        display: 'flex',
        alignItems: 'center',
        position: 'absolute', 
        left: `${position.x}px`, 
        top: `${position.y}px`, 
        width: runtimeState?.width !== undefined ? `${runtimeState.width}px` : '240px',
        opacity: runtimeState?.opacity !== undefined ? runtimeState.opacity / 100 : 1,
        background: runtimeState?.backgroundColor || '#1e293b',
        borderRadius: runtimeState?.borderRadius !== undefined ? `${runtimeState.borderRadius}px` : '8px',
        padding: '6px 10px',
        boxSizing: 'border-box',
        cursor: 'move',
        gap: '8px',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Visual drag grip handle */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          cursor: 'grab',
          userSelect: 'none',
          opacity: 0.6,
          padding: '2px 4px',
        }}
      >
        <div style={{ display: 'flex', gap: '2px' }}>
          <div style={{ width: '3px', height: '3px', borderRadius: '50%', background: '#94a3b8' }} />
          <div style={{ width: '3px', height: '3px', borderRadius: '50%', background: '#94a3b8' }} />
        </div>
        <div style={{ display: 'flex', gap: '2px' }}>
          <div style={{ width: '3px', height: '3px', borderRadius: '50%', background: '#94a3b8' }} />
          <div style={{ width: '3px', height: '3px', borderRadius: '50%', background: '#94a3b8' }} />
        </div>
        <div style={{ display: 'flex', gap: '2px' }}>
          <div style={{ width: '3px', height: '3px', borderRadius: '50%', background: '#94a3b8' }} />
          <div style={{ width: '3px', height: '3px', borderRadius: '50%', background: '#94a3b8' }} />
        </div>
      </div>

      <input
        type="text"
        value={runtimeValue}
        onPointerDown={(e) => e.stopPropagation()} // Stop propagation so clicking in text box focuses it instead of dragging
        onChange={(e) => {
          store.set(atomInstance, {
            ...runtimeState,
            value: e.target.value
          });
          executeWorkflow(blockId, 'onChange', store);
          triggerSave(prev => prev + 1);
        }}
        style={{
          flex: 1,
          boxSizing: 'border-box',
          padding: '6px 12px',
          background: '#ffffff',
          color: '#1e293b',
          border: '1px solid #cbd5e1',
          borderRadius: '4px',
          outline: 'none',
          fontSize: '14px',
        }}
        placeholder="Type something..."
      />
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
          {getPortBadge('string')}
        </span>
      </div>
    </NodeViewWrapper>
  );
};

export const InputBlock = Node.create({
  name: 'inputBlock',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      blockId: {
        default: () => 'inp_' + Math.random().toString(36).substring(2, 11),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="input-block"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-type': 'input-block', ...HTMLAttributes }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(InputBlockComponent, { as: 'div' });
  },
});
