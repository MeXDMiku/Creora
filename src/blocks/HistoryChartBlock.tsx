import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { chartBars } from '../lib/chartBars';
import type { NodeViewProps } from '@tiptap/react';
import { useAtomValue, useSetAtom, useStore } from 'jotai';
import { blockRuntimeAtom, contextMenuAtom, getBlockTypeDisplayName } from '../state/atoms';
import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { useBlockDrag } from '../hooks/useBlockDrag';
import { Node } from '@tiptap/core';

const HistoryChartBlockComponent = (props: NodeViewProps) => {
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

  // Determine standard styles from runtime config
  const customBg = runtimeState?.backgroundColor || '#1e293b';
  const customBorderRadius = runtimeState?.borderRadius !== undefined ? `${runtimeState.borderRadius}px` : '8px';
  const customOpacity = runtimeState?.opacity !== undefined ? runtimeState.opacity / 100 : 1;
  const customWidth = runtimeState?.width !== undefined ? `${runtimeState.width}px` : '180px';
  const customTextColor = runtimeState?.textColor || '#ffffff';

  // SVG dimensions
  const svgWidth = 140;
  const svgHeight = 60;
  const padding = 4;

  const history = runtimeState?.history || [];
  const trackedBlockId = runtimeState?.trackedBlockId;

  // Render SVG Bars
  const chartContent = useMemo(() => {
    if (!trackedBlockId) {
      return (
        <text
          x={svgWidth / 2}
          y={svgHeight / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#64748b"
          fontSize="10px"
          fontWeight={500}
        >
          No tracked block
        </text>
      );
    }
    if (history.length === 0) {
      return (
        <text
          x={svgWidth / 2}
          y={svgHeight / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#64748b"
          fontSize="10px"
          fontWeight={500}
        >
          Awaiting changes...
        </text>
      );
    }

    // The geometry is decided in lib/chartBars.ts, which both renderers share.
    // It was forty lines of arithmetic written out twice, and a geometry
    // difference is a chart that is subtly wrong in one of them -- the kind
    // nobody notices, because a bar an eighth too tall still reads as data.
    return chartBars(history, { width: svgWidth, height: svgHeight, padding }).map((bar, idx) => (
      <rect
        key={idx}
        x={bar.x}
        y={bar.y}
        width={bar.width}
        height={bar.height}
        rx={1}
        ry={1}
        fill={bar.negative ? '#f43f5e' : '#6366f1'}
        style={{ transition: 'all 0.2s', opacity: 0.85 }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = '1';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = '0.85';
        }}
      >
        <title>{`Val: ${history[idx]}`}</title>
      </rect>
    ));
  }, [history, trackedBlockId]);

  return (
    <NodeViewWrapper
      ref={wrapperRef}
      as="div"
      className="history-chart-block-wrapper"
      style={{
        display: 'block',
        position: 'absolute',
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: isHovered ? 100 : 10,
        opacity: customOpacity,
        userSelect: 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Floating Name Label */}
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
        {runtimeState?.blockName || getBlockTypeDisplayName('historyChartBlock')}
      </div>

      <div
        style={{
          backgroundColor: customBg,
          borderRadius: customBorderRadius,
          width: customWidth,
          height: '110px',
          padding: '8px 12px',
          boxSizing: 'border-box',
          border: isHovered ? '2px solid #818cf8' : '2px solid transparent',
          boxShadow: isHovered ? '0 10px 15px -3px rgba(0, 0, 0, 0.3)' : '0 4px 6px -2px rgba(0, 0, 0, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'grab',
          transition: 'border-color 0.15s, box-shadow 0.15s',
        }}
      >
        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            History Chart
          </span>
          {history.length > 0 && (
            <span style={{ fontSize: '9px', fontWeight: 700, color: customTextColor, opacity: 0.7 }}>
              {`Last: ${history[history.length - 1]}`}
            </span>
          )}
        </div>

        {/* SVG Chart Face */}
        <div
          contentEditable={false}
          style={{
            width: '100%',
            height: `${svgHeight}px`,
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '4px',
            padding: '2px',
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            style={{ display: 'block', overflow: 'visible' }}
          >
            {chartContent}
          </svg>
        </div>
      </div>
    </NodeViewWrapper>
  );
};

export const HistoryChartBlock = Node.create({
  name: 'historyChartBlock',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      blockId: {
        default: () => 'chart_' + Math.random().toString(36).substring(2, 11),
        parseHTML: (element: HTMLElement) => element.getAttribute('data-blockid'),
        renderHTML: (attributes: Record<string, any>) =>
          attributes.blockId ? { 'data-blockid': attributes.blockId } : {},
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="history-chart-block"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-type': 'history-chart-block', ...HTMLAttributes }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(HistoryChartBlockComponent, { as: 'div' });
  },
});
