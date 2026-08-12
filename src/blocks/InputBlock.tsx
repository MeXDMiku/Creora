import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useAtomValue, useSetAtom, useStore } from 'jotai';
import { executeWorkflow, recalculateAllFormulas, markValidated } from '../lib/bindingEngine';
import { blockRuntimeAtom, activeWireAtom, triggerSaveAtom, contextMenuAtom, getPortBadge, getBlockTypeDisplayName } from '../state/atoms';
import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { useBlockDrag } from '../hooks/useBlockDrag';
import { blockToCSS } from '../lib/renderBlockStyles';

const InputBlockComponent = (props: NodeViewProps) => {
  const { node } = props;
  const { blockId } = node.attrs;
  const store = useStore();
  const [isHovered, setIsHovered] = useState(false);
  const setActiveWire = useSetAtom(activeWireAtom);
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

  /**
   * Show a complaint only once the field has been visited or submitted.
   *
   * An empty required field is invalid from the moment the page loads. Saying so
   * immediately tells someone off for not having typed yet, which is why
   * `touched` exists and why it gates the display rather than the check.
   */
  const showError = !!(runtimeState?.touched && runtimeState?.validationError);
  const errorColor = runtimeState?.errorColor || '#dc2626';
  const showErrorText = runtimeState?.showErrorText !== false;

  /**
   * Typing does not reveal a new complaint, but it does clear one that is
   * already on screen. Fixing a field should feel like fixing it, not like
   * waiting for permission to be told you were right.
   */
  const handleValueChange = (next: string) => {
    const current = store.get(atomInstance);
    store.set(atomInstance, { ...current, value: next });
    if (current?.validateOn === 'change') {
      markValidated(blockId, store, true);
    } else if (current?.touched) {
      markValidated(blockId, store, false);
    }
    executeWorkflow(blockId, 'onChange', store);
    recalculateAllFormulas(store);
    triggerSave(prev => prev + 1);
  };

  const handleBlur = () => {
    if (store.get(atomInstance)?.validateOn === 'submit') return;
    markValidated(blockId, store, true);
  };

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

      <input
        type="text"
        value={runtimeValue}
        disabled={!!runtimeState?.disabled}
        onPointerDown={(e) => e.stopPropagation()} // Stop propagation so clicking in text box focuses it instead of dragging
        onChange={(e) => handleValueChange(e.target.value)}
        onBlur={handleBlur}
        style={{
          ...innerStyle,
          ...(showError
            ? { borderColor: errorColor, borderWidth: 2, borderStyle: 'solid', outlineColor: errorColor }
            : null),
          ...(runtimeState?.disabled ? { opacity: 0.55, cursor: 'not-allowed' } : null),
        }}
        placeholder={runtimeState?.placeholder ?? 'Type something...'}
      />
      {/*
        The complaint. Absolutely positioned so appearing does not shove the rest
        of the canvas down, and switchable off entirely -- a builder who wants
        the message inside their own design turns this off and reads the field's
        error from their markup instead.
      */}
      {showError && showErrorText && (
        <div
          contentEditable={false}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: '4px',
            fontSize: '12px',
            lineHeight: 1.3,
            color: errorColor,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          {runtimeState?.validationError}
        </div>
      )}
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
