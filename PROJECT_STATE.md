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
| [`TimerBlock.tsx`](file:///d:/A/src/blocks/TimerBlock.tsx) | `timerBlock` | `trigger` | **Both** (Left input: trigger, Right output: trigger) | Mode (Dropdown), Duration (Number), AutoStart (Checkbox), Background Color, Border Radius, Opacity, Width, Font Size, Text Color |
| [`HistoryChartBlock.tsx`](file:///d:/A/src/blocks/HistoryChartBlock.tsx) | `historyChartBlock` | `unknown` | **Left Port Only** (Left input: watch block) | Track this block (Dropdown list of blocks), Background Color, Text Color |
| [`DatabaseBlock.tsx`](file:///d:/A/src/blocks/DatabaseBlock.tsx) | `databaseBlock` | `database` | **Both** (Left input: trigger, Right output: dynamic mode value) | Columns Definition (Name + Type dropdown), Output Mode picker, standard background/border/opacity styling controls |
| [`FormulaDisplayBlock.tsx`](file:///d:/A/src/blocks/FormulaDisplayBlock.tsx) | `formulaDisplayBlock` | `number` | **Right Port Only** (Right output: computed number) | Formula Input, Background Color, Border Radius, Opacity, Width, Text Color, Font Size |
| [`ListBlock.tsx`](file:///d:/A/src/blocks/ListBlock.tsx) | `listBlock` | `unknown` | **Left Port Only** (Left input: trigger/watch) | Tracked Block ID, Background Color, Border Radius, Opacity, Width, Text Color |
| [`ShapeBlock.tsx`](file:///d:/A/src/blocks/ShapeBlock.tsx) | `shapeBlock` | `unknown` | **Dynamic** (Ports attach when Role = Trigger) | Role (Dropdown: None, Trigger), Label Content, Background Color, Border Radius, Opacity, Width, Height, Text Color, Font Size |

---

## Core Mechanisms Confirmed Working

* **Dynamic Shape Role System (`ShapeBlock.tsx`)**
  * **Implementation:** `src/blocks/ShapeBlock.tsx`, `src/blocks/ShapeBlock.inspector.tsx`, `src/lib/renderBlockStyles.ts`, `src/state/atoms.ts`, and `src/components/PublishedRenderer.tsx`.
  * **Mechanism:** Decouples visual shape appearance from behavior. Shapes start roleless (`role === null`), rendering no ports. When assigned **Trigger**, ports attach and clicking fires `onClick` workflows. When role is None, no ports render and clicking only drags.
* **Block Dragging**
  * **Implementation:** `src/hooks/useBlockDrag.ts` and the `onPointerDown`/`onPointerMove`/`onPointerUp` wrappers in each individual block component.
  * **Mechanism:** Utilizes pointer capture via `setPointerCapture` and `releasePointerCapture` on drag start. Tracks changes relative to `#editor-container` and updates `blockPositionAtom` via Jotai, triggering saves. *Note: Fixed a bug where Preview Mode changes were not registered due to a missing dependency in the drag hook array.*
* **Wire Drawing**
  * **Implementation:** `src/components/WireOverlay.tsx` (for SVG overlay rendering) and `src/App.tsx` (for canvas drag-end snapping & logic initialization).
  * **Mechanism:** Clicking an output port sets the `activeWireAtom`. Snaps to input ports within a 20px radius. Snapped target is held in `snapTargetAtom`. Drawing a valid wire opens the `ConnectionPopup` at target coordinates.
* **Wire Type-checking**
  * **Implementation:** `src/App.tsx` (`onPointerUp` snap target resolution) and `src/state/atoms.ts` (`getBlockDataType` and `getPortBadge`).
  * **Mechanism:** On connection, checks if types are compatible. `string -> string` (compatible), `trigger -> number` (compatible), `trigger -> boolean` (compatible), and `trigger -> database` (compatible) are allowed. Mismatches display a tooltip overlay notifying the user and auto-dismiss after 2 seconds.
* **Conditional Workflows**
  * **Implementation:** `src/lib/bindingEngine.ts` (execution flow) and `src/App.tsx` (configuration creation in `ConnectionPopup`).
  * **Mechanism:** Evaluates matched triggers. Conditions can check another block's value with operators. If checks pass, executes steps like `increment`/`decrement`, `set` (with `__sourceValue__` support), `toggle`, `setVisible`, `setHidden`, `addRow`, `updateRow`, and `deleteRow`.
* **Supabase Persistence & Multi-Page Support**
  * **Implementation:** `src/lib/supabase.ts` (Supabase client instance) and `src/App.tsx` (`initApp`, `savePageData`, `switchPage`, and `createNewPage` functions).
  * **Mechanism:** Pages are saved and loaded independently using secure RPC calls. RLS on the `pages` and `database_rows` tables is fully locked down (direct access via the anon key returns nothing). All reads and writes are routed through eight security definer RPC functions: `get_page`, `list_pages`, `save_page`, `create_page`, `list_database_rows`, `add_database_row`, `update_database_row`, and `delete_database_row`. Switching pages uses `editor.commands.setContent()` with a 150ms crossfade without unmounting the TipTap editor. The active page ID is persisted in `localStorage` so refreshing the browser restores the last active page.
* **Right-Click Context Menu**
  * **Implementation:** `src/App.tsx` (`ContextMenu` component) and capturing-phase click listeners inside blocks.
  * **Mechanism:** Triggers on `contextmenu` events. Allows users to "Delete Block" (removing the node, removing Jotai state instances, cleaning up connections/workflows) or "Disconnect all wires".
* **Slash Menu Insertion**
  * **Implementation:** `src/App.tsx` (`commands` list, `filteredCommands` list, `handleSelectCommand`, and the keydown listener in `editorProps`).
  * **Mechanism:** Pressing `/` opens a drop-down select menu with options to insert Button, Number Display, Toggle, Input, Text Label, History Chart, or Database Table blocks. Uses standard navigation.
* **Chained Formula Recalculation Loop**
  * **Implementation:** `src/lib/bindingEngine.ts` (`recalculateAllFormulas`).
  * **Mechanism:** Performs a double-pass variable scope evaluation to resolve one-level deep formula chaining within the same execution frame.
* **History Chart Sliding Window**
  * **Implementation:** `src/lib/bindingEngine.ts` (`recalculateAllFormulas`).
  * **Mechanism:** Watches a target block's value changes, appends them to a sliding array, and caps the history at 20 entries maximum.
* **Database Block Persistence**
  * **Implementation:** `src/blocks/DatabaseBlock.tsx` & `src/lib/bindingEngine.ts`.
  * **Mechanism:** Cell updates are debounced by 500ms and synced to the `database_rows` Supabase table. *Note: The `database_rows` table has been created and verified. Prior to this fix, the table did not actually exist in the database (all row data was nested inside the page's saved JSON payload and survived intact during the migration).*

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
6. **Update Row Verification Status**
   * Update Row is implemented and fully verified — the matcher correctly uses the specified column for matching, and updates the mapped columns independently without cross-coupling.
7. **No Local Supabase DB Credentials**
   * There are no stored database passwords or credentials locally in the workspace. Any SQL/DDL operations must be executed manually in the Supabase Dashboard SQL Editor. After any DDL schema change, an explicit `NOTIFY pgrst, 'reload schema';` command must be run to refresh PostgREST's stale schema cache.

---

## What Does NOT Exist Yet

The following concepts have been discussed but are **NOT** implemented in the codebase yet:
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
│   ├── ToggleBlock.tsx     # Boolean switch block.
│   ├── TimerBlock.tsx      # Trigger block representing a ticking timer.
│   ├── TimerBlock.inspector.tsx # Inspector configurations for TimerBlock.
│   ├── HistoryChartBlock.tsx # Chart block graphing tracked block history.
│   ├── HistoryChartBlock.inspector.tsx # Inspector configurations for HistoryChartBlock.
│   ├── DatabaseBlock.tsx   # Supabase-backed datastore table block.
│   ├── DatabaseBlock.inspector.tsx # Inspector configurations for DatabaseBlock.
│   ├── ShapeBlock.tsx      # Multi-role dynamic shape block.
│   └── ShapeBlock.inspector.tsx # Inspector configurations for ShapeBlock.
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
