import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useAtomValue, useSetAtom, useStore } from 'jotai';
import { blockRuntimeAtom, activeWireAtom, snapTargetAtom, contextMenuAtom, getPortBadge, getBlockTypeDisplayName } from '../state/atoms';
import { useMemo, useRef, useState } from 'react';
import { useBlockDrag } from '../hooks/useBlockDrag';

const NumberDisplayBlockComponent = (props: NodeViewProps) => {
  const store = useStore();
  const { node } = props;
  const { blockId } = node.attrs;
  const [isHovered, setIsHovered] = useState(false);
  const setActiveWire = useSetAtom(activeWireAtom);
  const activeWire = useAtomValue(activeWireAtom);
  const snapTarget = useAtomValue(snapTargetAtom);
  const setContextMenu = useSetAtom(contextMenuAtom);
  
  const atomInstance = useMemo(() => blockRuntimeAtom(blockId), [blockId]);
  const runtimeState = useAtomValue(atomInstance, { store });

  const containerRef = useRef<HTMLElement | null>(null);
  if (!containerRef.current) {
    containerRef.current = document.getElementById('editor-container');
  }

  const { position, handlePointerDown, handlePointerMove, handlePointerUp } = useBlockDrag(blockId, containerRef as React.RefObject<HTMLElement>);

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
      className="number-display-block-wrapper" 
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
      onPointerUp={handlePointerUp}
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
        {runtimeState?.blockName || getBlockTypeDisplayName('numberDisplayBlock')}
      </div>
      <div
        contentEditable={false}
        style={{
          fontSize: runtimeState?.fontSize !== undefined ? `${runtimeState.fontSize}px` : '2rem',
          fontWeight: 700,
          color: runtimeState?.textColor || '#ffffff',
          background: runtimeState?.backgroundColor || '#1e293b',
          borderRadius: runtimeState?.borderRadius !== undefined ? `${runtimeState.borderRadius}px` : '8px',
          padding: '12px 24px',
          minWidth: '80px',
          minHeight: '48px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: runtimeState?.width !== undefined ? '100%' : 'auto',
          boxSizing: 'border-box',
          userSelect: 'none',
          cursor: 'move',
        }}
      >
        {String(runtimeState?.value ?? '')}
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
          {getPortBadge('number')}
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
          {getPortBadge('number')}
        </span>
      </div>
    </NodeViewWrapper>
  );
};

export const NumberDisplayBlock = Node.create({
  name: 'numberDisplayBlock',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      blockId: {
        default: () => 'num_' + Math.random().toString(36).substring(2, 11),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="number-display-block"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-type': 'number-display-block', ...HTMLAttributes }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(NumberDisplayBlockComponent, { as: 'div' });
  },
});
