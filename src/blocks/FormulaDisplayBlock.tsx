import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useAtomValue, useSetAtom, useStore } from 'jotai';
import { blockRuntimeAtom, activeWireAtom, contextMenuAtom, getPortBadge } from '../state/atoms';
import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { useBlockDrag } from '../hooks/useBlockDrag';

const FormulaDisplayBlockComponent = (props: NodeViewProps) => {
  const store = useStore();
  const { node } = props;
  const { blockId } = node.attrs;
  const [isHovered, setIsHovered] = useState(false);
  const setActiveWire = useSetAtom(activeWireAtom);
  const setContextMenu = useSetAtom(contextMenuAtom);
  
  const atomInstance = useMemo(() => blockRuntimeAtom(blockId), [blockId]);
  const runtimeState = useAtomValue(atomInstance, { store });

  const containerRef = useRef<HTMLElement | null>(null);
  if (!containerRef.current) {
    containerRef.current = document.getElementById('editor-container');
  }

  const { position, handlePointerDown, handlePointerMove, handlePointerUp } = useBlockDrag(blockId, containerRef as React.RefObject<HTMLElement>);

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
      className="formula-display-block-wrapper" 
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
    >
      <div
        contentEditable={false}
        style={{
          fontSize: runtimeState?.fontSize !== undefined ? `${runtimeState.fontSize}px` : '1.8rem',
          fontWeight: 700,
          color: runtimeState?.textColor || '#ffffff',
          background: runtimeState?.backgroundColor || '#7c3aed', // Beautiful deep violet for formula blocks
          borderRadius: runtimeState?.borderRadius !== undefined ? `${runtimeState.borderRadius}px` : '8px',
          padding: '10px 20px',
          minWidth: '90px',
          minHeight: '44px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: runtimeState?.width !== undefined ? '100%' : 'auto',
          boxSizing: 'border-box',
          userSelect: 'none',
          cursor: 'move',
          gap: '8px',
          boxShadow: '0 4px 6px -1px rgba(124, 58, 237, 0.2), 0 2px 4px -1px rgba(124, 58, 237, 0.1)',
        }}
      >
        <span style={{ 
          fontSize: '11px', 
          background: 'rgba(255, 255, 255, 0.2)', 
          padding: '2px 6px', 
          borderRadius: '4px',
          textTransform: 'uppercase',
          fontWeight: 'bold',
          letterSpacing: '0.5px'
        }}>
          fx
        </span>
        {String(runtimeState?.value ?? '0')}
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

export const FormulaDisplayBlock = Node.create({
  name: 'formulaDisplayBlock',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      blockId: {
        default: () => 'frm_' + Math.random().toString(36).substring(2, 11),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="formula-display-block"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-type': 'formula-display-block', ...HTMLAttributes }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FormulaDisplayBlockComponent, { as: 'div' });
  },
});
