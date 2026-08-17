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
