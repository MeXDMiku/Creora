import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useAtomValue, useSetAtom, useStore } from 'jotai';
import { blockRuntimeAtom, contextMenuAtom, getBlockTypeDisplayName } from '../state/atoms';
import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { useBlockDrag } from '../hooks/useBlockDrag';
import { Node } from '@tiptap/core';
import { supabase } from '../lib/supabase';

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
  const [supabaseRows, setSupabaseRows] = useState<any[]>([]);

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

  // Fetch from Supabase when tracked block changes
  useEffect(() => {
    if (!trackedBlockId) {
      setSupabaseRows([]);
      return;
    }

    supabase
      .rpc('list_database_rows', { p_block_id: trackedBlockId })
      .then(({ data, error }: any) => {
        if (error) {
          console.warn('[ListBlock] Supabase fetch warning:', error.message);
          return;
        }
        if (data) {
          const parsed = data.map((item: any) => ({
            id: item.id,
            ...item.row_data
          }));
          setSupabaseRows(parsed);
        }
      });
  }, [trackedBlockId]);

  // Read DatabaseBlock state from store reactively
  const dbAtom = useMemo(() => blockRuntimeAtom(trackedBlockId || ''), [trackedBlockId]);
  const dbState = useAtomValue(dbAtom, { store });
  const dbRows = dbState?.rows || [];

  // Use store rows if populated/active, fallback to fetched supabaseRows
  const displayRows = dbRows.length > 0 ? dbRows : supabaseRows;

  // Determine standard styles from runtime config
  const customBg = runtimeState?.backgroundColor || '#ffffff';
  const customBorderRadius = runtimeState?.borderRadius !== undefined ? `${runtimeState.borderRadius}px` : '8px';
  const customOpacity = runtimeState?.opacity !== undefined ? runtimeState.opacity / 100 : 1;
  const customWidth = runtimeState?.width !== undefined ? `${runtimeState.width}px` : '300px';
  const customTextColor = runtimeState?.textColor || '#0f172a';

  return (
    <NodeViewWrapper
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
        {!trackedBlockId || displayRows.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '12px', padding: '16px' }}>
            No data
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {displayRows.map((row, idx) => (
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
                {Object.entries(row)
                  .filter(([key]) => key !== 'id')
                  .map(([colName, colVal]) => (
                    <div key={colName} style={{ display: 'flex', gap: '8px', fontSize: '12px' }}>
                      <span style={{ fontWeight: 600, color: '#475569', minWidth: '60px' }}>{colName}:</span>
                      <span style={{ color: '#0f172a' }}>{String(colVal)}</span>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
};

export const ListBlock = Node.create({
  name: 'listBlock',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      blockId: {
        default: () => 'list_' + Math.random().toString(36).substring(2, 11),
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
