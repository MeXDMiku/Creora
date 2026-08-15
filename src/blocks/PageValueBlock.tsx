import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useAtomValue, useSetAtom, useStore } from 'jotai';
import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import {
  blockRuntimeAtom,
  pageParamsAtom,
  activeWireAtom,
  snapTargetAtom,
  contextMenuAtom,
  getPortBadge,
  getBlockTypeDisplayName,
  isPreviewModeAtom,
} from '../state/atoms';
import { useBlockDrag } from '../hooks/useBlockDrag';
import { blockToCSS } from '../lib/renderBlockStyles';
import { refreshPageValue } from '../lib/pageValue';

/**
 * What this page was opened with.
 *
 * A blog post page is opened with a post. A product page is opened with a
 * product. This is the block that knows which one, and because its value is an
 * ordinary value, the repeater's existing filter turns it into "show that one
 * row" with nothing new written for it.
 */
const PageValueComponent = ({ node }: NodeViewProps) => {
  const { blockId } = node.attrs;
  const store = useStore();
  const [isHovered, setIsHovered] = useState(false);
  const setActiveWire = useSetAtom(activeWireAtom);
  const snapTarget = useAtomValue(snapTargetAtom);
  const setContextMenu = useSetAtom(contextMenuAtom);
  const isPreviewMode = useAtomValue(isPreviewModeAtom);

  const atomInstance = useMemo(() => blockRuntimeAtom(blockId), [blockId]);
  const runtimeState = useAtomValue(atomInstance, { store });
  const params = useAtomValue(pageParamsAtom);

  const containerRef = useRef<HTMLElement | null>(null);
  if (!containerRef.current) containerRef.current = document.getElementById('editor-container');
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const { position, handlePointerDown, handlePointerMove, handlePointerUp } = useBlockDrag(
    blockId,
    containerRef as React.RefObject<HTMLElement>
  );

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

  // Re-resolved whenever the address, the name or the preview value changes.
  useEffect(() => {
    refreshPageValue(blockId, store);
  }, [blockId, store, params, runtimeState?.paramName, runtimeState?.previewValue, runtimeState?.fallbackValue]);

  const onOutputPortPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    const c = containerRef.current; if (!c) return;
    const cr = c.getBoundingClientRect();
    const pr = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = pr.left + pr.width / 2 - cr.left;
    const y = pr.top + pr.height / 2 - cr.top;
    setActiveWire({ sourceBlockId: blockId, sourceX: x, sourceY: y, currentX: x, currentY: y });
  };

  const { outer: outerStyle, inner: innerStyle } = blockToCSS('pageValueBlock', position, runtimeState);
  const showPorts = (isHovered || snapTarget === blockId) && !isPreviewMode;
  const shown = String(runtimeState?.value ?? '');

  return (
    <NodeViewWrapper
      as="div"
      ref={wrapperRef as any}
      className="page-value-block-wrapper"
      style={{ ...outerStyle, cursor: 'move' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div style={{ position: 'absolute', top: '-16px', left: 0, fontSize: '10px', opacity: 0.6, color: '#cbd5e1', userSelect: 'none', fontWeight: 500, whiteSpace: 'nowrap' }}>
        {runtimeState?.blockName || getBlockTypeDisplayName('pageValueBlock')}
      </div>

      <div contentEditable={false} style={innerStyle}>
        <div style={{ fontSize: '9px', opacity: 0.65, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {(runtimeState?.paramName || 'id')}
          {params === null ? ' · preview' : ''}
        </div>
        <div style={{ wordBreak: 'break-all' }}>{shown || '—'}</div>
      </div>

      <div
        contentEditable={false}
        data-port-output={blockId}
        title="Drag from here to another block: this hands over its value and makes that block react"
        onPointerDown={onOutputPortPointerDown}
        style={{
          position: 'absolute', right: '-5px', top: '50%', transform: 'translateY(-50%)',
          width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#6366f1',
          border: '2px solid white', opacity: showPorts ? 1 : 0,
          pointerEvents: showPorts ? ('all' as const) : ('none' as const),
          cursor: 'crosshair', transition: 'opacity 0.15s',
        }}
      >
        <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', fontWeight: 'bold', color: '#6366f1', pointerEvents: 'none', userSelect: 'none' }}>
          {getPortBadge('string')}
        </span>
      </div>
    </NodeViewWrapper>
  );
};

export const PageValueBlock = Node.create({
  name: 'pageValueBlock',
  group: 'block',
  atom: true,
  selectable: true,
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
  parseHTML() { return [{ tag: 'div[data-type="page-value-block"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', { ...HTMLAttributes, 'data-type': 'page-value-block' }]; },
  addNodeView() { return ReactNodeViewRenderer(PageValueComponent, { as: 'div' }); },
});
