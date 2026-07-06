# CREORA ARCHITECTURE RULES — READ BEFORE WRITING ANY CODE

These rules are non-negotiable. Violating any of them creates a known,
already-debugged failure mode. Follow them exactly.

## Tech Stack (locked, do not suggest alternatives)
React 18, TypeScript strict mode, TipTap 2.x, Jotai 2.x, Vite, Supabase,
Framer Motion. No Redux, no Zustand for new state, no styled-components.

## Rule 1 — Block Nodes
Every custom TipTap block node MUST have atom: true in its schema.
Every custom block's React component MUST set contentEditable={false}
on its inner content div (not on NodeViewWrapper, on the div inside it).
Without atom:true, cursor focus breaks on state updates.
Without contentEditable false, ProseMirror owns the DOM and fights React.

## Rule 2 — No AnimatePresence Inside NodeViews
ProseMirror manages its own DOM. AnimatePresence manages DOM via unmount
detection. These two systems conflict and ProseMirror wins, breaking the
animation. Inside any TipTap NodeView, use CSS transitions only:
opacity and transform with transition: all 0.3s ease.
Framer Motion motion.div with whileHover/whileTap is fine at the
OUTERMOST level inside NodeViewWrapper only. Never AnimatePresence inside.

## Rule 3 — Wires and SVG Overlay
The SVG overlay that renders wires MUST have pointerEvents: 'none'
as inline style. Without this, every click on the canvas is blocked.
Individual port circles inside blocks override this with
pointerEvents: 'all' so they remain clickable.

## Rule 4 — Coordinates Are Always Container-Relative
Every position calculation is relative to the EDITOR CONTAINER element,
never the viewport. Formula: elementRect.left - containerRect.left and
elementRect.top - containerRect.top. Never use raw getBoundingClientRect()
values directly as final positions.

## Rule 5 — Port Position Updates
Port positions update via THREE triggers only, never a dependency-less
useEffect running every render: 1. ResizeObserver on the block element,
2. Inline update during drag, 3. Scroll listener on the editor container.

## Rule 6 — Sliders in the Inspector
Never use onMouseDown={e => e.preventDefault()} on range inputs. For
preventing focus loss, wrap in a div with tabIndex={-1} and use
onPointerDown, never preventDefault on the slider itself.

## Rule 7 — No SQL Exposed to Users
Every database write goes through a Supabase Edge Function. Permissions
are a property on the Binding object set via a dropdown in the UI.

## Rule 8 — Two Separate Renderers
The EDITOR keeps one TipTap instance mounted permanently. Page switching
uses editor.commands.setContent() with a 150ms crossfade, never React
Router unmounting the editor. The PUBLISHED SITE uses a separate plain
React renderer with standard React Router, no TipTap involved at all.

## Rule 9 — Single Source of Truth for Styles
Both renderers call the same blockToCSS(block) function from
src/lib/renderBlockStyles.ts. Never duplicate style logic.

## Rule 10 — IDs Not Names
Every binding and reference uses the permanent id field, never display
name or label.

## Rule 11 — Atom Cleanup
When a block is deleted, call blockRuntimeAtom.remove(blockId).

## Rule 12 — Types Before Code
Before writing any new feature, check if it needs a new type added to
src/types/creora.ts first, as its own step, before the component.

## Rule 13 — Three Binding Editors, One Data Model
Wires, the formula bar, and the workflow step-list all produce the SAME
underlying objects: a Workflow (ordered steps) for actions, or a
FormulaBinding (expression string) for values. Never build these as
three separate systems. Drawing a wire from a button to a counter
creates a Workflow with exactly one WorkflowStep. Typing a formula in
the Inspector's "Display" or "Visible" field creates a FormulaBinding.
Adding a second action to an existing wire converts it into a multi-step
Workflow shown as a list, not as multiple overlapping wires.

Formula evaluation must NOT use raw JavaScript eval — this is a public-
facing security rule. Use a constrained expression-evaluator library
(research the current best lightweight option, do not use eval or
Function()) that only supports math, comparison, and property-path
access against a pre-built scope object.

## When You Are Unsure
If a request conflicts with any rule above, stop and flag the conflict
rather than silently picking one approach.
