import { useAtomValue } from 'jotai';
import { useLayoutEffect, useState } from 'react';
import { activeWireAtom, connectionsAtom, blockPositionAtom, pendingConnectionAtom } from '../state/atoms';

function PermanentWire({ sourceBlockId, targetBlockId }: { sourceBlockId: string; targetBlockId: string }) {
  // Subscribe to both block positions so we re-render when either block is dragged
  const _sourcePos = useAtomValue(blockPositionAtom(sourceBlockId));
  const _targetPos = useAtomValue(blockPositionAtom(targetBlockId));
  const [coords, setCoords] = useState({ x1: 0, y1: 0, x2: 0, y2: 0 });

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

  return (
    <line
      x1={coords.x1}
      y1={coords.y1}
      x2={coords.x2}
      y2={coords.y2}
      stroke="#6366f1"
      strokeWidth={2}
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
          sourceBlockId={conn.sourceBlockId}
          targetBlockId={conn.targetBlockId}
        />
      ))}
      {/* Pending connection wire (dashed) */}
      {pendingConnection && (
        <line
          x1={pendingConnection.x1}
          y1={pendingConnection.y1}
          x2={pendingConnection.x2}
          y2={pendingConnection.y2}
          stroke="#6366f1"
          strokeWidth={2}
          strokeDasharray="6 3"
        />
      )}
      {/* Active wire being dragged (dashed) */}
      {activeWire && (
        <line
          x1={activeWire.sourceX}
          y1={activeWire.sourceY}
          x2={activeWire.currentX}
          y2={activeWire.currentY}
          stroke="#6366f1"
          strokeWidth={2}
          strokeDasharray="6 3"
        />
      )}
    </svg>
  );
}
