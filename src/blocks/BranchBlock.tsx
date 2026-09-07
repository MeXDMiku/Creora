import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useAtomValue, useSetAtom, useStore } from 'jotai';
import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import {
  blockRuntimeAtom,
  activeWireAtom,
  snapTargetAtom,
  contextMenuAtom,
  getBlockTypeDisplayName,
  isPreviewModeAtom,
} from '../state/atoms';
import { useBlockDrag } from '../hooks/useBlockDrag';
import { blockToCSS } from '../lib/renderBlockStyles';

/**
 * The question, drawn.
 *
 * WHY THIS BLOCK EXISTS
 * A step has been able to branch since 11 Aug: `step.condition` decides whether
 * it runs, and `elseAction`/`elseTargetId` say what happens when it does not.
 * That is the capability, and the record has said ever since that the
 * capability was the easy half. The complaint it does not answer is the one a
 * builder actually has:
 *
 *   "the branch cannot be seen on the canvas"
 *
 * A condition buried in a popup is a rule the page obeys and nobody can read.
 * This is the same argument as the hidden dependencies the canvas now draws:
 * the engine knew, and could not say.
 *
 * WHAT IT IS
 * One input, two outputs. A trigger arrives, the question is worked out ONCE,
 * and only one side fires. Both sides carry a trigger, so anything that can be
 * wired from a Button can be wired from either branch -- which is the point of
 * making it a port rather than a special case.
 *
 *        ┌─────────────┐
 *   ───▶ │  is it so?  │ ──▶ yes
 *        │             │ ──▶ no
 *        └─────────────┘
 *
 * WHY TWO PORTS AND NOT A SECOND BLOCK TYPE PER BRANCH
 * Because the alternative is one block per shape of question, which is the trap
 * the record names outright: eleven block types that do not compose beat
 * nothing. A port is a primitive; every action that already exists works from
 * both sides of it on the day it ships.
 */
const BranchComponent = ({ node }: NodeViewProps) => {
  const { blockId } = node.attrs;
  const store = useStore();
  const [isHovered, setIsHovered] = useState(false);
  const setActiveWire = useSetAtom(activeWireAtom);
  const activeWire = useAtomValue(activeWireAtom);
  const snapTarget = useAtomValue(snapTargetAtom);
  const setContextMenu = useSetAtom(contextMenuAtom);
  const isPreviewMode = useAtomValue(isPreviewModeAtom);

  const atomInstance = useMemo(() => blockRuntimeAtom(blockId), [blockId]);
  const runtimeState = useAtomValue(atomInstance, { store });

  const containerRef = useRef<HTMLElement | null>(null);
  if (!containerRef.current) containerRef.current = document.getElementById('editor-container');
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const { position, handlePointerDown, handlePointerMove, handlePointerUp } = useBlockDrag(
    blockId,
    containerRef as React.RefObject<HTMLElement>,
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

  /**
   * One handler for both outputs. The port it left from travels on the wire, so
   * the drop can write it onto the connection and the step -- see ports.ts for
   * why absent has to keep meaning `out`.
   */
  const startWire = (port: 'if' | 'else') => (e: React.PointerEvent) => {
    e.stopPropagation();
    const c = containerRef.current; if (!c) return;
    const cr = c.getBoundingClientRect();
    const pr = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = pr.left + pr.width / 2 - cr.left;
    const y = pr.top + pr.height / 2 - cr.top;
    setActiveWire({ sourceBlockId: blockId, sourcePort: port, sourceX: x, sourceY: y, currentX: x, currentY: y });
  };

  const { outer: outerStyle, inner: innerStyle } = blockToCSS('branchBlock', position, runtimeState);
  const isWireSource = !!activeWire && activeWire.sourceBlockId === blockId;
  // Always in the DOM, opacity only. A port mounted on hover cannot be measured
  // by the wire overlay, which is a bug this project has already had twice.
  const showOut = (isHovered || snapTarget === blockId) && !isPreviewMode;
  const showIn = (isHovered || (!!activeWire && !isWireSource)) && !isPreviewMode;

  const question = String(runtimeState?.question || '').trim();

  const portStyle = (top: string, colour: string, shown: boolean) => ({
    position: 'absolute' as const, right: '-5px', top, transform: 'translateY(-50%)',
    width: '10px', height: '10px', borderRadius: '50%', backgroundColor: colour,
    border: '2px solid white', opacity: shown ? 1 : 0,
    pointerEvents: shown ? ('all' as const) : ('none' as const),
    cursor: 'crosshair', transition: 'opacity 0.15s',
  });

  const labelStyle = (colour: string) => ({
    position: 'absolute' as const, right: '12px', top: '50%', transform: 'translateY(-50%)',
    fontSize: '9px', fontWeight: 700, color: colour, pointerEvents: 'none' as const,
    userSelect: 'none' as const, letterSpacing: '0.3px',
  });

  return (
    <NodeViewWrapper
      data-block-id={blockId}
      as="div"
      ref={wrapperRef as any}
      className="branch-block-wrapper"
      style={{ ...outerStyle, cursor: 'move' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div style={{ position: 'absolute', top: '-16px', left: 0, fontSize: '10px', opacity: 0.6, color: '#cbd5e1', userSelect: 'none', fontWeight: 500, whiteSpace: 'nowrap' }}>
        {runtimeState?.blockName || getBlockTypeDisplayName('branchBlock')}
      </div>

      <div contentEditable={false} style={innerStyle}>
        <div style={{ fontSize: '9px', opacity: 0.65, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>
          if
        </div>
        {/* The question itself, on the canvas. That is the entire point of the block. */}
        <div style={{ wordBreak: 'break-word', fontSize: '12px', opacity: question ? 1 : 0.55 }}>
          {question || 'ask something'}
        </div>
      </div>

      {/* Left (input) port — a trigger arrives here. */}
      <div
        contentEditable={false}
        data-port-input={blockId}
        title="Something wired into here makes this block work out its question"
        style={{
          position: 'absolute', left: '-5px', top: '50%', transform: 'translateY(-50%)',
          width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#22c55e',
          border: '2px solid white', opacity: showIn ? 1 : 0,
          pointerEvents: showIn ? ('all' as const) : ('none' as const),
          transition: 'opacity 0.15s',
        }}
      />

      {/* Two outputs. `data-port-name` is what makes them distinguishable. */}
      <div
        contentEditable={false}
        data-port-output={blockId}
        data-port-name="if"
        title="Runs when the question is true"
        onPointerDown={startWire('if')}
        style={portStyle('32%', '#22c55e', showOut)}
      >
        <span style={labelStyle('#22c55e')}>YES</span>
      </div>
      <div
        contentEditable={false}
        data-port-output={blockId}
        data-port-name="else"
        title="Runs when the question is not true"
        onPointerDown={startWire('else')}
        style={portStyle('68%', '#f97316', showOut)}
      >
        <span style={labelStyle('#f97316')}>NO</span>
      </div>
    </NodeViewWrapper>
  );
};

export const BranchBlock = Node.create({
  name: 'branchBlock',
  group: 'block',
  atom: true,
  selectable: true,
  /**
   * Attributes have to survive a round trip through HTML. renderHTML writing an
   * attribute that parseHTML does not match is how blockIds were lost before.
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
  parseHTML() { return [{ tag: 'div[data-type="branch-block"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', { ...HTMLAttributes, 'data-type': 'branch-block' }]; },
  addNodeView() { return ReactNodeViewRenderer(BranchComponent, { as: 'div' }); },
});
