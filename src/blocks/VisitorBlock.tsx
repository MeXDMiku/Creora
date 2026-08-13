import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useAtomValue, useSetAtom, useStore } from 'jotai';
import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import {
  blockRuntimeAtom,
  activeWireAtom,
  snapTargetAtom,
  contextMenuAtom,
  getBlockTypeDisplayName,
  isPreviewModeAtom,
} from '../state/atoms';
import { useBlockDrag } from '../hooks/useBlockDrag';
import { blockToCSS } from '../lib/renderBlockStyles';
import { refreshVisitor } from '../lib/visitor';

function VisitorComponent({ node }: NodeViewProps) {
  const store = useStore();
  const { blockId } = node.attrs;
  const [isHovered, setIsHovered] = useState(false);
  const setActiveWire = useSetAtom(activeWireAtom);
  const activeWire = useAtomValue(activeWireAtom);
  const snapTarget = useAtomValue(snapTargetAtom);
  const setContextMenu = useSetAtom(contextMenuAtom);
  const isPreviewMode = useAtomValue(isPreviewModeAtom);

  const atomInstance = useMemo(() => blockRuntimeAtom(blockId), [blockId]);
  const runtimeState = useAtomValue(atomInstance, { store });

  const containerRef = useRef<HTMLElement | null>(null);
  if (!containerRef.current) containerRef.current = document.getElementById('editor-container');

  const { position, handlePointerDown, handlePointerMove, handlePointerUp } = useBlockDrag(
    blockId,
    containerRef as React.RefObject<HTMLElement>
  );

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const handleContextMenu = useCallback((e: MouseEvent) => {
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    if (isPreviewMode) return;
    const c = containerRef.current; if (!c) return;
    const r = c.getBoundingClientRect();
    setContextMenu({ blockId, x: e.clientX - r.left, y: e.clientY - r.top, visible: true });
  }, [blockId, setContextMenu, isPreviewMode]);

  useEffect(() => {
    const el = wrapperRef.current; if (!el) return;
    el.addEventListener('contextmenu', handleContextMenu, true);
    return () => el.removeEventListener('contextmenu', handleContextMenu, true);
  }, [handleContextMenu]);

  // In the editor this shows the builder, who already has a session.
  useEffect(() => {
    refreshVisitor(blockId, store, false);
  }, [blockId, store, runtimeState?.visitorField]);

  const { outer: outerStyle, inner: innerStyle } = blockToCSS('visitorBlock', position, runtimeState);
  const isSnapTarget = snapTarget === blockId;
  const showRightPort = (isHovered || !!activeWire || isSnapTarget) && !isPreviewMode;

  const onOutputPortPointerDown = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const c = containerRef.current; if (!c) return;
    const r = c.getBoundingClientRect();
    setActiveWire({
      sourceBlockId: blockId,
      sourceX: e.clientX - r.left, sourceY: e.clientY - r.top,
      currentX: e.clientX - r.left, currentY: e.clientY - r.top,
    });
  };

  const v = runtimeState?.value;
  const shown = typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v ?? '');

  return (
    <NodeViewWrapper
      as="div"
      ref={wrapperRef as any}
      className="visitor-block-wrapper"
      style={{ ...outerStyle, position: 'absolute', width: 'max-content' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div style={{ position: 'absolute', top: '-16px', left: 0, fontSize: '10px', opacity: 0.6, color: '#cbd5e1', userSelect: 'none', fontWeight: 500, whiteSpace: 'nowrap' }}>
        {runtimeState?.blockName || getBlockTypeDisplayName('visitorBlock')}
      </div>
      <div contentEditable={false} style={{ ...innerStyle, cursor: 'move' }}>
        <div style={{ fontSize: '9px', opacity: 0.65, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {runtimeState?.visitorField || 'signedIn'}
        </div>
        <div>{shown || '—'}</div>
      </div>

      {showRightPort && (
        <div
          contentEditable={false}
          data-port-output={blockId}
          onPointerDown={onOutputPortPointerDown}
          style={{ position: 'absolute', right: '-5px', top: '50%', transform: 'translateY(-50%)', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#6366f1', border: '2px solid white', cursor: 'crosshair' }}
        />
      )}
    </NodeViewWrapper>
  );
}

export const VisitorBlock = Node.create({
  name: 'visitorBlock',
  group: 'block',
  atom: true,
  draggable: false,
  selectable: false,
/**
 * Attributes have to survive a round trip through HTML.
 *
 * They did not. renderHTML wrote blockId and label into the markup and
 * parseHTML matched only the tag, so anything loaded as HTML rather than as
 * JSON came back with the attributes GONE and the defaults put in their place.
 *
 * For `label` that means a button called "Submit!" silently becomes "Button",
 * and the next save makes it permanent -- which is exactly what happened to the
 * live Feedback page while it was being looked at.
 *
 * For `blockId` it is worse: a fresh random id means every wire, workflow and
 * saved row that referred to that block is pointing at something that no longer
 * exists.
 */
  addAttributes() {
    return {
      blockId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-blockid'),
        renderHTML: (attributes: Record<string, any>) =>
          attributes.blockId ? { 'data-blockid': attributes.blockId } : {},
      },
    };
  },
  parseHTML() { return [{ tag: 'div[data-type="visitor-block"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', { ...HTMLAttributes, 'data-type': 'visitor-block' }]; },
  addNodeView() { return ReactNodeViewRenderer(VisitorComponent); },
});
