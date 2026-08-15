import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useAtomValue, useSetAtom, useStore } from 'jotai';
import { blockRuntimeAtom, activeWireAtom, contextMenuAtom, getPortBadge, getBlockTypeDisplayName } from '../state/atoms';
import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { useBlockDrag } from '../hooks/useBlockDrag';
import { blockToCSS } from '../lib/renderBlockStyles';
import { FieldView, FieldError } from './FieldView';

const InputBlockComponent = (props: NodeViewProps) => {
  const { node } = props;
  const { blockId } = node.attrs;
  const store = useStore();
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

  /**
   * Everything that used to live here -- the value, the touched rule, the
   * change and blur handlers, the error colours -- moved into FieldView, which
   * the published renderer uses too. Ten field types drawn twice would be
   * twenty places for a date picker to behave differently once published.
   */

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

  const { outer: outerStyle, inner: innerStyle } = blockToCSS('inputBlock', position, runtimeState);

  return (
    <NodeViewWrapper 
      ref={wrapperRef}
      as="div" 
      className="input-block-wrapper" 
      style={{
        ...outerStyle,
        cursor: 'move',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
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
        {runtimeState?.blockName || getBlockTypeDisplayName('inputBlock')}
      </div>
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

      <FieldView blockId={blockId} style={innerStyle} stopPointerDown />
      {/*
        The complaint. Absolutely positioned so appearing does not shove the rest
        of the canvas down, and switchable off entirely -- a builder who wants
        the message inside their own design turns this off and reads the field's
        error from their markup instead.
      */}
      <div style={{ position: 'absolute', top: '100%', left: 0, pointerEvents: 'none', userSelect: 'none', whiteSpace: 'nowrap' }}>
        <FieldError blockId={blockId} />
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
        parseHTML: (element: HTMLElement) => element.getAttribute('data-blockid'),
        renderHTML: (attributes: Record<string, any>) =>
          attributes.blockId ? { 'data-blockid': attributes.blockId } : {},
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
