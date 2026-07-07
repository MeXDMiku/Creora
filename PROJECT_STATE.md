# Project State Snapshot

This document provides a factual, verified snapshot of the current codebase of the Creora project. Every statement is based directly on the actual files present in the repository.

---

## Block Types That Exist

All blocks are implemented as custom TipTap nodes in `src/blocks/` and render their logic via React components wrapped in `NodeViewWrapper`.

| Block File | TipTap Node Name | Data Type | Ports | Inspector Controls |
| :--- | :--- | :--- | :--- | :--- |
| [`ButtonBlock.tsx`](file:///d:/A/src/blocks/ButtonBlock.tsx) | `buttonBlock` | `trigger` | **Both** (Left input: trigger, Right output: trigger) | Background Color, Border Radius (0-24px slider), Opacity (0-100% slider), Width (px), Text Color, Font Size (px) |
| [`InputBlock.tsx`](file:///d:/A/src/blocks/InputBlock.tsx) | `inputBlock` | `string` | **Output Port Only** (Right output: string/text) | Background Color, Border Radius (0-24px slider), Opacity (0-100% slider), Width (px) |
| [`NumberDisplayBlock.tsx`](file:///d:/A/src/blocks/NumberDisplayBlock.tsx) | `numberDisplayBlock` | `number` | **Both** (Left input: number, Right output: number) | Background Color, Border Radius (0-24px slider), Opacity (0-100% slider), Width (px), Text Color, Font Size (px), Minimum value (number), Maximum value (number) |
| [`TextLabelBlock.tsx`](file:///d:/A/src/blocks/TextLabelBlock.tsx) | `textLabelBlock` | `string` | **Both** (Left input: string/text, Right output: string/text) | Background Color, Border Radius (0-24px slider), Opacity (0-100% slider), Width (px), Text Color, Font Size (px) |
| [`ToggleBlock.tsx`](file:///d:/A/src/blocks/ToggleBlock.tsx) | `toggleBlock` | `boolean` | **Both** (Left input: boolean, Right output: boolean) | Background Color, Border Radius (0-24px slider), Opacity (0-100% slider), Width (px) |

---

## Core Mechanisms Confirmed Working

* **Block Dragging**
  * **Implementation:** `src/hooks/useBlockDrag.ts` and the `onPointerDown`/`onPointerMove`/`onPointerUp` wrappers in each individual block component.
  * **Mechanism:** Utilizes pointer capture via `setPointerCapture` and `releasePointerCapture` on drag start. Tracks changes relative to `#editor-container` and updates `blockPositionAtom` via Jotai, triggering saves.
* **Wire Drawing**
  * **Implementation:** `src/components/WireOverlay.tsx` (for SVG overlay rendering) and `src/App.tsx` (for canvas drag-end snapping & logic initialization).
  * **Mechanism:** Clicking an output port sets the `activeWireAtom`. Snaps to input ports within a 20px radius. Snapped target is held in `snapTargetAtom`. Drawing a valid wire opens the `ConnectionPopup` at target coordinates.
* **Wire Type-checking**
  * **Implementation:** `src/App.tsx` (`onPointerUp` snap target resolution) and `src/state/atoms.ts` (`getBlockDataType` and `getPortBadge`).
  * **Mechanism:** On connection, checks if types are compatible. `string -> string` (compatible), `trigger -> number` (compatible), and `trigger -> boolean` (compatible) are allowed. Mismatches display a tooltip overlay notifying the user and auto-dismiss after 2 seconds.
* **Conditional Workflows**
  * **Implementation:** `src/lib/bindingEngine.ts` (execution flow) and `src/App.tsx` (configuration creation in `ConnectionPopup`).
  * **Mechanism:** Evaluates matched triggers. Conditions can check another block's value with operators: `is ON`, `is OFF`, `equals`, `notEquals`, `greaterThan`, `lessThan`, `contains`, `isEmpty`. If checks pass, executes steps like `increment`/`decrement` (obeying min/max values), `set` (with `__sourceValue__` support for mirror connections), `toggle`, `setVisible`, and `setHidden`.
* **Supabase Persistence**
  * **Implementation:** `src/lib/supabase.ts` (Supabase client instance) and `src/App.tsx` (`loadPage` & `saveToSupabase` functions).
  * **Mechanism:** Pages are saved under a hardcoded `PAGE_ID` (`00000000-0000-0000-0000-000000000001`). Documents are saved inside a `blocks` payload holding TipTap `documentContent` JSON, block `positions`, Jotai `runtimeStates`, and canvas `connections`. Updates are debounced by 500ms.
* **Right-Click Context Menu**
  * **Implementation:** `src/App.tsx` (`ContextMenu` component) and capturing-phase click listeners inside blocks.
  * **Mechanism:** Triggers on `contextmenu` events. Allows users to "Delete Block" (removing the node, removing Jotai state instances, cleaning up connections/workflows) or "Disconnect all wires".
* **Slash Menu Insertion**
  * **Implementation:** `src/App.tsx` (`commands` list, `filteredCommands` list, `handleSelectCommand`, and the keydown listener in `editorProps`).
  * **Mechanism:** Pressing `/` opens a drop-down select menu with options to insert Button, Number Display, Toggle, Input, or Text Label blocks. Uses standard navigation (ArrowUp/ArrowDown to select, Enter to confirm, Escape to cancel).

---

## Known Quirks or Non-Obvious Behaviors

1. **TipTap Wrapper Heights Collapsed to Zero (`src/index.css`)**
   * TipTap NodeView wrapper divs are styled in `src/index.css` to have `height: 0 !important; overflow: visible !important; margin: 0 !important; padding: 0 !important;`.
   * **Why:** This collapses ProseMirror's vertical flow nodes. Since block components are positioned absolutely on the canvas, this prevents adding/deleting nodes from shifting the vertical layout flow of other blocks.
2. **Native Event Capture for Context Menus**
   * Because ProseMirror intercepts clicks and context menus, typical React synthetic `onContextMenu` handlers on child inputs or divs can get lost or fail to stop propagation.
   * **Solution:** `InputBlock` and `ToggleBlock` register native DOM capturing-phase listeners (`el.addEventListener('contextmenu', handleContextMenu, true)`) directly on their wrapper DOM element reference to bypass ProseMirror.
3. **Hardcoded IDs and Instance Limits**
   * When inserting blocks via the Slash Menu, Creora attempts to assign hardcoded IDs like `test_btn_1`. If that ID is occupied, it assigns `test_btn_2`. If both are occupied, inserting that block type becomes a silent no-op.
4. **Mirror Connections (Input -> Text Label)**
   * When connecting an `InputBlock` to a `TextLabelBlock` (string-to-string), the connection popup is bypassed. A workflow step is immediately created with a target action of `set` and a payload value of `'__sourceValue__'`.
5. **No SQL/Direct Expression Evaluation**
   * In compliance with architecture rule 7/13, no direct SQL query or JavaScript `eval` is used. Conditional checks use hardcoded operator cases, and direct values use the binding engine parser.

---

## What Does NOT Exist Yet

The following concepts have been discussed but are **NOT** implemented in the codebase yet:
* **Database Blocks:** No block is capable of editing rows or listing databases; schemas defined in the types exist conceptually but have no renderer components.
* **Publishing:** The published site renderer (`Rule 8`) does not exist yet. Only the `EDITOR` (the interactive canvas) is implemented.
* **Desktop App:** The codebase is purely a web application and lacks desktop environment wrappers.
* **AI Integration:** No AI tools or prompt widgets are implemented in the UI.

---

## File Structure Summary

```
d:/A/src/
├── App.css                 # Sidebar, header, canvas, context menu, and mismatch warning layout styling.
├── App.tsx                 # Core App shell. Sets up the TipTap editor, loads/saves to Supabase, renders overlay popup configurations, sidebars, slash menus, and manages active drag target lines.
├── index.css               # Tailwind-based global style tokens, dark/light theme variables, and TipTap collapsing node view classes.
├── main.tsx                # Entry point mounting the React app.
├── assets/                 # SVGs and images (hero.png, react.svg, etc.)
├── blocks/                 # Custom TipTap nodes and their React components:
│   ├── ButtonBlock.tsx     # Trigger block representing a button.
│   ├── InputBlock.tsx      # String text box block.
│   ├── NumberDisplayBlock.tsx # Numeric block displaying current value.
│   ├── TextLabelBlock.tsx  # String label block displaying value text.
│   └── ToggleBlock.tsx     # Boolean switch block.
├── components/
│   └── WireOverlay.tsx     # Renders the SVG paths for connections between active block ports.
├── hooks/
│   └── useBlockDrag.ts     # Pointer capture-based drag engine for container-relative positioning.
├── lib/
│   ├── bindingEngine.ts    # Logic engine resolving workflow executions and conditional events.
│   └── supabase.ts         # Supabase client instantiation.
├── state/
│   └── atoms.ts            # Jotai global atoms (connections, active wires, selected IDs, context menu coordinates, type helpers).
└── types/
    └── creora.ts           # Typescript interfaces defining Creora models (Blocks, Pages, Workflows, style attributes).
```
