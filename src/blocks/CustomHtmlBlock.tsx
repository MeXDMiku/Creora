import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useAtomValue, useSetAtom, useStore } from 'jotai';
import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import {
  blockRuntimeAtom,
  contextMenuAtom,
  getBlockTypeDisplayName,
  isPreviewModeAtom,
} from '../state/atoms';
import { useBlockDrag } from '../hooks/useBlockDrag';
import { sanitizeHtml, findSlots, fillSlots } from '../lib/sanitizeHtml';
import { useTableScope } from '../lib/useTableScope';
import { useSlotValues } from '../lib/useSlotValues';

/**
 * The builder brings their own design; Creora drives the values inside it.
 *
 * This is the "bring a stopwatch and put my counter in it" case. The markup and
 * styling are entirely theirs -- a Figma export, an AI-generated card, something
 * hand-written -- and anywhere they write a slot name, the live value of the
 * block with that name appears.
 *
 * Their design, our backend. Nothing of Creora's look is imposed on it.
 */
export function CustomHtmlView({ blockId }: { blockId: string }) {
  const runtimeState = useAtomValue(blockRuntimeAtom(blockId));
  const raw = runtimeState?.html || '';

  // Clean once per markup change; fill values on every render.
  const cleaned = useMemo(() => sanitizeHtml(raw), [raw]);
  const slots = useMemo(() => findSlots(cleaned.html), [cleaned.html]);
  const values = useSlotValues(slots);
  // So a panel can say "42 orders, £8,400" without a Formula block per number.
  const tables = useTableScope();
  const html = useMemo(
    () => fillSlots(cleaned.html, values, cleaned.urlSlots, { tables }),
    [cleaned.html, values, cleaned.urlSlots, tables]
  );

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

function CustomHtmlComponent({ node }: NodeViewProps) {
  const store = useStore();
  const { blockId } = node.attrs;
  const setContextMenu = useSetAtom(contextMenuAtom);
  const isPreviewMode = useAtomValue(isPreviewModeAtom);
  const atomInstance = useMemo(() => blockRuntimeAtom(blockId), [blockId]);
  const runtimeState = useAtomValue(atomInstance, { store });
  const [isHovered, setIsHovered] = useState(false);

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

  return (
    <NodeViewWrapper
      as="div"
      ref={wrapperRef as any}
      className="customhtml-block-wrapper"
      style={{
        position: 'absolute',
        left: position.x + 'px',
        top: position.y + 'px',
        width: 'max-content',
        zIndex: 10,
        display: runtimeState?.visible === false ? 'none' : 'block',
        opacity: runtimeState?.opacity !== undefined ? runtimeState.opacity / 100 : 1,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div style={{ position: 'absolute', top: '-16px', left: 0, fontSize: '10px', opacity: isHovered ? 0.8 : 0.5, color: '#cbd5e1', userSelect: 'none', fontWeight: 500, whiteSpace: 'nowrap' }}>
        {runtimeState?.blockName || getBlockTypeDisplayName('customHtmlBlock')}
      </div>
      <div contentEditable={false} style={{ cursor: 'move' }}>
        <CustomHtmlView blockId={blockId} />
      </div>
    </NodeViewWrapper>
  );
}

export const CustomHtmlBlock = Node.create({
  name: 'customHtmlBlock',
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
  parseHTML() { return [{ tag: 'div[data-type="custom-html-block"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', { ...HTMLAttributes, 'data-type': 'custom-html-block' }]; },
  addNodeView() { return ReactNodeViewRenderer(CustomHtmlComponent); },
});
