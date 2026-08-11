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
  * **Mechanism:** Pages are saved and loaded independently using secure RPC calls. RLS on `pages` and `database_rows` blocks direct table access. **That alone was not security**: every RPC is SECURITY DEFINER and was granted to `anon` with no caller check, so until 11 Aug anyone with the public anon key could list, read and overwrite any page. Ownership now closes this — see Identity below. All reads and writes are routed through eight security definer RPC functions: `get_page`, `list_pages`, `save_page`, `create_page`, `list_database_rows`, `add_database_row`, `update_database_row`, and `delete_database_row`. Switching pages uses `editor.commands.setContent()` with a 150ms crossfade without unmounting the TipTap editor. The active page ID is persisted in `localStorage` so refreshing the browser restores the last active page.
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
3. **Block IDs** *(changed 11 Aug 2026)*
   * IDs are `<nodeType>__<random>`, from `newBlockId()` in `src/lib/blockRegistry.ts`. A page can hold any number of blocks of a type. Previously the slash menu assigned fixture IDs (`test_btn_1`, then `test_btn_2`) and a third insert was a **silent no-op**. Block type used to be guessed by substring-matching the ID (`id.includes('db')`); it is now read from the ID prefix via `nodeTypeFromBlockId()`, with a legacy fallback so old `test_*` pages still work.
4. **Mirror Connections (Input -> Text Label)**
   * When connecting an `InputBlock` to a `TextLabelBlock` (string-to-string), the connection popup is bypassed. A workflow step is immediately created with a target action of `set` and a payload value of `'__sourceValue__'`.
5. **No SQL/Direct Expression Evaluation**
   * In compliance with architecture rule 7/13, no direct SQL query or JavaScript `eval` is used. Conditional checks use hardcoded operator cases, and direct values use the binding engine parser.
6. **Update Row Verification Status**
   * Update Row is implemented and fully verified — the matcher correctly uses the specified column for matching, and updates the mapped columns independently without cross-coupling.
7. **Supabase schema lives in the repo** *(changed 11 Aug 2026)*
   * `supabase/schemas/prod.sql` is the captured production schema, `supabase/migrations/` holds applied migrations, and `supabase/README.md` explains the workflow. DDL is still run by hand in the Dashboard SQL Editor because the CLI has never been linked (`supabase login && supabase link` is the missing step); after any DDL change run `NOTIFY pgrst, 'reload schema';` or new functions return 404. The project is on the Free plan and pauses after ~1 week idle — a paused project stops resolving in DNS entirely. `.github/workflows/keep-supabase-awake.yml` pings it daily. This happened once, on 10 Aug.

---

## What Does NOT Exist Yet

The following concepts have been discussed but are **NOT** implemented in the codebase yet:
* **Desktop App:** The codebase is purely a web application and lacks desktop environment wrappers.
* **AI Integration:** No AI tools or prompt widgets are implemented in the UI.
* **Team / multi-user:** One account owns everything. There is no sharing, no roles, no invites.
* **Publish UI:** `set_page_published` exists in the database but nothing in the interface calls it yet.

---

## Identity and Ownership *(added 11 Aug 2026)*

Every page has an `owner_id` and an `is_published` flag. `database_rows` has a `page_id`, so a row can be authorised against the page that owns it.

| action | who |
| :--- | :--- |
| read a page | owner, or the page is published |
| list pages | owner only |
| create / save | owner only, and only when signed in |
| publish / unpublish | owner only |
| read rows | owner, or the page is published |
| add a row | owner, or the page is published — **visitors may submit** |
| update / delete a row | owner only |

Verified live against production on 11 Aug using a session-less client holding only the public anon key. Against a private page every call returned empty or "not allowed". After publishing, the stranger could read the page and add a row (3 rows -> 4) but could not overwrite the page, delete or update a row, unpublish it, or list any other page. The probe row was removed and the page set back to private.

`src/lib/session.ts` signs in anonymously on boot and `initApp` awaits it before the first RPC, because `list_pages` returns nothing without a session. Visitors to a published page need no session at all.

**Email sign-in exists** (`src/components/AccountBadge.tsx`). The toolbar chip is amber "This browser only" while anonymous and green with the address once linked. One field does both jobs: `updateUser({ email })` attaches the address to the current anonymous user, which Supabase does **without changing the user id**, so pages already owned come along; if the address already belongs to an account it falls back to `signInWithOtp`, which signs into that id — so pages return on a second browser. Verified 11 Aug: after linking, all 3 pages still loaded and were owned by the email account.

The built-in mail service allows only **2 auth emails per hour**; raising it needs custom SMTP. The Site URL is still `http://localhost:3000` and there are no Redirect URLs configured, but Supabase accepted the localhost redirect anyway during testing.

**Anonymous identity alone is fragile, which is why the above exists.** It lives in browser storage; clearing it or moving device produces a new `auth.uid()`. On 11 Aug two anonymous users existed and the pages belonged to the wrong one — the app looked completely empty until `owner_id` was reassigned by hand. One stale anonymous user remains in `auth.users`, owning nothing.

**`claim_orphan_pages()` has been removed** from the client, and `supabase/migrations/0002_drop_claim_orphan_pages.sql` drops it from the database. It existed only to adopt the pages that predated ownership; while it existed, any caller could inherit an unowned page.

---

## Type checking — use `npm run typecheck`, never `tsc --noEmit` *(11 Aug 2026)*

`tsconfig.json` is `"files": []` with only project references, so `tsc --noEmit`
compiles **zero files** and always exits 0. It is not a check; it is a no-op that
looks like a passing check.

The real command is `tsc -b`, exposed as `npm run typecheck`, and it is what
`npm run build` runs. When this was first run properly on 11 Aug it reported 24
errors that had accumulated invisibly — all of them type declarations that had
drifted from what the code actually does at runtime, not broken logic:
`matchValue` declared as a string while the engine reads `.source` and
`.value`; `pendingConnectionAtom` missing the x1/y1/x2/y2 the overlay draws
with; `connectionContextMenuAtom` declaring `wireId` while both writer and
reader use `connectionId`; `pagesListAtom` typed as `Page[]` when it holds
`{id, name}` summaries; a `reset` workflow action that is implemented but was
not in the union; and the whole `.creora` export format, which serialises far
more than the in-memory Block and Page types declared.

The production build could not have succeeded in that state, so any deploy would
have failed.

---

## Where things stand — 11 Aug 2026

**Creora is deployed.** https://creora.aridamanpratapsingh4.workers.dev — a
Cloudflare Worker serving static assets, built from GitHub on every push to
master. Config lives in `wrangler.jsonc` (the Workers flow has no dashboard
field for the output directory). Do not add a `public/_redirects` with
`/* /index.html 200` — Workers reads that as a redirect loop and fails the
deploy after a successful build; `not_found_handling` already covers SPA
routing. Build-time `VITE_*` variables are set under Settings -> Build, not
runtime variables.

Supabase Site URL and Redirect URLs point at the live address and at
localhost:5173, so email sign-in works in both.

### Done and verified against production
- Block identity: unlimited blocks per page, unique type-tagged ids
- Published pages navigate (useNavigate was imported and never called)
- Identity and ownership, attacked live with a session-less client and held
- Email sign-in, which keeps the same auth.uid() so pages follow the account
- Publish button, with share link, copy, open and unpublish
- The production build actually builds (`npm run typecheck`, never `--noEmit`)

### Done, not verified
- Database blocks poll for new rows while the tab is visible. Automation could
  not test it because the driven window is never foregrounded, so
  visibilityState is always hidden and the hook correctly declines to poll.
  Confirm by opening the editor on a laptop and submitting from a phone.

### The first real page exists — 11 Aug 2026

A published Feedback page, built and proven end to end:
`/view/a968f487-0fe3-4743-9824-e1fe651654eb` (works on the live domain too).
Two Inputs, a Submit button wired to addRow with column mappings, a
Submissions table, and a count.

Filling both fields and pressing Submit recorded `Ananya: This actually
works!`. A session-less client holding only the public anon key then opened
the page and submitted `Rahul (no account)`, and was refused with "not your
page" when it tried to edit. Two rows, both produced by the product rather
than by a test script.

That is the whole thesis in one page: a stranger uses something they do not
own, changes shared data, and cannot damage anything.

It was assembled by writing the page structure through `save_page` rather than
by clicking, because the automation tab is never the visible tab and cannot
reliably drive the editor. Building the same page by hand through the UI is
still worth doing once, as a test of whether the editor is usable by a person.

### The next thing to build
One real public page, end to end: two Inputs, a Submit button wired to add a
row, a Database showing submissions, and a Number Display of the count.
Publish it, send the link to five people, watch rows arrive. **Every mechanism
this needs already exists and has been tested separately** — the work is
assembling them into one page, not inventing anything.

After that, in order: collections (rows are still scoped only by
database_block_id), an Edge Function layer as the single foundation for AI keys
and OAuth secrets and rate limits, then end-user accounts. See docs/DIRECTION.md
for what is deliberately not being built.

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
