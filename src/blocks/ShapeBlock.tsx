import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useAtomValue, useSetAtom, useStore } from 'jotai';
import { executeWorkflow, recalculateAllFormulas } from '../lib/bindingEngine';
import {
  blockRuntimeAtom,
  activeWireAtom,
  snapTargetAtom,
  triggerSaveAtom,
  contextMenuAtom,
  getPortBadge,
  shapeRoleDataType,
  getBlockTypeDisplayName,
  switchPageFnAtom,
  isPreviewModeAtom,
} from '../state/atoms';
import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { useBlockDrag } from '../hooks/useBlockDrag';
import { blockToCSS } from '../lib/renderBlockStyles';

const ShapeBlockComponent = (props: NodeViewProps) => {
  const store = useStore();
  const { node } = props;
  const { blockId } = node.attrs;
  const [isHovered, setIsHovered] = useState(false);
  const setActiveWire = useSetAtom(activeWireAtom);
  const activeWire = useAtomValue(activeWireAtom);
  const snapTarget = useAtomValue(snapTargetAtom);
  const triggerSave = useSetAtom(triggerSaveAtom);
  const setContextMenu = useSetAtom(contextMenuAtom);

  const atomInstance = useMemo(() => blockRuntimeAtom(blockId), [blockId]);
  const runtimeState = useAtomValue(atomInstance, { store });
  const isPreviewMode = useAtomValue(isPreviewModeAtom);

  const containerRef = useRef<HTMLElement | null>(null);
  if (!containerRef.current) {
    containerRef.current = document.getElementById('editor-container');
  }

  const { position, handlePointerDown, handlePointerMove, handlePointerUp } = useBlockDrag(
    blockId,
    containerRef as React.RefObject<HTMLElement>
  );

  const role = runtimeState?.role ?? null;
  const isTrigger = role === 'trigger';
  const isLink = role === 'link';
  const isDisplay = role === 'display';
  const isInput = role === 'input';
  // A shape earns a left port when something can flow INTO it and a right port
  // when something can flow OUT. The role decides that, not the block type.
  const hasInputPort = isTrigger || isDisplay;
  const hasOutputPort = isTrigger || isInput;
  const isClickable = isTrigger || isLink;
  const portType = shapeRoleDataType(role);

  // Native DOM ref for context menu
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const handleContextMenu = useCallback((e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (isPreviewMode) return;
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
  }, [blockId, setContextMenu, isPreviewMode]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    el.addEventListener('contextmenu', handleContextMenu, true);
    return () => {
      el.removeEventListener('contextmenu', handleContextMenu, true);
    };
  }, [handleContextMenu]);

  const onPointerUp = (e: React.PointerEvent) => {
    const wasClick = handlePointerUp(e);
    if (wasClick && isClickable) {
      executeWorkflow(blockId, 'onClick', store);
      if (isPreviewMode) {
        const targetPageId = runtimeState?.targetPageId;
        if (targetPageId) {
          const switchPageFn = store.get(switchPageFnAtom);
          if (switchPageFn) {
            switchPageFn(targetPageId);
          }
        }
      }
      triggerSave(prev => prev + 1);
    }
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
  const showLeftPort = isTrigger && (isHovered || (isWireActive && !isWireSource));
  const isSnapTarget = snapTarget === blockId;
  const showRightPort = isTrigger && isHovered;

  const { outer: outerStyle, inner: innerStyle } = blockToCSS('shapeBlock', position, runtimeState);

  return (
    <NodeViewWrapper
      ref={wrapperRef}
      as="div"
      className="shape-block-wrapper"
      style={outerStyle}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={onPointerUp}
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
        {runtimeState?.blockName || getBlockTypeDisplayName('shapeBlock')}
      </div>

      <div
        contentEditable={false}
        style={{
          ...innerStyle,
          cursor: isClickable ? 'pointer' : 'move',
        }}
      >
        {isInput ? (
          <input
            type="text"
            value={String(runtimeState?.value ?? '')}
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => {
              store.set(atomInstance, { ...runtimeState, value: e.target.value });
              executeWorkflow(blockId, 'onChange', store);
              recalculateAllFormulas(store);
              triggerSave(prev => prev + 1);
            }}
            placeholder={runtimeState?.text || 'Type something...'}
            style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', color: 'inherit', font: 'inherit', boxSizing: 'border-box' }}
          />
        ) : isDisplay ? (
          String(runtimeState?.value ?? runtimeState?.text ?? '')
        ) : (
          runtimeState?.text ?? ''
        )}
      </div>

      {/* Left (input) port — roles that can receive a value */}
      {hasInputPort && (
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
            {getPortBadge(portType)}
          </span>
        </div>
      )}

      {/* Right (output) port — roles that can emit one */}
      {hasOutputPort && (
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
            {getPortBadge(portType)}
          </span>
        </div>
      )}
    </NodeViewWrapper>
  );
};

export const ShapeBlock = Node.create({
  name: 'shapeBlock',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      blockId: {
        default: () => 'shape_' + Math.random().toString(36).substring(2, 11),
        parseHTML: (element: HTMLElement) => element.getAttribute('data-blockid'),
        renderHTML: (attributes: Record<string, any>) =>
          attributes.blockId ? { 'data-blockid': attributes.blockId } : {},
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="shape-block"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-type': 'shape-block', ...HTMLAttributes }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ShapeBlockComponent, { as: 'div' });
  },
});
