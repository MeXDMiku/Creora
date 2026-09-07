import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useAtomValue, useSetAtom, useStore } from 'jotai';
import { useDatabaseRows } from '../hooks/useDatabaseRows';
import { listRowLines, listIsEmpty } from '../lib/rows';
import { blockRuntimeAtom, contextMenuAtom, getBlockTypeDisplayName } from '../state/atoms';
import { useRef, useState, useEffect, useCallback } from 'react';
import { useBlockDrag } from '../hooks/useBlockDrag';
import { Node } from '@tiptap/core';

const ListBlockComponent = (props: NodeViewProps) => {
  const { node } = props;
  const blockId = node.attrs.blockId;
  const store = useStore();
  const runtimeState = useAtomValue(blockRuntimeAtom(blockId), { store });
  const setContextMenu = useSetAtom(contextMenuAtom);

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  
  const containerRef = useRef<HTMLElement | null>(null);
  if (!containerRef.current) {
    containerRef.current = document.getElementById('editor-container');
  }

  const [isHovered, setIsHovered] = useState(false);

  const { position, handlePointerDown, handlePointerMove, handlePointerUp } = useBlockDrag(
    blockId,
    containerRef as React.RefObject<HTMLElement>
  );

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

  const trackedBlockId = runtimeState?.trackedBlockId;

  /**
   * The hook a repeater already used, rather than a fourth copy of the same
   * two-source read. Its own note says why it exists: "two components fetching
   * the same thing separately is exactly how the editor and the published
   * renderer drifted apart before." Both Lists had done precisely that.
   */
  const { rows: displayRows, columns: trackedColumns } = useDatabaseRows(trackedBlockId);

  // Determine standard styles from runtime config
  const customBg = runtimeState?.backgroundColor || '#ffffff';
  const customBorderRadius = runtimeState?.borderRadius !== undefined ? `${runtimeState.borderRadius}px` : '8px';
  const customOpacity = runtimeState?.opacity !== undefined ? runtimeState.opacity / 100 : 1;
  const customWidth = runtimeState?.width !== undefined ? `${runtimeState.width}px` : '300px';
  const customTextColor = runtimeState?.textColor || '#0f172a';

  return (
    <NodeViewWrapper
      data-block-id={blockId}
      ref={wrapperRef}
      className="list-block-wrapper"
      style={{
        position: 'absolute',
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 50,
        userSelect: 'none',
      }}
    >
      {/* Header Handle */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          position: 'absolute',
          top: '-16px',
          left: '0',
          fontSize: '9px',
          fontWeight: 'bold',
          color: '#94a3b8',
          cursor: 'move',
          background: 'rgba(255, 255, 255, 0.8)',
          padding: '2px 6px',
          borderRadius: '4px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          whiteSpace: 'nowrap',
        }}
      >
        {runtimeState?.blockName || getBlockTypeDisplayName('listBlock')}
      </div>

      {/* Main Face */}
      <div
        contentEditable={false}
        style={{
          backgroundColor: customBg,
          borderRadius: customBorderRadius,
          opacity: customOpacity,
          width: customWidth,
          padding: '12px',
          boxSizing: 'border-box',
          border: isHovered ? '2px solid #6366f1' : '2px solid #e2e8f0',
          boxShadow: isHovered ? '0 10px 15px -3px rgba(0, 0, 0, 0.1)' : '0 4px 6px -2px rgba(0, 0, 0, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          transition: 'border-color 0.15s, box-shadow 0.15s',
          color: customTextColor,
          maxHeight: '300px',
          overflowY: 'auto',
        }}
      >
        <ListRowsView
          rows={displayRows}
          columns={trackedColumns}
          trackedBlockId={trackedBlockId}
        />
      </div>
    </NodeViewWrapper>
  );
};


/**
 * The rows of a List, drawn once for both renderers.
 *
 * WHY THIS IS A SHARED COMPONENT AND NOT TWO COPIES
 * It WAS two copies -- character for character, down to the `String(colVal)` --
 * one here and one in PublishedRenderer. Both carried the same bug, and the
 * bug is the one this codebase has now found six times: a cell shown raw. A
 * date column read `2026-08-19T18:30:00.000Z` and a boolean read `true`, to a
 * builder and to a visitor alike.
 *
 * Fixing that in one copy would have fixed it for one of them. So the copies
 * are gone instead, and the shared cell-display rule (`displayCell`, the same
 * one both database tables use) is what decides how a value reads.
 *
 * The two renderers still differ in their WRAPPER -- one has a drag handle and
 * a hover border, the other does not -- and that is fine. What must not differ
 * is what the data says.
 */
export function ListRowsView({
  rows,
  columns,
  trackedBlockId,
}: {
  rows: Record<string, any>[];
  /** The tracked table's columns, for their types. Absent means show as text. */
  columns?: { name: string; type?: string }[];
  trackedBlockId?: string;
}) {
  // Both questions are answered in rows.ts, where a check can run them: a
  // component cannot be imported by this project's checks at all (Node's
  // type-stripping does not read .tsx), and three controls proved how little a
  // source-shape check is worth in its place.
  if (listIsEmpty(rows, trackedBlockId)) {
    return (
      <div style={{ textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '12px', padding: '16px' }}>
        No data
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {rows.map((row: any, idx: number) => (
        <div
          key={row.id || idx}
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            padding: '8px 12px',
            background: '#f8fafc',
            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          {listRowLines(row, columns).map(line => (
            <div key={line.name} style={{ display: 'flex', gap: '8px', fontSize: '12px' }}>
              <span style={{ fontWeight: 600, color: '#475569', minWidth: '60px' }}>{line.name}:</span>
              <span style={{ color: '#0f172a' }}>{line.text}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export const ListBlock = Node.create({
  name: 'listBlock',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      blockId: {
        default: () => 'list_' + Math.random().toString(36).substring(2, 11),
        parseHTML: (element: HTMLElement) => element.getAttribute('data-blockid'),
        renderHTML: (attributes: Record<string, any>) =>
          attributes.blockId ? { 'data-blockid': attributes.blockId } : {},
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="list-block"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-type': 'list-block', ...HTMLAttributes }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ListBlockComponent, { as: 'div' });
  },
});
