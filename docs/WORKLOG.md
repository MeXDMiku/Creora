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

## 19 August 2026 — built a site to find out what was missing

**1,792 checks, from 1,706. `tsc` clean. 20 negative controls, every one caught
by the check that names it.** Six commits, unpushed.

The method this time was different and it is worth keeping. Instead of walking a
site in my head and writing down where it stops — which is what
`docs/CAPABILITIES.md` did — I **built a working pottery-studio booking site**
from scratch, ran it, and then translated it feature by feature into Creora.

The two methods disagree usefully. The audit said a blog and a directory were
possible; they are. What it could not see is that **almost every interesting
thing on a real site needed one primitive that did not exist, in five different
disguises.** Fifteen behaviours, three of which worked. Details in
`docs/BUILT_ONE_TO_FIND_OUT.md`.

### Shipped

**A row can ask about another table** — the missing primitive, and nine of the
twelve broken behaviours were this one sentence wearing different clothes: a
formula could not refer to the row it was standing in while asking about another
table. The fix is one line — the condition gets the calling scope underneath —
and it bought places-left, who-teaches-it, average-rating, is-it-full,
how-many-waiting and what-one-booking-is-worth at once.

**A list can be filtered and ordered by something worked out** — "hide full" and
"best rated first" are neither of them columns; one is a count of rows in another
table and the other an average of them. No dropdown could ever have contained
them.

**A step can act on the oldest row that matches** — the waiting-list promotion.
Two conditions at once, and a spelling for "the oldest", which rests on the
server returning rows `order by created_at asc` and is now checked against the
SQL rather than assumed.

**Show something by role** — and the Health panel says plainly that hiding is not
withholding, because from the outside it looks exactly like it worked.

**Style driven by a value** — already worked, and nothing said so.

### What it broke elsewhere

**A slot inside a quoted condition was being rewritten by the outer scan.**
`{{Capacity}} - countOf("Bookings", '{{ClassId}} == RowId')` has two kinds of
slot in it: the card's, and the other table's. The scan rewrote both, so the
condition compared nothing to something and **kept every row** — no error, list
unchanged, the filter apparently ignored. This is the bug the whole feature
turned on, and every check written before it passed.

**The invented name a slot is rewritten to was a constant.** A caller value of
that name became `X == X` and matched everything. Found by asking what would
make a check fail rather than whether it passed — and the same rewrite existed
twice, five hundred lines apart, so it was fixed twice until the two were merged.

**A row's id was spelled `Row id`, with a space,** and could not be typed in an
expression at all. The relation would have looked perfect in every check here and
said "Referenced block RowId does not exist" on a real page.

**A filter formula's error was computed and dropped on the floor.** Nothing
displayed it, so a broken filter kept every row and said nothing. Shipped and
unreachable — the exact shape the checks exist to catch.

**`formulaScope` answered only to block ids.** Typing the name printed on a block
into a condition got "Referenced block X does not exist" about a block plainly
sitting on the page, while the same name in markup three inches away worked.

### The instrument lied, twice

The control harness decided a run had finished by asking whether the output
contained `'passed,'` — which is also in the **name of a check**. A suite that
crashed read as *finished, zero failed*. Two controls had been cleared by that
green: one was hiding a crash, the other a check that could not fail.

Then, after being rebuilt, it printed `SUITE STOPPED EARLY` only on the branch
where the control passed — so a control that crashed the suite reported "went
red, but not where it should" with no reds under it, which reads as a decorative
check. Same mistake in a new costume.

The rule from doing it twice is not about substrings. It is: **whatever explains
an outcome has to be printed on every path that can produce that outcome,
including the boring ones.** `npm run control` is a file now rather than
something I did by hand, so the lesson is in the repository instead of my head.

**And the suite counts itself.** Two runs an hour apart reported 1737 and 1736
with nothing red either time — one check had silently not run. Several groups
build their checks by looping over what is on disk, and this is a network mount.
A suite that quietly shrinks is the worst failure available, because the summary
line still says the reassuring thing.

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

### Dates — and shipping functions for data the product could not store

1,316 checks, from 1,239.

`daysUntil`, `daysSince`, `daysBetween`, `dateAdd`, `isBefore`, `isAfter`,
`isSameDay`, `year`, `month`, `day`, `weekday`, plus `today` and `now` as words.
A date could be **shown** and shifted for showing, and that was the whole of it
— nothing could ask a question about one. "Three days left", "overdue",
"bookings this month": every one unsayable, on a product whose two worked
examples are a booking form and a task list.

**Then the sweep found the real hole: there was no date column.** A booking's
date was TEXT, so it sorted alphabetically and every formula reading it depended
on whoever typed it choosing a shape the parser happened to understand. So:
a `date` column type, storing ISO, with a real picker.

Choices, each one where the wrong answer is worse than the gap:

- **whole days from midnight** — counting in 24-hour steps from `now` answers 2
  in the afternoon and 3 in the morning to the same question
- **month is 1–12, Monday is 1** — a formula is read by a person
- **`dateAdd` hands back text** — a formula's answer gets stored, compared,
  saved and formatted, and a Date survives none of that
- **ISO, not a Date object** — and it sorts chronologically as plain text, so a
  date column sorts right with no special case anywhere
- **unreadable becomes empty, never today** — a booking silently dated now is
  worse than one left blank

### The fourth and sixth repeats

**Fourth:** the Health panel scans formulas for identifiers and reports the ones
that are not blocks, so every new *word* looks like a deleted block — `and` and
`or` last cycle, `today` and `now` this one. Every date formula would have
arrived with a false "block is gone". The note now lives at that list, not in
this file, because that is where the fifth word gets added.

**Sixth renderer drift:** the published table decided for itself how to show a
cell and knew only about booleans, so a date column showed a visitor
`2026-08-17T00:00:00.000Z`. Both renderers now call one function, and the type
list is one `Record` so a seventh type cannot be added without every place that
needs an opinion getting one.

### A check that could not fail in this runner — and then could

The runner's clock is **UTC**, so local time and UTC are the same number and a
timezone bug is invisible. A control swapped the date-picker reader to
`toISOString().slice(0, 10)` — which loses a day for everyone east of Greenwich,
this project's author included — and **broke nothing**.

First attempt was a source check: match the shape of the code instead of its
behaviour. That was no better. Shape-matching text survives the break that
matters, and the same control went green again.

**Second thing depending on local-vs-UTC arrived within the hour** — a visitor's
form date and a table cell were storing the same day as two different instants —
so the instrument got fixed instead. `scripts/tz-probe.ts` runs in a **separate
process with `TZ=Asia/Kolkata`** (+05:30, so a half-hour offset catches
whole-hour assumptions too) and the suite compares what comes back. The control
that had been green three times now turns four checks red, including two at year
boundaries, where losing a day loses a year.

**A check that cannot fail is not a check.** Source-shape checks are reassurance;
a different process with a different clock is evidence.

**Running total: nine green controls.** Roughly half were real gaps; the rest
were the control aimed at the wrong line, or the check overclaiming. Both are
worth finding, and neither shows up by reading.

### Rows that were never saved, and the message nobody could see

1,395 checks, from 1,316. Migration **0007** written (unrun): a published form
could be filled by a script until the Supabase project stopped working, and the
bill would land on somebody who did nothing but publish a contact form.

**But the app had to stop lying first.** `addRow` put the row on the page and
fired the insert into the background, logging a warning if it failed. A visitor
pressed Submit, watched their row appear, and nothing had been stored.

**Counting instead of naming found six of these, not one:**

| where | what was silent |
| :--- | :--- |
| engine `addRow` | row stayed on the page, unsaved |
| engine `deleteRow` | row stayed *gone*, still in the database, back on next reload |
| engine `updateRow` | its read failing meant the update **never reached the server at all** |
| editor cell edit | typed value not stored |
| editor add row | same as the engine's |
| editor delete row | same as the engine's |

A `console.warn` is not telling somebody. It is telling nobody.

### And then: the message nothing displayed

Every one of those branches set `error` on the block, **and no renderer read
it.** The shipped-and-unreachable failure this file checks for everywhere else,
committed by the same hand that was checking for it, in the same hour.

It was not found by re-reading the diff. It was found by asking *does anything
read this field?* — a different question from *is this code correct?*, and the
only one that would have caught it.

Both renderers show it now, because on a published page the **visitor** is the
one whose submission was refused and the only one who can try again.

### A fourth copy of the column coercion

Three copies of number/boolean/else-string in the engine, none of which learned
about `date` when the shared function did — so a workflow writing a date stored
loose text while a table cell stored ISO. Same column, two shapes, sorting and
`daysUntil` both wrong on half the rows. All three call `coerceForColumn` now,
and the check **counts** them.

### The hollow check, three times

`includes(...)` against source is green whenever *any* occurrence survives. Each
of these paths has two failure branches — the rejected call and the thrown one —
and removing one left the other matching. Three separate checks were written
this way before the pattern was named.

**Counted, not matched.** And where a source check is all that is possible — the
engine imports `supabase` directly, so there is no seam to hand it a failing
client — the check says so in its own name.

**Running total: fifteen green controls.** About half were real gaps; the rest
were the control aimed at the wrong line, the check overclaiming, or the check
being hollow. None of the three shows up by reading.

### The drift, finally measured

1,467 checks, from 1,395.

Nine separate bugs in this project have been **the same bug**: a decision made
in two places that stopped agreeing. Three more turned up in one sweep:

| what was written twice | what it cost |
| :--- | :--- |
| the **List block's rows** | both copies showed a date as `2026-08-19T18:30:00.000Z` and a boolean as `true` |
| the **history chart's geometry** | forty lines of arithmetic, unchecked in both |
| the **timer's whole behaviour** | the only block that acts on its own — a workflow could fire on a published page and not while building it |

The chart's maths carried three decisions that look like details and are not:
zero is always in range (a chart of 100, 101, 102 otherwise draws as a cliff and
reads as a tripling); a bar is never thinner than 2px, so a zero is a line rather
than nothing; negatives hang below the baseline instead of being flipped up.

**Then the leverage move.** Finding the tenth by hand is not a plan.
`scripts/rendererDrift.ts` counts how much of the editor is written out a second
time, and the checks hold it to a **budget of 131 lines across 11 runs** — all
of it presentation now. It may shrink; it may not grow without somebody deciding
it should, and changing the number is that decision, made where a diff shows it.
The figure prints on every run, because a budget nobody can see the shape of
creeps up one line at a time.

### The component that could not be checked

`ListRowsView` was shared between both renderers — and then three controls showed
the checks around it were nearly worthless. Node's type-stripping cannot read
`.tsx`, so a component cannot be imported by this suite at all, and breaking its
rendering left every behavioural check green: they were all calling `displayCell`
directly rather than going through anything the component used.

So the **decisions** moved out to `rows.ts` where they can be run, and the
component draws what they return and decides nothing. The same four controls now
turn thirteen checks red.

The same reasoning shaped `useTimer`: the hook is shared, but the second-by-second
decision is a pure function beside it, because a hook cannot be run here either.

### Three more checks that were wrong on the way in

None of them found by reading:

- one scanned the whole published renderer for `setInterval` and went red on the
  **data source** block's refresh — correct code, nothing to do with timers. A
  check that reads too widely costs the same trust as one that misses.
- "lands on zero" used `countdown(1)`, where `1 - 1` is 0 whether or not
  anything clamps it. The discriminating case is a timer already at zero.
- one used the instant a +05:30 picker actually stores, in the runner whose
  clock is UTC. That half moved to `tz-probe.ts`, which is what it is for.

**Running total: twenty green controls.** The proportion has not changed: about
half real gaps, half checks that were hollow, overclaiming, or aimed at the
wrong line.

### The audit was pointing at finished work

1,495 checks.

`CAPABILITIES.md` was written on 13 Aug. By 19 Aug it named three things as
missing that had all shipped — page parameters (its rank 1, and the whole of its
Part 3), more input types, a date picker. **For six days the project's own
planning document pointed at work that was already done**, which is precisely
what its own opening paragraph warns about.

Third audit written, and this time the counts are **asserted against the code**.
Adding a block type or an action without updating the file turns the checks red.
Only the counts — whether "a blog is possible now" is a judgement about walking a
real site, and Part 5 says in its own words that nothing holds that up.

It earned itself within the hour: adding migration 0008 without updating the file
turned it red.

### What the walk found: two people could book the same slot

Booking gained dates, a picker and "must be in the future" — and **nothing
anywhere enforced that a value is used once.** Not a column, not a condition, not
the database. A slot could be booked twice and the page showed both as
successful, because both were.

A workflow cannot answer this. It can only check the rows the visitor's *browser*
happens to hold — the wrong question asked of the wrong copy.

Migration 0008: a column marked *used once*, enforced on insert and on update.

**The lock is the whole difference between a rule and a hope.** Check-then-insert
is not a guarantee: two transactions can both look, both find nothing, and both
insert — the exact failure, merely made rarer and harder to reproduce. A
guarantee that holds only when nobody is racing is not one, and shipping it as
though it were would be worse than shipping nothing, because somebody would rely
on it.

### Three more drifts, and then the budget

The **List block's rows** were duplicated character for character in both
renderers — and both copies showed a date as `2026-08-19T18:30:00.000Z`. The
**history chart's geometry** was forty lines of arithmetic in two places,
unchecked in both. The **timer's whole behaviour** existed twice, and it is the
only block that acts on its own: a workflow could fire on a published page and
not while building it.

Then the leverage move. `scripts/rendererDrift.ts` counts how much of the editor
is written out a second time, and the checks hold it to a **budget of 131 lines**
— all presentation now. It prints on every run, may shrink, and cannot grow
without somebody changing the number where a diff shows it.

### And one I introduced, an hour later

The shared timer hook read its state once instead of subscribing. It **worked** —
because both callers happened to subscribe to the same atom for their styling, so
the component re-rendered and the hook re-read on the way past. A trap, not a
bug: it would have stopped working for whoever used the hook next, and the timer
would simply never notice it had been started.

Extracting shared behaviour is supposed to make the next caller safe. That
version made the next caller the one who finds out.

### Staying free, which turned out to be unmeasured

1,561 checks. The builder said plainly that the bill has to be zero. Nothing in
the code was measuring that, and four things were quietly spending it.

**The page blob is written whole, 500ms after every keystroke.** So its size is
not a storage question — it is **bandwidth × how fast you type**. Two things made
pages big and both were invisible:

- **collected rows were saved into the page.** They live in `database_rows`,
  which is where every renderer reads them from. A table with 500 rows was
  stored twice and re-uploaded on every keystroke. Now stripped before writing.
- **an inlined photo.** `data:image/png;base64,...` is a real URL and the Image
  block accepts one. The backlog has called this "the single biggest storage
  risk in the product" since 11 Aug and nothing guarded it. Now: over 512 KB the
  editor names the block and why, over 2 MB it refuses.

**A page left open re-read every row every four seconds.** `list_database_rows`
returns everything, so a thousand-row table is half a megabyte per poll —
roughly **37 MB for one visitor sitting there five minutes**, against 5 GB a
month. It now slows to sixty seconds when three answers in a row come back the
same, and snaps back the instant anything changes. **It slows; it does not
stop** — a table that quietly gave up is worse than a slow one.

**The row cap was a number chosen before anyone checked the allowance.** 0007
said 50,000 per page, which at 2 KB a row is 100 MB — a fifth of the entire free
database from one abused page. The free database is 500 MB. It is 10,000 now,
with the arithmetic written next to the constant, because a number with no
reasoning attached gets raised by whoever hits it first.

### Two rules that came out of it

**Limits belong outside the product.** The Health panel now shows what a page
costs — weight, rows, pages, any picture pasted in rather than linked, naming
the block. It deliberately prints **no free-tier figure**, and a check fails if
one is ever typed in: a number in a product goes stale silently and then lies
with confidence, which is exactly what the capability audit did for six days.
`docs/STAYING_FREE.md` holds them instead, dated and sourced.

**Anything that grows without a ceiling needs one before it ships**, not after
somebody notices the project paused. Every item above was found by asking *what
grows, and who decides how much?* — not by watching a number go up, because by
then a week of egress is gone.

### And a check that could not fail

It counted quiet polling rounds in terms of `POLL_PATIENCE`, so lowering the
constant changed the check along with the code and it stayed green. **A check
written in terms of the thing it checks is not a check.** Literals now, and a
control in each direction.

### Removing the friction instead of adding to the queue

1,637 checks.

Five migrations had sat unrun for days — the row-ownership one since 13 August.
Each fixes something silently broken until it is applied. **The work was done and
the friction was the whole obstacle**: five pastes is not five times the effort of
one, it is five times the chance of stopping after the first.

`supabase/RUN_ALL_MIGRATIONS.sql` is all eight, generated, in order. The header
promises it is safe to run whole — and that promise is now *checked*, not
claimed: no table or index without `if not exists`, every trigger dropped before
it is created, functions created `or replace`, nothing inserted at the top level.
The next migration somebody writes is the one that would break the promise,
silently, because the failure is a duplicate-object error halfway through a paste
that has already applied half of itself.

I also considered closing the webhook leak with `pg_net` and stopped: I could not
confirm it is on the free plan, and a sixth migration needing a *dashboard toggle*
makes the queue worse, not better.

### Walking the journey the audit stakes two site types on

"A blog is possible now. A directory is possible now." Both moved on one sentence
— a page can be opened *with* a row — and every piece was checked on its own
while **the journey was checked nowhere**. Four correct functions in a row can
still fail to be a road.

It works. Walking it pinned down that an ampersand in a title does not become a
second parameter, that an id containing `/ ? #` survives the round trip, that
arriving with no row does not show the preview row to *everybody*, and that a
bare link shows the list rather than a wrong row — hiding everything would read
as "this post was deleted".

### The one security hole, said out loud

`get_page` returns workflows whole, and it has to: the browser fires the wire, so
the address must reach the browser. No client-side arrangement closes it.

**So the Health panel names it instead** — the block, and a truncated address,
because printing the whole thing puts the token on screen for whoever is standing
behind them. A warning rather than broken: it works exactly as intended, and what
is wrong is what it costs.

### Two of my own mistakes this stretch

**I wrote fifty-one checks that already existed.** Forty lines from the top of
the file, covering all three directions *and* TipTap registration, which mine did
not. Removed. Past sixteen hundred checks, reading the file is not how you find
out — grep for the claim first. A control told me, by naming an existing check I
had not written.

**A control that renames an export proves nothing.** It breaks compilation, so
the suite never runs and reports zero failures. A control has to change
*behaviour*.

And an instrument note: this working copy is a network mount, and a control can
start the check subprocess **before its write has landed** — reporting zero
failures against the unmodified file. It happened once in a batch of five. A
green control now has a fourth possible explanation, and it is the boring one.

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
