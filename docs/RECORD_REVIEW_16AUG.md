# Critical review of the record — 16 August 2026

Both Notion exports read end to end (6,845 lines, ~11 days, two sessions). Every
claim below that could be checked against `D:\A` was checked; the ones that could
not are marked as such. Verified today: `tsc -b` exits 0, `npm run check` was 621
passing on arrival, the repo is clean apart from three files stranded mid-commit
on 15 Aug (now committed).

The work in that record is unusually good — the bugs found were real, the fixes
were tested, and the honesty about being wrong is rare. This document is only the
other half, because that is what was asked for.

---

## 1. Code flaws found today, and fixed

### The `.creora` backup was lossy for six of seventeen block types

`handleExport` mapped node types with a hand-written `else if` chain covering 11
of 17, sitting under `let type: BlockType = 'text'`. **Image, For-each-row, My
Design, Live Data, Page value and Visitor were every one written into the export
file as `type: 'text'`.** `handleImportFile` had a second, separate chain covering
10 and dropped the rest. The `BlockType` union itself had stopped at ten members
while the product grew to seventeen.

This matters more than a normal bug for two reasons. The `.creora` file is the one
thing the record repeatedly promises is *the builder's own* — "free forever",
"that's their data, not your code", "the thing that would have saved you in July."
And the two most distinctive block types in the whole product — My Design and For
each row, the ones holding the builder's own HTML — were among the six.

### An imported copy shared the original's rows

`handleImportFile` kept block ids exactly as it found them. Rows are keyed by
block id and by nothing else:

```
list_database_rows(p_block_id)   scoped by block id alone
add_database_row(...)            resolves the owning page with
                                 `where blocks->'runtimeStates' ? p_block_id
                                  limit 1`  — no ordering, no tiebreak
```

So exporting a page and importing it as a template — the obvious reason to have
export and import at all — gave two pages the same block ids and therefore the
same rows. Reads bled both ways, and a submission on either page landed on
whichever one Postgres happened to return first.

Fixed by remapping ids when the file's page id differs from the page being
imported into, and keeping them when it matches — because restoring a backup over
its own page is the opposite case, where the ids *are* the link to rows already on
the server. The editor now says which of the two just happened, since the
difference is invisible and decides whether the page is empty or showing somebody
else's data.

### The guard against exactly this could not see it

`scripts/checks.ts` has a check named *"nobody has hand-written the block list
again"*, written after nine `||` chains cost three block types their persistence.
It matches `===  'XBlock' || ... === 'YBlock'`. The export and import chains were
`else if`, so the guard was blind to the two largest hand-written block lists in
the codebase — and they were in the backup path.

Widening the regex to `else if` was tried and reverted: it immediately flagged
`PublishedRenderer.tsx` and `renderBlockStyles.ts`, which branch per block type
because rendering genuinely must. The structural fix carries it instead —
`Record<BlockNodeType, string>` will not compile if a block type has no name in
the file — plus two named checks that the exporter and importer still call it.

**49 new checks (670 total), `tsc -b` clean, three negative controls.** Committed
as `083de14`.

---

## 2. Code flaws found today, and NOT fixed

These need decisions, or a server, or both. Listed worst first.

### A published page hands every visitor the builder's webhook URL

`get_page` returns `workflows` whole, and `PublishedRenderer` puts it straight
into the store — it has to, the engine runs in the browser. `webhookUrl` lives on
a `WorkflowStep`. So **any visitor to any published Creora page can read the
builder's Zapier / Make / n8n address out of the network response.**

A webhook URL is a bearer credential. Anyone holding it can post arbitrary
payloads into that automation — which may write to the builder's Google Sheet,
send mail as them, or create CRM records. The record discusses this risk only as a
*team-permissions* problem ("this developer must not see our webhook address"),
never as a public one, and it shipped as the flagship "data out" feature.

There is no cheap fix. The honest short-term move is to say so in the editor next
to the URL field, and to treat "webhooks on published pages" as blocked on the
Edge Function layer rather than as done.

### `save_page` is last-write-wins, with autosave on a 500ms debounce

The RPC does `update pages set blocks = ..., workflows = ... where id = ...`.
`updated_at` is written and never compared. Two tabs, or a laptop and a phone,
open on the same page and **the whole page silently overwrites the whole page.**

This is the same failure shape as the page-name bug found on 13 Aug (whole-blob
replace, one save path missing a field) — that one was fixed at the field level,
but the underlying model was not revisited. An `expected_updated_at` argument and
a conflict error would cost one migration and one branch in the save path.

### Nothing limits what a visitor can insert

`add_database_row` is open to anon on any published page by design — visitors may
submit, and that is the product. But there is no rate limit, no cap on rows per
block, and no size limit on `p_row_data`; the row id is client-supplied. The whole
free-tier strategy in `docs/BACKLOG.md` — "don't cap accounts, cap the expensive
things" — rests on caps that do not exist anywhere in the database. Right now one
loop against the live Feedback page fills the 500MB.

### Migration 0004 has never been run

`src/lib/collections.ts` ships calling `get_collection_private` and
`set_collection_private`, which do not exist in production. The error handling is
genuinely good — PGRST202 becomes a plain-English instruction — so it fails
gracefully. But per-visitor rows are described as built, and they are not live.
This has been outstanding since 13 Aug.

### Smaller

- **Three commits are unpushed** (all written today) as of `origin/master` last
  fetched 15 Aug 16:00 UTC. I first wrote "twelve" here from memory of the
  transcripts and had to correct it after running `git rev-list --left-right
  --count` — the exact assert-vs-verify mistake this document criticises
  elsewhere, made while writing the criticism.
- What is actually *deployed* I could not check: it needs the live bundle, and
  no browser was connected this session. The last confirmed deploy in the record
  is 14 Aug, after `a71bb2b`. Everything from `bb59ce0` onward — the Health
  panel, the wiring fixes, the canvas zoom, the port visibility, and today's
  work — is unconfirmed on the live site.
- `package.json` still says `"name": "a"`.
- `_to_delete/` holds 34 files.
- `docs/NEXT_BUILD.md` is stale — it describes work finished on 11 Aug.

---

## 3. Flaws in the record itself

### "Send the link to five people" was said eight times and never once acted on

From 11 Aug onward it closes almost every summary. On 13 Aug you gave a reason —
that going public early invites the idea being taken. That reason was recorded and
then the same advice was repeated three more times unchanged.

A recommendation made eight times with zero uptake is a failed recommendation, and
repeating it is not follow-through. The useful move was either to argue with the
fear directly, or to design around it: five people you already trust, a private
link, sitting beside one person while they try it. That last one is worth more
than all five anyway — what you learn is *where they stop*, and you only see that
by watching.

Worth being precise about the fear, too. Ideas of this shape are not scarce; the
record itself names AppGyver, WeWeb, Bolt, Lovable, Stitch and Twenty. What is
scarce is a working reactive runtime with enforced ownership built by one person
in seven weeks. Nobody can take that by looking at a form.

### "Verified" meant at least five different things

Across the record it meant: `tsc --noEmit` passes (which for two days compiled
zero files); a check in `scripts/checks.ts` passes; a JS probe in a hidden tab; an
iframe forced to 390px; and a real click in a foreground browser. Only the last
one found the page-name erasure, the form values leaking to visitors, and the
one-link chain limit.

The record does name this once — *"three of the last four bugs came from you or a
browser, not the checks"* — but the vocabulary never changed, so every subsequent
summary still reads "verified" and the reader cannot tell which kind.

**The concrete fix is one word.** Say *checked* for anything proved in
`scripts/checks.ts`, and reserve *verified* for something exercised on the
deployed site. They are different claims and the difference is where six cycles of
debt accumulated.

### The check suite is written by the author of the code it checks

Acknowledged once, never structurally addressed, and the consequence is on the
record: 506 checks did not notice that **no two-step chain had ever worked** — not
because the logic was subtle, but because every engine check asserted the state of
the block a step *targets*, and nobody wrote one that wired a second workflow to
that block. A missing link is exactly what the author is not thinking about.

Negative controls are a real improvement and they earned their keep again today.
But they prove a check *can* fail; they cannot tell you which checks were never
written. The only thing that does that is someone else using the product.

### Counting moved to the metric that nobody outside the project can feel

Checks went 78 → 621 in twelve cycles. Deployments to production over the same
span: about three. Every cycle report leads with the check count. It is the number
that grew most reliably and the number that means least to a visitor.

### Documents multiplied faster than they were reconciled

There are now eleven files in `docs/`, plus `PROJECT_STATE.md`, `CLAUDE.md` and
`README.md`. `CAPABILITIES.md` went stale within eight days and had to be
regenerated from the code. `NEXT_BUILD.md` is stale now. The queue silently lost an
item to a renumbering script and nobody noticed for three cycles.

The problem this was answering — decisions evaporating — was real and the answer
was right in principle. But an artifact that needs maintenance is a liability once
there are eleven of them, and prose is the one thing in this repo that nothing
checks.

### "No drawing tools. Ever." was reversed without being marked as reversed

11 Aug, in `DIRECTION.md`, described as the file recording what Creora *refuses*
to build: *"No pixel dragging, no arbitrary colours, no font pickers. Modern
output comes from constraint, not freedom."* By 12 Aug: arbitrary CSS on every
block, then arbitrary HTML, then arbitrary HTML repeated per row.

The reconciliation offered — *"Creora decides nothing on the builder's behalf that
cannot be undone"* — is a good principle and probably the right one. But it was
reached by yielding to each request in turn, and a constraints document that
yields to each request is not a constraints document. If the real position is
"opinionated defaults, no ceilings", that is worth stating as a reversal with a
date, so the next session does not read the old sentence and believe it.

### The strongest usability signal in the whole record was under-weighted

On 14 Aug: *"when I type something it doesn't update... it's so damn hard figuring
out and finding no way to do it and nothing works either way."* That is the person
who **built the product** unable to wire a form to a table.

It was fixed well — pre-filled column mappings, a popup that fits on screen, a
disabled Connect button that says why. But it did not change the plan. The next
cycles went on to aggregates, custom CSS, and the Visitor primitive, with the
visual and arrangement work still deferred behind the layout model. If the builder
cannot wire a form, the capability list is not the constraint.

### The renderer split is the most productive bug generator in the codebase, and the decision to defer it was never revisited

Measured at ~500 duplicated lines on 11 Aug and deferred as "smaller than I
claimed". Since then: published tables showing owner controls, the count not
firing, form values leaking to visitors, the XSS from sanitise-before-fill, the
editor showing `Name/Age` while disk said `Name/Message`. **Every one of those is a
divergence between the editor and the published renderer.** That is five bugs from
one deferred decision, and `PublishedRenderer.tsx` has grown considerably since
the measurement that justified deferring it.

### The estimate was built from the parts most likely to be wrong

"~10–20 sessions, two to four months" is composed mostly of the layout model at
"4–8 sessions" — which the same message calls *"the thing most likely to take
twice its estimate"* — and then totals it as if it would not. It is also a
schedule for finishing everything, immediately after arguing that finishing
everything is the wrong plan.

---

## 4. What I would do next

In this order, and the first two are not building.

1. **Push and deploy.** Three commits are unpushed, and everything since
   `bb59ce0` is unconfirmed on the live site. Nothing else on this list is worth
   doing first.
2. **Watch one person use it.** Not five, not publicly — one, next to you, on any
   device. Do not help them. Write down where they stop. That is the only input
   that can tell you which of the 670 checks were never written.
3. **Say the webhook URL is public**, in the editor, next to the field. Cheap,
   honest, and it stops the feature being trusted with something it cannot hold.
4. **Add `expected_updated_at` to `save_page`.** One migration, one branch. It
   ends the whole class of silent whole-page overwrite.
5. **Run migration 0004** and follow the five verification steps, or delete the
   client code that calls it. Shipped code calling absent RPCs is the worst of
   both.
6. **Then the layout model** — and merge the two renderers while you are in there,
   because that is the one piece of work that stops five bugs recurring rather
   than fixing five bugs.
