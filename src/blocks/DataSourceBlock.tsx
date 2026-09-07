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
  getBlockTypeDisplayName,
  isPreviewModeAtom,
} from '../state/atoms';
import { useBlockDrag } from '../hooks/useBlockDrag';
import { blockToCSS } from '../lib/renderBlockStyles';
import { valueAtPath } from '../lib/jsonPaths';
import { fetchDataSource } from '../lib/dataSource';

function DataSourceComponent({ node }: NodeViewProps) {
  const store = useStore();
  const { blockId } = node.attrs;
  const [isHovered, setIsHovered] = useState(false);
  const setActiveWire = useSetAtom(activeWireAtom);
  const activeWire = useAtomValue(activeWireAtom);
  const snapTarget = useAtomValue(snapTargetAtom);
  const triggerSave = useSetAtom(triggerSaveAtom);
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
    const container = containerRef.current; if (!container) return;
    const r = container.getBoundingClientRect();
    setContextMenu({ blockId, x: e.clientX - r.left, y: e.clientY - r.top, visible: true });
  }, [blockId, setContextMenu, isPreviewMode]);

  useEffect(() => {
    const el = wrapperRef.current; if (!el) return;
    el.addEventListener('contextmenu', handleContextMenu, true);
    return () => el.removeEventListener('contextmenu', handleContextMenu, true);
  }, [handleContextMenu]);

  // Refresh is where "on page load" and "every N seconds" actually live.
  useEffect(() => {
    let cancelled = false;
    const run = () => { if (!cancelled) fetchDataSource(blockId, store).then(() => triggerSave(p => p + 1)); };
    if (runtimeState?.refreshMode === 'load' || runtimeState?.refreshMode === 'interval') run();
    if (runtimeState?.refreshMode === 'interval') {
      const secs = Math.max(5, runtimeState?.refreshSeconds ?? 60);
      const id = setInterval(run, secs * 1000);
      return () => { cancelled = true; clearInterval(id); };
    }
    return () => { cancelled = true; };
  }, [blockId, runtimeState?.url, runtimeState?.refreshMode, runtimeState?.refreshSeconds, store, triggerSave]);

  const { outer: outerStyle, inner: innerStyle } = blockToCSS('dataSourceBlock', position, runtimeState);
  const isSnapTarget = snapTarget === blockId;
  const showRightPort = (isHovered || !!activeWire || isSnapTarget) && !isPreviewMode;

  /**
   * AND A LEFT PORT, WITHOUT WHICH `refresh` IS UNREACHABLE.
   *
   * This block had an output and no input, so nothing could be wired INTO it.
   * `refreshMode` has offered 'on a trigger' since the block shipped; the
   * action that carries it out was added later; and both were still pointless,
   * because the canvas had nowhere to drop a wire. Reachable-and-inert twice
   * over, one level apart -- found by opening it in a browser, which is the
   * only place a missing port is visible at all.
   *
   * Shown while a wire is being dragged from somewhere else, the same rule the
   * other input ports use: hovering it does nothing on its own.
   */
  const isWireSource = !!activeWire && activeWire.sourceBlockId === blockId;
  const showLeftPort = (isHovered || (!!activeWire && !isWireSource)) && !isPreviewMode;

  const onOutputPortPointerDown = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const container = containerRef.current; if (!container) return;
    const r = container.getBoundingClientRect();
    setActiveWire({
      sourceBlockId: blockId,
      sourceX: e.clientX - r.left, sourceY: e.clientY - r.top,
      currentX: e.clientX - r.left, currentY: e.clientY - r.top,
    });
  };

  const shown = runtimeState?.fetchError
    ? 'Error'
    : runtimeState?.loading
      ? '…'
      : runtimeState?.outputPath
        ? String(valueAtPath(runtimeState?.lastResponse, runtimeState.outputPath) ?? '—')
        : (runtimeState?.url ? 'Pick a field' : 'Set a URL');

  return (
    <NodeViewWrapper
      data-block-id={blockId}
      as="div"
      ref={wrapperRef as any}
      className="datasource-block-wrapper"
      style={{ ...outerStyle, position: 'absolute', width: 'max-content' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div style={{ position: 'absolute', top: '-16px', left: 0, fontSize: '10px', opacity: 0.6, color: '#cbd5e1', userSelect: 'none', fontWeight: 500, whiteSpace: 'nowrap' }}>
        {runtimeState?.blockName || getBlockTypeDisplayName('dataSourceBlock')}
      </div>

      <div contentEditable={false} style={{ ...innerStyle, cursor: 'move' }}>
        <div style={{ fontSize: '9px', opacity: 0.65, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>
          {runtimeState?.fetchError ? 'failed' : runtimeState?.lastFetchedAt ? 'live' : 'not fetched'}
        </div>
        <div>{shown}</div>
      </div>

      {/* Left (input) port -- a trigger fires in here and the block fetches again. */}
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
      />

      {/*
        ALWAYS IN THE DOM, HIDDEN WITH OPACITY -- NEVER MOUNTED ON HOVER.

        It used to be `{showRightPort && (...)}`, and a wire drawn FROM this
        block could not be drawn at all. `PermanentWire` measures a wire by
        looking the two ports up in the DOM and gives up if either is missing;
        its effect runs on mount and when a block moves, not on hover. So after
        a reload the port was absent, the measurement failed, and the wire
        silently did not exist -- on a canvas whose entire job is showing what
        is connected to what.

        Visibility is an opacity question. Whether a wire can be measured is
        not, so it must not depend on where the pointer is.
      */}
      <div
        contentEditable={false}
        data-port-output={blockId}
        title="Drag from here to another block: this hands over its value and makes that block react"
        onPointerDown={onOutputPortPointerDown}
        style={{ position: 'absolute', right: '-5px', top: '50%', transform: 'translateY(-50%)', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#6366f1', border: '2px solid white', cursor: 'crosshair', opacity: showRightPort ? 1 : 0, pointerEvents: showRightPort ? 'all' as const : 'none' as const, transition: 'opacity 0.15s' }}
      />
    </NodeViewWrapper>
  );
}

export const DataSourceBlock = Node.create({
  name: 'dataSourceBlock',
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
  parseHTML() { return [{ tag: 'div[data-type="data-source-block"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', { ...HTMLAttributes, 'data-type': 'data-source-block' }]; },
  addNodeView() { return ReactNodeViewRenderer(DataSourceComponent); },
});
