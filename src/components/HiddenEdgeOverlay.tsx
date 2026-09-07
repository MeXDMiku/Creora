import { useAtomValue, useStore } from 'jotai';
import { useLayoutEffect, useMemo, useState } from 'react';
import {
  selectedBlockIdAtom, connectionsAtom, workflowsAtom, formulasAtom,
  queriesAtom, actionsAtom, allBlockIdsAtom, blockPositionAtom, blockRuntimeAtom,
} from '../state/atoms';
import { hiddenLinksTouching, type TouchingLink } from '../lib/hiddenEdges';

/**
 * The dependencies the canvas was not showing.
 *
 * WHAT THIS IS FOR
 * Measured on this project's own pages, most of what a page depends on has no
 * wire: a formula naming a block by raw id, a List pointed at a table through a
 * setting, a condition asking about a field. Every one is real and none is on
 * screen, which is the reported cause of "I moved something and another thing
 * broke". The Health panel lists them; this draws them.
 *
 * ONLY FOR THE SELECTED BLOCK, ON PURPOSE
 * Drawing all of them at once is a hairball, and a big one, because most of the
 * page is in it. The docs quote Kobourov on this: you cannot route your way out
 * of a hairball. The way out is fewer edges. So this draws one block's worth,
 * at the moment somebody has asked about that block by selecting it.
 *
 * WHAT IT CANNOT DRAW, AND DOES NOT PRETEND TO
 * A question and an action are nodes in the dependency graph and are NOT on the
 * canvas -- they live in their own panels. There is nowhere to put the other
 * end of that line, so those links are skipped here and stay in the Health
 * panel, which can name them in words. A line drawn to nowhere would be worse
 * than no line.
 */

/**
 * The block's own box.
 *
 * This used to find it THROUGH A PORT, because ports carried the block id and
 * the wrappers did not. That silently could not draw anything involving a List,
 * which has no ports at all -- and a List pointed at a table through
 * `trackedBlockId` is the commonest hidden dependency there is, and the example
 * in this file's own notes. Found by building one and watching no line appear.
 *
 * Every block wrapper carries `data-block-id` now, so this asks the block.
 *
 * A zero-height wrapper is not empty: several blocks are absolutely positioned
 * containers whose visible body is a child that overflows them. A List measures
 * 300x0 with an 83px panel inside it. So the box is the union of the wrapper and
 * its children, or the line would be pinned to the top edge of the block.
 *
 * This last part has no check and no control: it is `getBoundingClientRect`, so
 * nothing that runs without a browser can see it. Verified by hand instead,
 * against a List and a Formula block on a real page.
 */
function boxOf(container: HTMLElement, blockId: string): DOMRect | null {
  const wrapper = container.querySelector(`[data-block-id="${blockId}"]`) as HTMLElement | null;
  if (!wrapper) return null;
  const r = wrapper.getBoundingClientRect();
  let { top, bottom, left, right } = r;
  for (const child of Array.from(wrapper.children) as HTMLElement[]) {
    const c = child.getBoundingClientRect();
    if (c.width === 0 && c.height === 0) continue;
    top = Math.min(top, c.top); bottom = Math.max(bottom, c.bottom);
    left = Math.min(left, c.left); right = Math.max(right, c.right);
  }
  return new DOMRect(left, top, right - left, bottom - top);
}

function HiddenWire({ link }: { link: TouchingLink }) {
  // Subscribed so the line follows either block when it is dragged, the same
  // way a real wire does.
  const _from = useAtomValue(blockPositionAtom(link.from));
  const _to = useAtomValue(blockPositionAtom(link.to));
  const [coords, setCoords] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  useLayoutEffect(() => {
    const container = document.getElementById('editor-container');
    if (!container) return;
    const c = container.getBoundingClientRect();
    const a = boxOf(container, link.from);
    const b = boxOf(container, link.to);
    // Either end missing means it is not a block on this canvas -- a question or
    // an action, which live in their own panels. Nothing is drawn rather than a
    // line to a guess.
    if (!a || !b) { setCoords(null); return; }
    setCoords({
      x1: a.right - c.left, y1: a.top + a.height / 2 - c.top,
      x2: b.left - c.left, y2: b.top + b.height / 2 - c.top,
    });
  }, [_from, _to, link.from, link.to]);

  if (!coords) return null;

  const dx = Math.max(24, Math.abs(coords.x2 - coords.x1) * 0.4);
  const d = `M ${coords.x1} ${coords.y1} C ${coords.x1 + dx} ${coords.y1}, ${coords.x2 - dx} ${coords.y2}, ${coords.x2} ${coords.y2}`;

  return (
    <g>
      {/* Amber and dashed, so it never reads as a wire somebody drew. */}
      <path d={d} fill="none" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 4" opacity={0.85}>
        {/* The reason, on hover. It is the whole point of the line. */}
        <title>{`${link.direction === 'needs' ? 'this needs it' : 'it needs this'} — ${link.reasons.join(' · ')}`}</title>
      </path>
      <circle cx={coords.x2} cy={coords.y2} r={2.5} fill="#f59e0b" opacity={0.85} />
    </g>
  );
}

export function HiddenEdgeOverlay() {
  const selectedId = useAtomValue(selectedBlockIdAtom);
  const connections = useAtomValue(connectionsAtom);
  const workflows = useAtomValue(workflowsAtom);
  const formulas = useAtomValue(formulasAtom);
  const queries = useAtomValue(queriesAtom);
  const actions = useAtomValue(actionsAtom);
  const blockIds = useAtomValue(allBlockIdsAtom);
  const store = useStore();

  const links = useMemo(() => {
    if (!selectedId) return [];
    const runtimeStates: Record<string, any> = {};
    for (const id of blockIds) runtimeStates[id] = store.get(blockRuntimeAtom(id));
    return hiddenLinksTouching(
      { runtimeStates, connections, workflows, formulas, queries, actions },
      selectedId,
    );
  }, [selectedId, blockIds, connections, workflows, formulas, queries, actions, store]);

  if (!links.length) return null;

  return (
    <svg
      style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        pointerEvents: 'none', overflow: 'visible',
      }}
    >
      {links.map((link) => (
        <HiddenWire key={`${link.from}>${link.to}`} link={link} />
      ))}
    </svg>
  );
}
