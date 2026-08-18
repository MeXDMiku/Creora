# Work log

Newest first. Every entry says **what changed, why, and what it broke elsewhere**
— that last part is the one worth reading, because the pattern of this project
is that a new capability quietly invalidates assumptions that were correct when
they were written.

The code itself carries the detail. Every fix below left a comment at the site
explaining what was wrong and why the fix is shaped the way it is, so re-reading
a file tells you its history without needing this file. This is the index, not
the record.

---

## 17 August 2026

Continuing the same session. 1,091 checks, from 1,011. `tsc` clean. Every fix
has a negative control, and **two of the controls this time came back green**,
which is its own finding — see below.

### Shipped

**Markup can do arithmetic** — `{{calc: Price * Qty | money: £}}`. Row markup
could print `{{Price}}` and `{{Qty}}` and had no way to print £600; writing
`{{Price}} * {{Qty}}` renders `200 * 3`, because slots fill and the asterisk
just sits there.

**`{{now}}` and `{{today}}` rendered empty on every page** — found while
checking something else, live the whole time they have existed.

**The Health panel can see markup naming something absent** — the display half
of a check it already had for row formulas.

**A formula in the wrong spelling says which one** — `{{Price | money: £}}` in
a filter used to answer "Check the brackets and quotes."

### What broke elsewhere

| what shipped | what it silently broke |
| :--- | :--- |
| computed slots | the URL guard — a calculation could assemble `javascript:` and reach an `href` |
| computed slots | `findSlots` — it asked for a block called "calc: Total * 2", so every computed slot outside a repeater rendered empty |
| the Health panel check | five separate copies of "what does this block answer to", which had agreed by luck |
| computed slots | the repeater panel promised a syntax with nothing on screen saying it existed |

### The one that was already broken

`{{now}}` and `{{today}}` **rendered empty in Custom HTML and in row markup**,
and always had. They were checked through `renderTemplate` — what a workflow's
text step uses. Markup goes a different way: something resolves the names first
and hands `fillSlots` a set of values, and it copied every name it was **asked**
about, including ones no block owned, as a key holding `undefined`. `fillSlots`
reads a present key as "a block answered this", so the fallback that knows about
`now` was never reached.

**A check that exercises a path no builder uses is not a check of the feature.**

### Two negative controls came back GREEN

Both times the rule was intact and the control broke the wrong half:

- `withBuiltIns` is a Proxy; the precedence lives entirely in `get`. Swapping
  the halves of `has` changes nothing — both orders answer true when either side
  has the name. Noted at the site, so the next person breaks the right half.
- a control filtered for `calc:` slots coming out of `findSlots`, which by then
  no longer emits that shape at all. Breaking the expansion instead turned ten
  checks red, including the Health-panel one — which is the proof that the panel
  covers calculations without any code of its own.

**A control that stays green has two explanations, and "the check is fine" is
only one of them.** Read which half you actually broke before believing either.

### Later the same day — tables, and three silent zeros

1,239 checks, from 1,091. `tsc` clean.

**A page could get ONE number out of a table.** `outputMode` is a single
setting, so a Database block showed the count or the revenue or the average and
never two of them — and a second Database block is not a second view, it is a
second table with its own rows. "Revenue, orders, average order value", the
first three numbers on any dashboard, was not expressible however many blocks
were added. Now `countOf` `sumOf` `avgOf` `minOf` `maxOf` `joinOf`, in formulas,
in conditions, and in row markup (`{{calc: Total / sumOf("Orders","Total") * 100
| round: 1}}%` — a row's share of the whole).

**Two tabs stopped overwriting each other** — migration 0006, unrun.

### Three silent zeros, all the same shape

Each one answered **0** and looked like an answer:

| what | why it was zero |
| :--- | :--- |
| `sumOf("Orders", "Totl")` | a misspelled column adds up nothing |
| `sumOf` over a column holding `12o` | NaN poisons the sum, and a NaN result becomes 0 |
| the Database block's own sum, same cell | skips it, so the total is short by one row and looks plausible |

The third is not fixed the same way and that is deliberate: it returns a value
straight into an output port, with nowhere to put an error and eight callers
reading it. Taking a block's whole output away over one cell is worse than a
short total — so the **Health panel** reports the cause instead, and the
difference is written at both sites rather than being an accident.

**A total that refuses is annoying for a minute. A total that is quietly wrong
gets trusted.**

### Four more negative controls came back GREEN

Two were real gaps, two were the harness lying:

- **real:** every table-function check called `evaluateExpression` directly with
  a table map handed to it, so removing the map from the *engine's* call — the
  line that decides whether a real page can use any of this — turned nothing
  red. The functions worked perfectly in a place no builder reaches. Same again
  for conditions. Both now go through a real store.
- **real:** the column plumbing was checked only on hand-built maps.
- **harness:** a check whose expression *throws* kills the run before the tally,
  so the control saw no failures and read that as "nothing broke". Controls now
  report whether the run **finished**, and a run that did not finish is not
  believed.
- **overclaiming:** one check was named for a distinction that does not exist on
  screen. Renamed to what it actually proves.

Running total: **six** green controls across two days. Every one was worth
chasing, and only half were real.

### Notes worth keeping

- **An example printed in the UI is a promise.** The repeater panel prints a
  worked `{{calc: ...}}` in the builder's own column names, so it lives in
  `rows.ts` and is checked by being **run**. It skips a column with a space in
  it, because a calculation takes bare names — offering one that cannot work is
  worse than offering nothing.
- **The two spellings are real and not an apology.** `{{Price}}` in a filter,
  `Price` in a condition: a column name can contain a space and a bare
  identifier cannot. The fix is for each box to say which it takes.
- `git` in this working copy cannot remove its own lock files. Move
  `.git/index.lock` and `.git/HEAD.lock` aside before each command.

---

## 16 August 2026

A single long session. 972 checks at the end, from 621 at the start. `tsc` clean
throughout. Every fix has a negative control — the code is broken on purpose,
the check is watched going red, then restored.

### The recurring lesson

**A new capability does not just add behaviour. It changes what the surrounding
code's assumptions mean.** Three separate things broke this way today, none of
them bugs in the new code:

| what shipped | what it silently broke |
| :--- | :--- |
| formula language | `executeWorkflow`'s condition gate — guarded steps ran unconditionally |
| formula language | Health panel's condition guard — same wrong test, second place |
| formula language | `referencedIds` — every formula reported 5 false "block is gone" problems |
| `goToPage` | Health panel had no list of pages — a wire to a deleted page was invisible |
| wire editing | the popup never reset — a new wire inherited the last one's whole config |
| wire editing | the mapping guess overwrote saved mappings on open |
| `and`/`or` as words | `referencedIds` reported them as blocks that are gone |

**So: after shipping anything, grep for what used to be true.** It has found
something every single time it was tried.

### What only a person could find

Three findings came from the builder or from driving the editor, and **no check
would ever have produced them**:

- the wire sentence read `go to Submissions` — naming the block it was dragged
  to, which `goToPage` ignores entirely
- a wire could only be deleted, never changed — one option on its menu
- pages could not be deleted at all — no such function existed in the database

### Checks that did not check what their name claimed

Six times a check passed while the thing it named was broken. Every one was
exposed by the negative control, never by reading:

- `TYPE_WORDS` left out `'list'` and `'db'` — the exact two words the historical
  bugs used
- a load-time check left Count at 0, so the formula settled on the value it
  already had and the check passed either way
- `openUrl` safety called `safeUrl` directly instead of through the action
- the `chainDepth` guard was unreachable from any check
- `runPageLoadWorkflows`'s filter was tested by `executeWorkflow`'s filter
- a `PageFacts` fixture omitted `pages`, which is why that field is **required**

### Shipped

**Engine**
- repeaters filter by formula over the row's own columns — `{{Price}} * {{Qty}} > 500`
- `and` / `or` as words, not just `&&` and `and(...)` — found by writing a check
  the way a non-coder would, an hour after building the language
- formula language: 30 functions, comparisons, `if`, text — was `+ - * / %` over
  a `default: return 0` that answered **0** to `if(...)` and to `Price > 100`
- conditions can be a whole formula — one field vs one value could not express
  `Qty * Price > 500` however many rows were added
- `onLoad` — the last of the four primitives; had been recorded as done by a
  block that only refreshed itself
- formulas propagate — a Formula block was a dead end in the chain
- `goToPage` / `openUrl` — cut in cycle 8 with a condition; the condition was met
- row actions can act on **every** matching row, not just the first

**Editor**
- a wire can be changed instead of rebuilt from memory
- a page can be deleted, after saying how many rows go with it
- the formula box shows what it equals, or the error, and lists what can be written

**Correctness**
- `.creora` export was lossy for 6 of 17 block types, and import shared rows
  between a page and its own copy
- every column edit threw and skipped the recalculation (`null` store, six sites)
- one click cost one Supabase query per link of the chain
- substring type-matching still alive in the engine — the bug the registry exists
  to kill

### Outstanding, and why

| item | blocked on |
| :--- | :--- |
| **migration 0005** — page delete | needs running in Supabase; the button explains this until then |
| **migration 0004** — per-visitor rows | never run, since 13 Aug |
| webhook URL is public on a published page | needs the Edge Function layer |
| `save_page` is last-write-wins | needs a migration; two tabs overwrite silently |
| no cap on visitor row inserts | needs the server |
| live page shows "Untitled", one column, a button called "Button" | needs the owner's session — old damage, fixes landed but values never repaired |

### Instrument notes

Driving the app from the console needs the app's **own** jotai:

```js
const res = performance.getEntriesByType('resource').map(e => e.name);
const jotai = await import([...new Set(res.filter(n => n.includes('jotai') && n.includes('deps')))][0]);
```

Vite serves optimised deps with `?v=<hash>`. Importing without it loads a second
jotai whose stores are invisible to the engine — half an hour went on believing
the product was broken. **Check the instrument before believing any result.**

And a second, worse one, proven the same day:

```js
const a = await import('/src/state/atoms.ts');
const b = await import('/src/state/atoms');
a.allBlockIdsAtom === b.allBlockIdsAtom   // false
```

**Two specifiers for the same file are two module instances**, each with its own
atoms. A store set through one is invisible to any module that imported the
other, and the symptom is an engine that reads zeros for values just written —
which reads exactly like a broken product.

### The rule this produced

**Do not verify pure logic through the browser.** Node checks import the real
modules once and cannot drift; the browser adds a second module graph, a second
jotai, and HMR generations, and every one of those has produced a false result
today.

Use the browser for what only it can do — the DOM, the editor, real clicks. That
is where it earned its keep: the visible ports, the Health panel rendering, the
action dropdown, and the wire sentence naming the wrong block, which **no check
could ever have found**.

Pure functions are the exception: `visibleRows`, `rowMatchesFormula` and
`referencedIds` need no store, so running them in the page is honest and was how
the row-formula filter was confirmed live.
