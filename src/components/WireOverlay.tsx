import { useAtomValue, useSetAtom } from 'jotai';
import { useLayoutEffect, useState } from 'react';
import { activeWireAtom, connectionsAtom, blockPositionAtom, pendingConnectionAtom, contextMenuAtom, connectionContextMenuAtom } from '../state/atoms';

function PermanentWire({ connectionId, sourceBlockId, targetBlockId }: { connectionId: string; sourceBlockId: string; targetBlockId: string }) {
  // Subscribe to both block positions so we re-render when either block is dragged
  const _sourcePos = useAtomValue(blockPositionAtom(sourceBlockId));
  const _targetPos = useAtomValue(blockPositionAtom(targetBlockId));
  const [coords, setCoords] = useState({ x1: 0, y1: 0, x2: 0, y2: 0 });
  const setBlockMenu = useSetAtom(contextMenuAtom);
  const setConnectionMenu = useSetAtom(connectionContextMenuAtom);

  useLayoutEffect(() => {
    const container = document.getElementById('editor-container');
    if (!container) return;
    const containerRect = container.getBoundingClientRect();

    const outputPort = container.querySelector(`[data-port-output="${sourceBlockId}"]`);
    const inputPort = container.querySelector(`[data-port-input="${targetBlockId}"]`);
    if (!outputPort || !inputPort) return;

    const outRect = outputPort.getBoundingClientRect();
    const inRect = inputPort.getBoundingClientRect();

    setCoords({
      x1: outRect.left + outRect.width / 2 - containerRect.left,
      y1: outRect.top + outRect.height / 2 - containerRect.top,
      x2: inRect.left + inRect.width / 2 - containerRect.left,
      y2: inRect.top + inRect.height / 2 - containerRect.top,
    });
  }, [_sourcePos, _targetPos, sourceBlockId, targetBlockId]);

  if (coords.x1 === 0 && coords.y1 === 0 && coords.x2 === 0 && coords.y2 === 0) return null;

  // Cubic Bezier curve path
  const dx = Math.abs(coords.x2 - coords.x1) * 0.5;
  const cx1 = coords.x1 + dx;
  const cy1 = coords.y1;
  const cx2 = coords.x2 - dx;
  const cy2 = coords.y2;
  const pathData = `M ${coords.x1} ${coords.y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${coords.x2} ${coords.y2}`;

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const container = document.getElementById('editor-container');
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const x = e.clientX - containerRect.left;
    const y = e.clientY - containerRect.top;

    setBlockMenu(null);
    setConnectionMenu({
      connectionId,
      x,
      y,
      visible: true,
    });
  };

  return (
    <>
      {/* Visible Bezier Wire */}
      <path
        d={pathData}
        fill="none"
        stroke="#6366f1"
        strokeWidth={2}
      />
      {/* Invisible Wider Hit Path */}
      <path
        d={pathData}
        fill="none"
        stroke="transparent"
        strokeWidth={14}
        style={{ cursor: 'pointer', pointerEvents: 'all' }}
        onContextMenu={handleContextMenu}
      />
    </>
  );
}

function BezierWire({ x1, y1, x2, y2, dashed = false }: { x1: number; y1: number; x2: number; y2: number; dashed?: boolean }) {
  const dx = Math.abs(x2 - x1) * 0.5;
  const cx1 = x1 + dx;
  const cy1 = y1;
  const cx2 = x2 - dx;
  const cy2 = y2;
  const pathData = `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;

  return (
    <path
      d={pathData}
      fill="none"
      stroke="#6366f1"
      strokeWidth={2}
      strokeDasharray={dashed ? "6 3" : undefined}
    />
  );
}

export function WireOverlay() {
  const activeWire = useAtomValue(activeWireAtom);
  const connections = useAtomValue(connectionsAtom);
  const pendingConnection = useAtomValue(pendingConnectionAtom);

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      {/* Permanent wires for established connections */}
      {connections.map(conn => (
        <PermanentWire
          key={conn.id}
          connectionId={conn.id}
          sourceBlockId={conn.sourceBlockId}
          targetBlockId={conn.targetBlockId}
        />
      ))}
      {/* Pending connection wire (dashed) */}
      {pendingConnection && (
        <BezierWire
          x1={pendingConnection.x1}
          y1={pendingConnection.y1}
          x2={pendingConnection.x2}
          y2={pendingConnection.y2}
          dashed
        />
      )}
      {/* Active wire being dragged (dashed) */}
      {activeWire && (
        <BezierWire
          x1={activeWire.sourceX}
          y1={activeWire.sourceY}
          x2={activeWire.currentX}
          y2={activeWire.currentY}
          dashed
        />
      )}
    </svg>
  );
}
