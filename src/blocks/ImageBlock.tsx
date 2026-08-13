import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useAtomValue, useSetAtom, useStore } from 'jotai';
import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import {
  blockRuntimeAtom,
  activeWireAtom,
  snapTargetAtom,
  triggerSaveAtom,
  contextMenuAtom,
  getPortBadge,
  getBlockTypeDisplayName,
  isPreviewModeAtom,
} from '../state/atoms';
import { useBlockDrag } from '../hooks/useBlockDrag';
import { blockToCSS } from '../lib/renderBlockStyles';
import { normalizeImageUrl, IMAGE_MIME_TYPES } from '../lib/images';
import { uploadImage } from '../lib/imageUpload';
import { executeWorkflow, recalculateAllFormulas } from '../lib/bindingEngine';

/**
 * A picture, whose value is its address.
 *
 * That single decision is what makes this block small. Because the value is a
 * string, every action, condition, formula reference and wire that already
 * works on text works on a picture: a Database column can set it, Live Data can
 * set it, a button can swap it, a condition can ask whether it is empty. None
 * of that needed a line of code here.
 *
 * Uploading is one way to set that value, not a separate concept.
 */

const ACCEPT = IMAGE_MIME_TYPES.join(',');

const ImageBlockComponent = (props: NodeViewProps) => {
  const { node } = props;
  const { blockId } = node.attrs;
  const store = useStore();
  const [isHovered, setIsHovered] = useState(false);
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const setActiveWire = useSetAtom(activeWireAtom);
  const snapTarget = useAtomValue(snapTargetAtom);
  const triggerSave = useSetAtom(triggerSaveAtom);
  const setContextMenu = useSetAtom(contextMenuAtom);
  const isPreviewMode = useAtomValue(isPreviewModeAtom);

  const atomInstance = useMemo(() => blockRuntimeAtom(blockId), [blockId]);
  const runtimeState = useAtomValue(atomInstance, { store });

  const containerRef = useRef<HTMLElement | null>(null);
  if (!containerRef.current) containerRef.current = document.getElementById('editor-container');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const { position, handlePointerDown, handlePointerMove, handlePointerUp } = useBlockDrag(
    blockId,
    containerRef as React.RefObject<HTMLElement>
  );

  const handleContextMenu = useCallback((e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (isPreviewMode) return;
    const c = containerRef.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    setContextMenu({ blockId, x: e.clientX - r.left, y: e.clientY - r.top, visible: true });
  }, [blockId, setContextMenu, isPreviewMode]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    el.addEventListener('contextmenu', handleContextMenu, true);
    return () => el.removeEventListener('contextmenu', handleContextMenu, true);
  }, [handleContextMenu]);

  const url = normalizeImageUrl(runtimeState?.value);
  const isBusy = !!runtimeState?.loading;
  const uploadError = runtimeState?.uploadError || null;
  const isBroken = !!url && brokenUrl === url;

  // A new address deserves a fresh chance to load. Without this, one bad
  // address would leave the block looking broken for every address after it.
  useEffect(() => {
    setBrokenUrl((prev) => (prev && prev !== url ? null : prev));
  }, [url]);

  /**
   * A picture can be a button. In preview -- and on a published page -- a click
   * runs whatever is wired to it, which is how an image becomes a link, a
   * lightbox trigger, or the thing that adds an item to a cart. Only in preview,
   * because in the editor a click means "select this", not "run it".
   */
  const onPointerUpMaybeClick = (e: React.PointerEvent) => {
    const wasClick = handlePointerUp(e);
    if (wasClick && isPreviewMode) {
      executeWorkflow(blockId, 'onClick', store);
      recalculateAllFormulas(store);
      triggerSave((prev) => prev + 1);
    }
  };

  const onPickFile = async (file: File | null) => {
    if (!file) return;
    await uploadImage(file, blockId, store);
    triggerSave((prev) => prev + 1);
  };

  const onOutputPortPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    const c = containerRef.current;
    if (!c) return;
    const cr = c.getBoundingClientRect();
    const pr = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = pr.left + pr.width / 2 - cr.left;
    const y = pr.top + pr.height / 2 - cr.top;
    setActiveWire({ sourceBlockId: blockId, sourceX: x, sourceY: y, currentX: x, currentY: y });
  };

  const isSnapTarget = snapTarget === blockId;
  const showPorts = (isHovered || isSnapTarget) && !isPreviewMode;
  const { outer: outerStyle, inner: innerStyle } = blockToCSS('imageBlock', position, runtimeState);

  const boxWidth = runtimeState?.width !== undefined ? runtimeState.width : 240;
  const boxHeight = runtimeState?.height !== undefined ? runtimeState.height : 160;

  const placeholderStyle: React.CSSProperties = {
    width: boxWidth + 'px',
    height: boxHeight + 'px',
    borderRadius: (runtimeState?.borderRadius ?? 8) + 'px',
    border: '2px dashed #cbd5e1',
    background: '#f8fafc',
    color: '#64748b',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    fontSize: '12px',
    textAlign: 'center',
    padding: '8px',
    boxSizing: 'border-box',
    userSelect: 'none',
  };

  return (
    <NodeViewWrapper
      as="div"
      ref={wrapperRef as any}
      className="image-block-wrapper"
      style={{ ...outerStyle, cursor: 'move' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={onPointerUpMaybeClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div style={{ position: 'absolute', top: '-16px', left: 0, fontSize: '10px', opacity: 0.6, color: '#cbd5e1', userSelect: 'none', fontWeight: 500, whiteSpace: 'nowrap' }}>
        {runtimeState?.blockName || getBlockTypeDisplayName('imageBlock')}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files && e.target.files[0];
          e.target.value = '';
          void onPickFile(file || null);
        }}
      />

      {url && !isBroken ? (
        <img
          src={url}
          alt={runtimeState?.alt || ''}
          draggable={false}
          style={innerStyle}
          onError={() => setBrokenUrl(url)}
        />
      ) : (
        <div contentEditable={false} style={placeholderStyle}>
          <div style={{ fontSize: '22px', lineHeight: 1 }}>&#128247;</div>
          <div>
            {isBroken
              ? 'That address did not load a picture'
              : 'No picture yet'}
          </div>
          <div style={{ fontSize: '11px', opacity: 0.8 }}>
            Paste an address in the panel, or upload one
          </div>
        </div>
      )}

      {/* Upload, on hover, in the editor. The builder should not have to go
          hunting in a panel for the most common thing they will do here. */}
      {showPorts && !isBusy && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
          style={{
            position: 'absolute',
            right: '6px',
            bottom: '6px',
            padding: '4px 8px',
            fontSize: '11px',
            fontWeight: 600,
            borderRadius: '6px',
            border: '1px solid rgba(255,255,255,0.35)',
            background: 'rgba(15,23,42,0.78)',
            color: '#ffffff',
            cursor: 'pointer',
          }}
        >
          {url ? 'Replace' : 'Upload'}
        </button>
      )}

      {isBusy && (
        <div
          contentEditable={false}
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: (runtimeState?.borderRadius ?? 8) + 'px',
            background: 'rgba(15,23,42,0.55)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            fontWeight: 600,
            userSelect: 'none',
          }}
        >
          Uploading...
        </div>
      )}

      {uploadError && (
        <div
          contentEditable={false}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: '4px',
            width: boxWidth + 'px',
            fontSize: '11px',
            lineHeight: 1.35,
            color: '#dc2626',
            userSelect: 'none',
          }}
        >
          {uploadError}
        </div>
      )}

      {/* Left port, so a wire can set this picture from anywhere. */}
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
          opacity: showPorts ? 1 : 0,
          pointerEvents: showPorts ? ('all' as const) : ('none' as const),
          transition: 'transform 0.15s, box-shadow 0.15s, opacity 0.15s',
        }}
      />

      {/* Right port: the address, as text, for anything that wants it. */}
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
          opacity: showPorts ? 1 : 0,
          pointerEvents: showPorts ? ('all' as const) : ('none' as const),
          cursor: 'crosshair',
          transition: 'opacity 0.15s',
        }}
      >
        <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', fontWeight: 'bold', color: '#6366f1', pointerEvents: 'none', userSelect: 'none' }}>
          {getPortBadge('string')}
        </span>
      </div>
    </NodeViewWrapper>
  );
};

export const ImageBlock = Node.create({
  name: 'imageBlock',
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

  parseHTML() {
    return [{ tag: 'div[data-type="image-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { ...HTMLAttributes, 'data-type': 'image-block' }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageBlockComponent, { as: 'div' });
  },
});
