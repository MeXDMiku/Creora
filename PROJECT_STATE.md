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

### Live updating — VERIFIED 11 Aug 2026 (later)

A Database block updating without a refresh is now proven on the live domain,
end to end. This was previously unverifiable by automation because the driven
tab is never foregrounded, so `visibilityState` is permanently `hidden` and the
poll correctly declines to run. Getting past that does not need a real window:

```js
Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
Object.defineProperty(document, 'hidden',          { get: () => false,     configurable: true });
```

With that in place, on `/view/a968f487-...`:

```
before          2 rows, count 2
a stranger      add_database_row via the anon key with NO session  -> 204
                (the open page was not touched, refreshed or navigated)
after ~9s       3 rows, count 3, "LIVE TEST" visible
```

The count moving 2 -> 3 matters as much as the row appearing: it proves the new
`onChange` fires on the **poll** path, not only on first load. The test row was
then deleted with the owner session and the table is back to 2.

That is the whole product in one observation — two people on the same page at
the same time, one of whom owns nothing.

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

### Published pages are not the editor *(added 11 Aug 2026, later)*

The live Feedback page was opened as a stranger would see it and read back
element by element. Four things were wrong; all four are fixed.

**A Database block now has a real `onChange` event.** It fires whenever the row
set changes -- on first load, on each poll, and after add/update/delete -- in
both the editor and the published renderer. It is guarded on an actual change,
because the published poll runs every ~4s and firing workflows unconditionally
would re-run them forever. `onClick` still fires alongside it so pages wired
before this keep working, and a wire drawn *from* a Database now creates an
`onChange` workflow (`App.tsx`) rather than `onClick`.

Why this mattered: a Database loaded its rows and set its own value, but nothing
pushed that value along the wire, so a connected Number Display rendered whatever
had been saved into the page JSON. The live page showed **"Count: 2" beside a 0**.
A visitor only ever saw the true count if they submitted something themselves --
which is the shared-state thesis failing at the one place a visitor can see it.

**A published Database is display-only.** No cell editing, no per-row delete, no
"+ Add Row". This is not cosmetic, it follows the ownership model: `update_database_row`
and `delete_database_row` are owner-only, so those controls could only ever be
refused; and "+ Add Row" *worked*, letting a stranger write straight past the form
the page was designed around. Rows arrive through a wired action -- a Submit button
running `addRow` -- which is the path ownership actually permits.

Also removed from published pages: the "Edit Dashboard" link into the owner's
editor, and the "DATABASE TABLE" caption. `document.title` is now the page name;
every published tab used to be titled "a".

### A Database block used to overwrite the page it had just loaded *(fixed 11 Aug 2026, later)*

Worth knowing about because the same shape can exist elsewhere. `DatabaseBlock`'s
row-loading effect spread `runtimeState` **as captured when the effect ran**. The
Supabase fetch is async and races page hydration:

1. the block mounts holding its defaults (`blockName: "Database"`, columns `Name`/`Age`)
2. `App.tsx` hydrates the page's saved runtimeStates into the atoms
3. the fetch resolves and writes the **defaults** back over them, keeping only
   `rows` and `value`

The poll then re-ran that same stale closure every few seconds. Symptom: the
editor showed the Feedback page as `Database / Name / Age` while storage still
said `Submissions / Name / Message`.

Nothing had been persisted -- but `savePageData` collects
`store.get(blockRuntimeAtom(id))`, so the next save of that page would have
written `Name`/`Age` over `Name`/`Message`, and the Submit button maps a field to
the `Message` column. Messages would have silently stopped being recorded.

`PublishedRenderer` never had this bug because it spread `currentLocalState`,
read fresh from the store -- which is why the published page showed the right
columns while the editor showed the wrong ones. The editor now does the same.

**The general rule:** inside an async effect or a polled callback, read block
state from the store at write time. Never spread a value captured at render.

### Phone layout — VERIFIED 11 Aug 2026 (later)

Measured in a real 390px viewport, not a simulated one. `resize_window` does not
change this tab's viewport (`innerWidth` stays 1920), and patching `matchMedia`
only proves the branch runs, not that it fits. **The reliable technique is a
same-origin iframe sized to the phone width** — its `innerWidth` really is 390,
its media queries genuinely match, and every geometry read is real:

```js
const f = document.createElement('iframe');
f.style.cssText = 'width:390px;height:844px;position:fixed;right:0;top:0';
f.src = '/view/<pageId>'; document.body.appendChild(f);
```

Result on the Feedback page at 390px:

```
scrollWidth 390 = clientWidth 390     no horizontal scroll
every block   left 17, right 373, width 356
order         name -> message -> Submit -> count -> submissions table
```

The table that used to sit at x=420, entirely off-screen, is now last and fully
visible. At 1920px the same page still renders 5 absolutely positioned blocks at
their stored coordinates and zero stacked wrappers, so the desktop view is
genuinely untouched rather than merely looking similar.

### Shape roles — VERIFIED on the live domain *(11 Aug 2026, later)*

`ShapeBlock` is the "treat it like Lego" mechanism: a shape means nothing until
it is told what it is. It had one role since 22 July. It now has four, and a
shape's **data type is derived from its role** (`shapeRoleDataType` in
`state/atoms.ts`), so wire type-checking can finally reason about it — previously
`shapeBlock` was hardcoded `'unknown'`. This follows the precedent already in the
code, where a Database block's type comes from its output mode.

| role | ports | behaviour |
| :--- | :--- | :--- |
| None | none | drags only |
| Trigger | both | click fires `onClick` |
| Display | left | shows the value it receives |
| Input | right | editable field, fires `onChange` |
| Link | none | click navigates to `targetPageId` |

Ports follow the role, not the block type: a left port when something can flow
in, a right port when something can flow out.

**Proven on a real published page**, `/view/e564ca73-03bc-452f-87a5-acf119241bac`
("Shape Roles"), built entirely from shapes:

```
Input role     typed "Aridaman"  ->  the Display role shape showed it
Trigger role   3 clicks          ->  counter 0 -> 3
Link role      1 click           ->  navigated to the Feedback page
```

Every one of those is a different job done by the same block type. That page is
a live demo of the model and is safe to delete.

Note Link needed no code in the published renderer: `runTrigger` already
navigates when `targetPageId` is set.

### Full regression sweep — 11 Aug 2026, end of session

A lot shipped in one day, and each piece had only been verified alone. Swept
everything together against the live domain.

**All 6 pages, loaded at a real 390px viewport:**

```
rendered            6 / 6      no error cards
"Made with Creora"  6 / 6
tab title correct   6 / 6      no more "a", no more "Published Page"
horizontal scroll   none       on any page
stacking            fires only on the pages that have blocks
```

**Ownership re-attacked with a session-less client** (anon key, no JWT), because
the published renderer was heavily edited today:

```
read a published page      ALLOWED   (correct)
read rows on it            ALLOWED   (correct)
list the owner's pages     nothing   (correct)
overwrite a page           DENIED — not your page
unpublish a page           DENIED — not your page
delete a row               DENIED — not allowed
page name afterwards       "Feedback", not "DEFACED"
```

Nothing built today weakened the model.

**Note:** the Feedback table holds 3 rows, not 2 — the third is `dsadw213 /
3213213` at 14:42, the owner testing his own published form. Worth recording so a
future session does not treat it as a stray write.

### The next thing to build

The Feedback page exists, is published, and now shows a correct count to a
stranger. **Send the link to five people and watch where they hesitate.** That
list is the roadmap and nothing written in advance beats it.

The one thing still unverified in a browser: a Database table updating live
without a refresh. Automation cannot test it -- the driven tab is never
foregrounded, so `visibilityState` is always hidden and the hook correctly
declines to poll. Open the editor on a laptop, submit from a phone, watch the
table grow within ~4s.

Then, in order: build the same page **by hand through the editor** (the existing
one was written through `save_page`, so it proves the engine, not the editor);
collections (rows are still scoped only by `database_block_id`); the layout
decision (blocks sit at fixed x/y and do not reflow on a phone); an Edge Function
layer as the single foundation for AI keys, OAuth secrets and rate limits; then
end-user accounts. See docs/DIRECTION.md for what is deliberately not being built.

### Cycle 1 — validation and form states *(12 Aug 2026)*

First cycle run under `docs/HOW_WE_WORK.md`. Queue item 1.

**What a form can now say about itself**

Every Input block carries an ordered list of rules. Fourteen kinds: required,
email, number, whole number, web address, phone, min/max length, min/max value,
starts with, ends with, **your own regular expression**, and **must match another
field** (which is how "confirm your email" is built). The first rule that fails is
the message shown, and the order is the builder's, so which complaint is heard is
their choice, not ours.

Every rule takes the builder's own wording. Leave it blank and ours is used.
The message line under the field can be switched off entirely and coloured
freely — a builder who wants the error inside their own markup turns it off and
reads the field's state from their own design. **The default is a starting point,
never a ceiling.**

**The rule that shapes the behaviour: empty passes everything but `required`.**
"Optional, but if they fill it in it must be an email" is the most common shape
of an optional field and it is unsayable if `email` rejects blank.

**When it complains**

Per field: when they leave it (default), every keystroke, or only on submit.
An error is *computed* immediately but only *shown* once the field is `touched`.
Without that, an empty required field is invalid the moment the page loads, and
saying so tells someone off for not having typed yet. Typing never reveals a new
complaint but always clears one already on screen.

**The submit guard**

A step that writes a row refuses to run when a field it reads is invalid, and
marks every field it reads as touched — so one press reveals the whole form's
problems rather than one per press. On by default for `addRow`/`updateRow`,
off for everything else, and a checkbox in the action popup either way. Steps
that name no fields (send-to-another-app) check every field on the page that has
rules.

Pages that predate this are unaffected: a block with no rules is always valid.
Proved, not assumed — see the check named "pages saved before any of this behave
exactly as they did".

**Busy, and disable-while-sending**

`sendWebhook` marks the pressed button busy for the life of the request and
clears it when it settles, either way. While busy or switched off, the button
takes no clicks — enforced in `executeWorkflow` itself, not only in the renderer,
so it holds even for a builder's own markup wired straight to the engine.
Navigation is guarded separately in both renderers, because it is not a workflow
step. Busy text is the builder's; blank keeps the same label.

**New actions and a new condition**

Actions: `validate`, `setLoading`, `clearLoading`, `setDisabled`, `setEnabled`.
Conditions: `passes its rules` / `fails its rules`, offered on any field, because
they ask the block's rules rather than its value. `reset` now also clears the red
and un-touches the field — a reset form is a fresh form.

---

### The bug this cycle found: three blocks were never being saved *(fixed 12 Aug 2026)*

**Live Data, My Design and Visitor could not persist anything.** Paste your HTML
into a My Design block, reload, and it was back to the default markup. Same for a
Live Data block's URL and a Visitor block's field.

Cause: `"is this TipTap node one of our blocks?"` was hand-written as a
`typeName === 'buttonBlock' || typeName === '...'` chain in **nine** places —
App.tsx (×8) and `getCanvasBlocks` in atoms.ts — plus a tenth copy as an array in
PublishedRenderer. Three of those nine were the save paths. Every block added
after those chains were written was invisible to saving, to `allBlockIdsAtom`,
and to every dropdown.

All ten now call `isBlockNodeType()` from `blockRegistry.ts`, which is the file
that already owned `BLOCK_NODE_TYPES`. One list.

**Why the previous cycle's consistency check missed it:** it checked five
registration points — published list, TipTap extension, `getBlockDataType`,
inspector file, renders-when-published. The save path was not one of them. A
check that only looks where you already looked confirms what you already believe.

**Transient state was being persisted too.** `touched`, `validationError`,
`loading` and `fetchError` belong to one person looking at one page right now.
Saved, they mean a visitor arrives to a form already showing red, or worse, a
button permanently stuck as busy with no way to press it. `withoutVisitorState()`
strips them on save *and* on load — on load as well, because pages already saved
with them have to come back clean.

---

### There are runnable checks now — `npm run check` *(12 Aug 2026)*

`scripts/checks.ts`. **78 checks, all passing.** It imports the real modules —
`validation.ts`, `bindingEngine.ts`, `blockRegistry.ts`, real Jotai stores — and
runs them. It is not a copy of the logic.

    npm run check      # 78 checks
    npm run typecheck  # tsc -b

Covers: every rule against real values including the near-misses, rule order and
custom messages, cross-field matching, the touched gate, the submit guard both
blocking and allowing, the guard switched off, **old pages behaving identically**,
busy and disabled swallowing presses, the new actions, `isValid` conditions with
an Otherwise branch, reset clearing the red, and what may and may not be saved.

It also checks registration **mechanically**, which is what would have caught the
bug above: every block type has an inspector, can be inserted, is a TipTap
extension, and renders when published — plus two guards that fail if anyone
hand-writes the block list again as a `||` chain or as a second array.

**Both guards were negative-controlled**: a file containing a chain and a copied
array was added on purpose, both checks failed as intended, and the file was
removed. A check that has never been seen to fail is not a check.

How it runs without a test runner: Node 22 strips the types, and
`scripts/loader.mjs` bridges the two real gaps between Vite's resolution and
Node's — extensionless imports, and `src/lib/supabase.ts` reading
`import.meta.env`, which throws on import outside Vite. The source was not bent
to fit the test.

**Not verified this cycle, and not claimed:**

- **The live site.** The browser extension was disconnected for the whole cycle,
  so nothing was clicked on the real domain. Everything above is proved locally.
  Cycle 2 opens with it.
- **`vite build`.** Cannot run from the Linux side of the workspace: `node_modules`
  holds only `win32-x64` native bindings for rolldown and oxlint, because the
  install was done on Windows. `tsc -b` is pure JS and does run. Build on Windows.

---

### Cycle 2 — images *(13 Aug 2026)*

Queue item 1. **A fifteenth block type: Image.**

**The design decision the whole block rests on: an image's value IS its address.**

Because the value is a plain string, everything that already existed works on a
picture with no code written for it — a `set` action swaps it, a Database column
feeds it, a Live Data field feeds it, a condition asks whether it is empty, a
wire carries it, `addRow` maps it into a column like any text field. There is no
"file column" concept and there does not need to be one. This is the Lego idea
applied to a data type rather than to markup.

**What it does**

- Address in, picture out. Paste a link, or wire something into it.
- Upload from the editor: hover the block, press Upload. Also in the panel.
- **Visitor uploads** on published pages, switchable per block, with the
  builder's own wording on the drop area. The uploaded address becomes the
  block's value, which is why a form can save it without a new concept.
- Fit (crop / letterbox / stretch / never-enlarge / original), size, corner
  rounding all the way to a circle for avatars, opacity, custom CSS.
- Alt text, which is read aloud and shown when a picture fails.
- **A picture can be a button.** It fires `onClick` on published pages and in
  preview, so it can navigate, add to a cart, open a thing.
- A broken address says so instead of showing a silent empty box, and a new
  address always gets a fresh attempt.

**Addresses are filtered, not trusted.** `normalizeImageUrl` allows http, https,
blob, site-relative, and `data:image/`. It refuses `javascript:`, `vbscript:`,
`file:`, `data:text/html`, and the split-scheme trick (`java\nscript:`) — control
characters are stripped before the scheme is read. A refused address returns an
empty string, so a caller that forgets to check renders nothing rather than
something hostile. This mirrors sanitizeHtml.ts on purpose: two places that
decide what a URL may be have to agree.

**Uploads fail in words.** Every refusal a person can act on is decided before a
byte moves — too big says how big *and* what the limit is; HEIC is named as "what
your iPhone produces, convert it to JPEG" rather than as an unsupported MIME
type; a missing bucket says which bucket to make and which doc to read. That is
why `src/lib/images.ts` is pure and `src/lib/imageUpload.ts` is the only part
that touches the network — the failures worth getting right are all decidable
offline, which means `npm run check` can hold them.

**Gallery is deliberately not built.** A gallery is "for each row" plus an image,
and "for each row" is the next queue item. Building a bespoke gallery now means
building it twice.

**Needs one-time setup before uploads work: `docs/SETUP_STORAGE.md`.** A public
bucket called `creora-images`, a read policy, and a decision about who may
upload. Until it exists the block says exactly that, and images-by-address work
regardless.

---

### The registry check earned its place *(13 Aug 2026)*

Adding the Image block touched five registration points. `npm run check` verified
every one of them mechanically the first time it ran — inspector present,
insertable, TipTap extension, renders when published — which is exactly the class
of bug that cost three blocks their persistence last cycle.

One check was rewritten rather than updated: `count is 14` became "no duplicates
in the list". **A check that has to be edited to keep passing trains you to edit
checks.**

`npm run check` is now **120 checks**. The new ones were negative-controlled: the
URL scheme guard was removed and the size limit raised on purpose, nine checks
went red, and everything went green again on restore.

**A real bug the checks found while being written:** `storagePathFor('../../secret.png')`
produced `..-..-secret.png`. Harmless — the slashes were already gone, so it
could not climb out of the folder — but a stored name that still *looks* like an
attack is one somebody wastes an afternoon on. Dot runs are now collapsed.

**Still not verified against production: two cycles running.** The browser
extension has been disconnected throughout. A second route — calling the RPCs
directly over HTTP with the publishable key, to run the stranger-attack half
without a browser — was blocked by the sandbox's safety classifier, which is a
reasonable thing for it to stop. Nothing since 11 Aug has touched RLS or the
RPCs, so there is no reason to think the security model has moved. That is not
the same as having checked.

---

### Cycle 3, part one — an XSS in shipped code *(fixed 13 Aug 2026)*

Found while designing the repeater, not by looking for it. **Bugs before
features, so the feature waited.**

**The hole.** `sanitizeHtml` ran *before* `fillSlots`. So in a My Design block:

    <a href="{{Message}}">Read more</a>

at sanitise time the attribute value was literally `{{Message}}` — harmless,
passed. The slot was filled afterwards, unchecked. A stranger submits
`javascript:...` into the column feeding that slot, another visitor clicks, and
script runs on the Creora domain: reads `localStorage`, takes the Supabase token
of whoever is looking. That is exactly the scenario sanitizeHtml's own header
comment says must never happen. It was live.

**A second hole in the same check.** `isSafeUrl` did `v.trim().toLowerCase()`
then `startsWith('javascript:')`. It never removed control characters, so

    <a href="java&#10;script:alert(1)">

decoded to an attribute containing a real newline, did not start with
`javascript:`, passed — and browsers strip whitespace out of a scheme before
acting on it, so it ran anyway.

**Root cause: three URL policies.** `sanitizeHtml` had a denylist,
`normalizeImageUrl` (written the day before) had an allowlist, and the Image
block had whatever the browser did. A denylist and an allowlist for one question
will always drift, and the denylist was the weak one.

**The fix.**

- **`src/lib/urls.ts` is now the only URL policy.** Allowlist —
  `http, https, mailto, tel, blob`, plus `data:image/` only where a picture is
  expected. Control characters, zero-width characters and BOMs are stripped
  *before* the scheme is read. `safeUrl()` returns the cleaned address rather
  than a boolean, deliberately: a caller that asks "is this safe?" and then uses
  the original string has checked one value and rendered another, which is
  precisely how the control-character hole worked. There is nothing to use
  except the answer.
- **`sanitizeHtml` now returns `urlSlots`** — the slots standing at the front of
  a URL attribute, which are the ones that decide a scheme. A slot *later* in a
  value (`href="/user/{{Id}}"`) cannot change the scheme, because the literal
  text in front of it already did, so it is not flagged.
- **`fillSlots` takes that list and enforces it.** A guarded slot whose value has
  no safe scheme becomes empty, and an empty `href` does nothing.
- Both call sites updated. There were only two, and the published renderer
  imports the editor's own `CustomHtmlView` — the one-implementation discipline
  meant one fix covered both.

**Held by 45 new checks**, including every control-character variant as a real
string. Negative-controlled: `stripIgnorable` was made a no-op and eleven checks
went red. One check is deliberately written to assert the *bug* —
"without the urlSlots list nothing is checked" — so if anyone drops the argument,
the reason it exists is spelled out beside the failure.

---

### Cycle 3, part two — For each row *(13 Aug 2026)*

Queue item 1. **Sixteenth block type.** The biggest unlock so far.

**What was missing.** Everything Creora could show was a fixed shape somebody
here chose: a table that looks like our table, a list that looks like our list.
A blog, a directory, a gallery, a leaderboard and a page of search results are
all the same thing — rows, laid out however the builder wants — and none of them
were expressible.

**What it is.** Pick a Database. Write **one row's markup**, with `{{Column}}`
slots. It repeats. The markup goes through the same sanitiser as My Design, so a
card designed in Figma, generated by an AI, or lifted off a site they liked
becomes a repeating card driven by real rows. **That is the Lego idea applied to
a list**: they bring the design, Creora attaches the data behind it.

- **Slots**: every column, plus `{{Row number}}` and `{{Row id}}`. A slot that is
  not a column falls back to a block on the page with that name, so a card can
  show a heading or a search term without that being a separate feature.
- **Which rows**: filter (same equality-as-text rule the Database block already
  uses — one filter concept, not two), order by any column or "last to first"
  for a feed, and a limit.
- **Order of operations is the point**: filter, then sort, then limit. "The three
  cheapest red ones" is not "the red ones out of the three cheapest". There is a
  check named after that sentence.
- **Empty state is a first-class field.** An empty list that renders nothing at
  all reads as broken, and it is the state everyone forgets and every visitor
  eventually sees.
- **List or grid**, with a column count and gap — which is what makes it a
  gallery, and why a bespoke gallery block was never built.
- **Click a row** and the chosen column's value lands in the block, then anything
  wired out of it runs. One wire, not one per row. That is how a card opens a
  page, fills a form, or adds to a cart.
- **Blanks always sort last**, in both directions. An empty cell is missing data,
  not the smallest value, and a "newest first" list headed by rows with no date
  is useless.

**One view, two places.** `RepeatView` is used by the editor block *and* the
published renderer, the same way `CustomHtmlView` is. A repeater that showed
something different once published would be worse than no repeater.

**One loader.** If the Database block is on the page, its rows are used directly,
so a repeater can never show a different count from the table beside it. If it is
not — a gallery page with no visible table, which is the normal case — the
repeater fetches for itself, and polls on published pages so a visitor watches
the list grow as other people add to it.

**A ceiling that admits itself.** At most 200 rows are drawn, because each row is
a separate slot-fill and a 5,000-row table would lock the tab. When it stops
short the page says *"Showing 200 of 230 (30 not shown)"* on screen. A page that
silently renders a subset is lying. Paging is queue item 4.

`npm run check` is now **202**. The row logic was negative-controlled by moving
the limit before the filter and flipping the blank ordering; six checks went red,
all green on restore.

**Live verification: three cycles owed.** Browser extension disconnected
throughout. Given that this cycle fixed a live XSS, the first thing worth doing
with a browser is confirming the fix on the real domain.

---

### Cycle 4 — text and dates, wherever a value is shown *(13 Aug 2026)*

**The queue was reordered, on purpose, with a reason.** Top of the queue was
Collections + per-visitor data. That is a schema migration and new RPCs — server
work — and from here a migration cannot be applied (no network to Supabase) and
cannot be verified afterwards (no browser, four cycles running). Building it now
meant shipping several hundred lines of client code against RPCs that do not
exist, entirely unproven, one cycle after finding a live XSS in code that looked
right.

**Standing rule added to HOW_WE_WORK: while live verification is blocked, build
what can be proved and queue what cannot.**

Text and dates was promoted, and it is not a detour — it finishes cycle 3. "For
each row" shipped a blog list that renders `{{Created}}` as
`2026-08-13T11:25:09.390Z`, with no way to turn that into "13 Aug 2026". Anyone
picking up the repeater hits it in ten minutes.

**A pipeline inside the slot**

    {{Created | date: D MMM YYYY}}      13 Aug 2026
    {{Created | ago}}                   3 hours ago
    {{Price   | money: $}}              $1,234.50
    {{Views   | number}}                1,204,000
    {{Body    | truncate: 120}}         cut at a word, with an ellipsis
    {{Photo   | default: none yet}}     what "empty" should look like
    {{now     | plus: 7 days | date: dddd}}

Fifteen filters — date, time, ago, plus, minus, money, number, round, percent,
upper, lower, title, trim, truncate, default. They chain left to right and they
work **everywhere slots already work**: My Design, For each row, and anything
added later, because they live inside `fillSlots` rather than inside a block.
`{{now}}` and `{{today}}` are available to every template, and lose to a real
column of that name — the builder's data beats ours.

**Two rules the whole file is built on**

- **Every filter is total.** Nothing ever puts `NaN`, `Invalid Date` or
  `undefined` on a page a stranger is reading. A filter that cannot do its job
  returns the value untouched, so an unreadable date shows the raw text — a
  nuisance — rather than "Invalid Date", which is a bug report.
- **The clock is an argument.** Anything time-dependent takes `now` rather than
  calling `Date.now()` inside itself, so checks can pin it. A test that passes in
  August and fails in September is not a test.

**Also: `setText`**, a workflow action that sets a value from a sentence —
`Hello {{First}}, that is {{Total | money: $}}`. It resolves names through the
same function templates use, so a workflow and a piece of markup can never
disagree about what `{{First}}` means. Not escaped, because it produces a value
rather than markup: a name with an ampersand should stay a name.

**Three bugs the checks found while being written**

1. **`a` is the am/pm token**, so `D MMM YYYY [at] HH:mm` rendered as
   `3 Aug 2026 amt 09:05`. Square-bracket escaping added, plus the friendly
   reading of an unclosed bracket — everything after it was obviously meant to be
   their own words, so formatting the rest anyway helps nobody.
2. **`default:` filled a zero.** `!value` is not the same as "blank", and 0 is an
   answer. There is now a check named after that sentence.
3. **`useSlotValues` joined slot names with a space and split on it**, which
   quietly broke every slot whose name contained one — `{{Row number}}`, shipped
   last cycle, or any block called "Total price". Pre-existing; found while
   extracting the shared resolver.

**One resolver.** `blockValuesByName` now lives in atoms.ts and is used by both
`useSlotValues` and the binding engine, so there is one answer to "which block
does this name mean".

`npm run check` is now **299**, up from 202. Negative-controlled three ways:
shortest-token-first (the `AugAug` bug) turned two red, `default:` filling a zero
turned one red, and moving the URL guard *before* the filters turned red the
check that proves `{{Link | default: javascript:alert(1)}}` cannot smuggle a
scheme past it.

**Live verification: four cycles owed.** Unchanged and not improving.

---

### Cycle 5 — search, filter, sort, paginate *(13 Aug 2026)*

Queue item 2, and the thing the repeater's 200-row cap was already asking for.

**The idea is the same one that made images work: make the controls values.**
Every control on a repeater can now come from a block instead of a fixed
setting, which is what turns a static list into something a visitor operates.

- **Search** — point it at an Input block and typing narrows the list. **Every
  word must appear somewhere in the row, but not in the same column**: "lovelace
  lon" finds Ada in London. Matching the whole phrase against each column
  separately is the obvious implementation, finds nothing, and reads as broken.
  Optionally restricted to named columns; blank means all of them.
- **Filter** — now with the product's **own operator vocabulary** rather than a
  second private one: is, is not, contains, more than, at least, is empty, and
  the rest. The value can be fixed or come from a block, so a dropdown of
  categories or an "in stock only" toggle drives it.
- **Sort** — still settable in the panel, and now overridable by a block: one
  block naming the column, a Toggle for the direction. That is a visitor-sortable
  list without a new concept.
- **Pages** — rows per page, with a built-in Previous / Next that can be switched
  off for anyone who wants their own buttons. The page number is clamped, not
  trusted: **past the end shows the last page, never an empty one**, because an
  empty page reads as "nothing found" rather than "wrong page".
- **Searching or re-sorting returns to page one.** The classic paging bug, one
  line, and a check named after it.

**Order of operations, again**: search, then filter, then order, then take a
page. Page 2 of a search is not a search of page 2.

**`evaluateCondition` moved to `src/lib/conditions.ts`.** Not for the import
graph — because a visitor typing in a search box and a workflow deciding whether
to run a step are asking the same question, and answering it twice would mean
"contains" quietly meaning two things.

**A real bug the checks found, in shipped code**

`evaluateCondition('', 'lessThan', 9)` was **true**, because `Number('')` is 0.
So "only run this if Score is less than 9" fired for every row whose Score had
never been filled in — in workflows, which have shipped for weeks, not just in
the new filter. It is the same mistake as sorting blanks first, decided
correctly in cycle 3 and wrongly here. Comparisons now go through a helper that
treats a blank on either side as "cannot be compared". A real 0 still compares.

**Three of my own checks were wrong, and the code was right.** "ada lon" does
match *Cy Adams, London*, because substrings match inside words. Rather than
weaken the checks, the behaviour is now documented by a check that says so out
loud — `search: 'ada'` returns both Ada and Adams.

`npm run check` is now **361**, up from 299. Negative-controlled three ways at
once — page clamp removed, search reduced to phrase-per-column, blank-is-zero
restored — and nine checks went red, including all three named after the traps
they guard.

**Live verification: five cycles owed.**

---

### Cycle 6 — per-visitor rows *(13 Aug 2026)*

Queue item 1, taken because the alternative was another cycle of client work
while the thing every remaining item depends on stayed unwritten.

**UNVERIFIED. The SQL in this cycle has never been run.** No browser, and no
network path to Supabase from this session. It is written, reviewed line by line
and documented; it is not proved. `docs/MIGRATION_0004.md` ends with the five
steps that would prove it, and says plainly what to do if step 3 fails.

**What it unlocks.** Until now a row belonged to a block and to nobody else,
which makes "my cart", "my orders" and "my saved things" impossible — every
visitor to a published page sees every other visitor's rows, because nothing on
a row says whose it is.

**The decision: privacy is enforced in the database, not in the editor.**
The easy version is a checkbox that filters the list in the browser. That is not
privacy — the other rows are one fetch away for anyone who opens the network
tab, and a page that *looks* private while leaking every customer's order is
worse than one that never claimed to be. So the flag is a row in
`collection_settings`, and `list_database_rows` reads it before deciding what to
return:

    collection is not private  ->  everything, exactly as before
    the page's owner           ->  everything; it is their shop
    anyone else                ->  only rows they own

**Also added**: `owner_id` on every row, stamped on insert;
`update_my_database_row` and `delete_my_database_row`, which are the *visitor's*
tools — their own row, on a page they may read. `update_database_row` and
`delete_database_row` are untouched and remain the owner's. Before this, a
visitor could add a row and then never touch it again, so "change the quantity
in my basket" was unsayable.

**The line worth reading twice**, in `list_database_rows`:

    and (auth.uid() is not null and dr.owner_id = auth.uid())

Without `auth.uid() is not null`, a caller with no session matches every row
whose owner is null — which is every row written before this migration — and a
private collection hands its whole history to anyone signed out.

**What it deliberately does not do.** A visitor is an anonymous Supabase session,
which lives in one browser. Clear site data, or open the page on a phone instead
of a laptop, and it is a different visitor with an empty cart. Real accounts for
visitors are the next item, and this is the half that has to exist first —
accounts without ownership on rows would have nothing to attach to.

**The client half degrades.** One switch on the Database block. Until the
migration is run it reports exactly what is missing and points at the doc, in the
same way the Image block does about its storage bucket.

**The negative control caught two of my own checks being decoration.** Removing
the `PGRST202` code check and the schema-cache check broke nothing, because both
test messages also matched the "could not find the function" clause. Two checks
were added where each signal is the only signal, and the sabotage then turned
them red. **A check that cannot be made to fail is not coverage, it is a
comforting sentence.**

`npm run check` is now **370**.

**Live verification: six cycles owed, and now it blocks something concrete.**
There is unproven SQL in the repo.

---

### Cycle 7 — the audit, re-run *(13 Aug 2026)*

No feature. **The map was two days and six cycles out of date**, which is the
condition under which a plan quietly starts pointing at finished work.

`docs/CAPABILITIES.md` (11 Aug) listed images, validation, for-each-row, dates,
search and per-visitor data as the blockers. All six now exist. Anyone reading it
to decide what to build next would have built something already built.

**Method, so it can be re-run rather than re-felt:**

1. Inventory taken **from the code**, not from memory — block types from
   `BLOCK_NODE_TYPES`, actions from the `WorkflowStep` union, operators from
   `conditions.ts`, filters from `format.ts`, RPCs from the migrations. Four
   grep commands, written into the doc so the next person does not have to
   invent them.
2. Walk ten real site types from the first click to the last, and write down
   where each one stops.
3. Order what is left by **blast radius** — how many site types it unblocks —
   which is a question with an answer, unlike "what should we do next".

**Where it stands: four of ten site types moved.** Waitlist and portfolio are
possible today. Landing page is blocked on layout alone. Shop is blocked on
payments alone.

**The finding that no previous plan contained: there is no way to open one row.**

A blog lists posts and cannot show a post. A directory lists businesses and
cannot show a business. Clicking a row already puts its value somewhere, and
buttons already navigate — **what is missing is that a page cannot receive a
value.** There is no `?id=`, and nothing on the destination page can ask which
row it was opened with.

It blocks three of the ten site types on its own, it is the smallest remaining
item, and six cycles of planning never surfaced it — because every plan so far
asked "what feature is missing" instead of walking a site click by click. It is
now queue item 1.

**The queue was rewritten from the audit rather than maintained by hand**, and
`HOW_WE_WORK.md` now says that if the queue and the audit disagree, the audit is
right and the queue is stale.

**Two things the audit refuses to pretend**, both written into it: every `HAVE`
is a claim about code held up by 370 checks and by nothing on the real domain,
and the least-checked part is not the logic but the **editor** — dragging,
selecting, the panel, the slash menu, untouched by a human since 11 Aug. And
migration 0004 is marked `UNPROVED`, so "a shop needs only payments" is currently
a statement about a file.

---

### Cycle 8 — page parameters: the chain closes *(13 Aug 2026)*

Queue item 1, straight off the re-run audit. **Seventeenth block type.**

**The whole chain now exists:** a repeater lists rows, clicking one opens another
page carrying that row, the destination reads what it was opened with, and its
own repeater filters to that single row. Blog, directory and shop detail pages —
three of the ten site types — were blocked on the one sentence in the middle.

- **Page value block** — reads a named value out of the address.
  `/view/<page>?id=abc` gives it `abc`. Named values rather than "the row id"
  deliberately: `?category=shoes&sort=price` costs nothing extra, and a design
  that only carried row ids would need replacing the first time somebody wanted
  a filtered link.
- **Clicking a row opens a page**, carrying a template the builder writes:
  `id={{Row id}}&title={{Name}}`. Filters work in it, because it is the same
  template engine as everywhere else.
- **Buttons carry values too**, built from blocks on the page.
- **`Row id` is a filter column**, so a detail page works with no setup at all.
  Requiring a Slug column first would be more correct and would stop most people
  at step one.

**The ordering that is the whole job: split the template first, fill it second,
encode it last.** Fill first and a title containing an ampersand has already
become a second parameter before anything looks at it. That is the same shape as
the bug that once let a filter smuggle a scheme past the URL guard, in a
different costume, and there is a check named after it.

**What I cut, and why.** A `goToPage` *workflow action* was planned and dropped.
It needs a wire dragged to a target block, and navigation has no target block, so
it would have been an action that ignores its own target. More to the point it
unblocks **zero** additional site types — row-click plus button parameters close
the chain. **Generality that unblocks nothing is scope, not power.** In the
backlog with that reason.

**The gap that only showed up by walking the click path.** In the editor there is
no address, so a detail page would be blank while you design it. `pageParamsAtom`
is `null` in the editor and an object on a published page — the distinction is
the feature. Null means "show the stand-in so this page can be laid out"; an
object means "this is a real address, the stand-in is not yours to use". One
empty object could not have told those apart, **and a published page showing the
builder's preview row would mean every visitor sees the same row.** There is a
check named after that too, and the negative control proves it fails when the
distinction is removed.

**Also fixed while passing:** the new refresh loop matched block ids with
`id.startsWith('pageValueBlock')`. A string standing in for a type check is
exactly what made three block types unsaveable in cycle 2. It goes through
`nodeTypeFromBlockId` now.

`npm run check` is **418**, up from 370. Negative-controlled two ways — encoding
removed and the stand-in leaked onto published pages — twelve went red, including
every one named after a trap.

---

### Cycle 9 — every kind of field, and a menu with rooms *(13 Aug 2026)*

Queue item 1. **Two critical calls, both of which made this faster.**

**1. The queue said "six new input types". Six blocks were not built.**

Dropdown, number, date, long text, radio and checkboxes are the same block
wearing different clothes. They are now **one setting on the Input block** —
`fieldType` — exactly as Shape has roles and as the Image block's value turned
out to be an address.

    text · several lines · number · email · password · date · time
    dropdown · pick one · pick any number

They inherit validation, error messages, required, disabled, busy, placeholder
and the touched rule **because none of it was written again**. Six separate
blocks would each have needed all of it, and would have drifted the first time
one was fixed and the others were not. There is a check group named after that
argument: `validation still applies whatever kind of field it is`.

**The queue described the symptom** — "we only have text and toggle". Building
the naive reading of a queue item is how a codebase ends up with six things that
each rot separately.

**2. The insert menu was a flat list of 17 tools, about to become worse.**

Cloudflare's achievement is not its visuals, it is that everything is in a room
you would expect. `docs/TOOL_CATEGORIES.md` has had the three layers written down
since 11 Aug and nothing used them. The menu now groups by **Interface / Data /
Operations**, each with a plain-language line under it.

Taken now rather than in the arrangement phase, deliberately: this is not the
visual redesign, it does not touch the layout model, and adding six more tools to
a flat list when the organisation already existed on paper would have been
knowingly making the mess bigger. Grouping is rendered inside the existing flat
map, so **the index the arrow keys walk is unchanged** — a nested list would have
been the obvious implementation and would have quietly broken keyboard selection.

**Decisions inside the field work**

- **The value is always a string**, even for checkboxes, where it is the ticked
  options joined by a comma. `contains` already exists in the operator
  vocabulary, so "did they tick Express delivery" needed no new concept, and a
  Database column holding `a, b` reads correctly in a table and in a CSV. An
  array would have needed its own operators, its own display rule and its own
  column type.
- **Choices are one per line, not comma-separated.** Somebody wants
  "Bristol, Avon" as a single choice on their first afternoon.
- **The ticked order is the builder's**, not the order they were clicked. A list
  that reorders itself as you tick reads as a bug, and the stored value would
  change without the answer changing.
- **A choice removed from the list is not silently kept.** A half-filled form
  holding "Medium" after Medium was deleted is a value nobody can re-pick and
  nobody can explain.
- **Changing the kind of field clears the value.** A date left behind in a
  dropdown is data-shaped rubbish.
- **A dropdown gets an empty first choice**, so "not answered yet" is a real
  state and `required` means something.

**`FieldView` is one component used by the editor and the published renderer**,
for the reason everything else here is: ten field types drawn twice is twenty
places for a date picker to behave differently once published.

**A mistake worth recording.** Replacing the published input case, I sliced from
`inputBlock` to `pageValueBlock` and deleted every case in between. The
registration check caught it within seconds — `every type renders when published`
went red naming `imageBlock` and `repeatBlock`. `git checkout` could not restore
it, because this environment cannot unlink files; `git show HEAD:file > file`
rewrites in place and can. **The check that caught it was written in cycle 2 for
an entirely different bug.**

`npm run check` is **459**, up from 418. Negative-controlled three ways — commas
as separators, click order, and keeping a removed choice — five went red.

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
