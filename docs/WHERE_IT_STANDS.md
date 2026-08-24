# Where Creora stands — 24 August 2026

**2,129 checks passing, `tsc` clean, working tree clean, 98 negative controls
all behaving. Six commits, unpushed.**

> **24 Aug, and worth reading before the rest.** `tsc` was NOT clean when this
> session opened — three errors sitting in committed code, because the session
> that shipped the Query panel ended before it ran one. `npm run check` was
> green throughout. **A green suite is not a green tree**; step 1 of the cycle
> is both, every time.

```
npm run check      2,129 assertions, the real modules, no mocks
npm run control    break the code on purpose, watch the right check go red
```

---

## The two things only you can do

### 1. `git push`

Seven commits are sitting here. Pushing from my side dies with
`HTTP 403 from proxy after CONNECT`, every time.

### 2. Run the migrations — Supabase → SQL Editor → paste → Run

**Six of the nine migrations have never touched your database.** This is now by
far the largest gap between what the code can do and what somebody visiting your
site would actually meet. `supabase/RUN_ALL_MIGRATIONS.sql` is all of them in one
paste, in order, safe to run more than once.

| file | what stays broken until you run it |
| :--- | :--- |
| `0009_row_shape.sql` | a form can write any shape of row it likes |
| `0008_unique_columns.sql` | **a slot can be booked twice** |
| `0007_row_limits.sql` | **anyone can fill your database from a published form** |
| `0006_save_without_overwriting.sql` | **two tabs silently overwrite each other** |
| `0005_delete_page.sql` | the × on a page tab explains itself instead of deleting |
| `0004_row_ownership.sql` | no "my cart", no "my orders", and hiding is not withholding |

If you only run two: **0006** is the only one that destroys work you have already
done, and **0007** is the only one that can cost you money.

---

## What the engine can do

Seventeen block types, twenty workflow actions, forty-seven functions in the
formula language. The parts that matter for what somebody can actually build:

**Tables can see each other.** A row can ask a question about another table
while standing in the row it is rendering, which is what a relation is:

```
who teaches it   {{calc: joinOf("Instructors", "Name", '{{Row id}} == InstructorId')}}
places left      {{calc: Capacity - countOf("Bookings", '{{ClassId}} == RowId')}}
star rating      {{calc: avgOf("Reviews", "Rating", '{{ClassId}} == RowId')}}
```

**A list can be filtered and ordered by something worked out**, not only by a
column — "hide the full ones", "best rated first".

**A step can act on the oldest matching row**, which is a waiting list.

**Something can be shown by role** — who counts as staff is a row in a table you
control, not a concept baked into the engine.

**A card can colour itself** from any value, including one counted from another
table.

**Dates are answerable and storable.** `daysUntil(Due)`, `dateAdd(today, 7)`,
`today` as a word, a real date column with a picker, form rules for "must be in
the future".

**Failures are visible.** A submission that cannot be stored takes the row back
off the page and says why — on the published page, to the only person who can
try again.

---

## What it cannot do, honestly

**Hiding is not withholding.** Every row a Database block loads is downloaded
into the visitor's browser before any workflow runs. Hiding the block changes
what is drawn and nothing else. The Health panel says so on any published page
that hides by who is looking. Actually keeping a row from somebody is migration
0004, and 0004 has never been run.

**A published page's webhook and Live Data addresses are as public as the page**
— the browser is what calls them, so they travel to it. The Health panel reports
both. Fixing it properly needs a server layer this project does not have.

**One person cannot yet be stopped from booking twice** — that is uniqueness
across two columns together, which extends 0008. 0008 has not been run either.

**I cannot run `npm run build`.** `node_modules` holds the bundler's Windows
binary, so it dies with a bare `Segmentation fault` from my side. Builds happen
on your machine. My ceiling is typecheck plus the checks.

---

## How this was worked out, and why it is worth knowing

Instead of listing features, I **built a working booking site** — browse, filter,
search, detail pages, booking, waitlists, cancellation, an owner's dashboard —
ran it, then translated it into Creora feature by feature.

Fifteen behaviours. **Three of them worked.** Nine of the remaining twelve turned
out to be one missing sentence wearing different clothes, and none of the fifteen
wanted a new block type.

> **The engine did not need more nodes. It needed the ones it had to be able to
> see each other.**

All fifteen are expressible now except the two that need the database.
`docs/BUILT_ONE_TO_FIND_OUT.md` has the full working.

---

## The six primitives, 24 August

`docs/CONNECTING_THE_TWO.md` derived these from 40 ways a page can talk to a
store — Creora could say 13, half-say 9, and could not say 18. Four are in.

| | | |
| :--- | :--- | :--- |
| **D** | three outputs, not one | shipped 23 Aug |
| **C** | rules, compiled to a policy | shipped 23 Aug — **migration never run** |
| **A** | named questions over tables | shipped 23–24 Aug, panel and all |
| **B** | actions | shipped 24 Aug — engine, compiler, panel, **and the call** |
| **E** | when this changes | not built. Supabase realtime, free tier |
| **F** | every day at… | the only one with no free answer yet |

The design doc put B third with the note *"needs a server, which is the real
cost"*. That was wrong, and the correction is the useful part: a Postgres
function on the free tier **is** somewhere to put trusted code. One of the six
needs a server that does not exist, not two.

**What B changes, in one line.** Every other workflow action happens in the
browser, so the page decides the price. `runAction` calls a compiled function:
it reads what it needs from the tables inside the transaction, a visitor can
change what they typed and nothing else, and if it refuses halfway nothing it
did stays.

## What is next

1. **Run the migrations.** Still the largest gap between what the code can do
   and what a visitor would meet — and Primitive C and every Action now sit
   behind it too. An action that has not been migrated says so in plain words
   rather than failing silently, but it does nothing.
2. **Ranks 3 and 5** — per-visitor rows and two-column uniqueness. Both written,
   neither run.
3. **Primitive E** — Supabase realtime, free tier, and the last one that needs
   no new money.
4. **Build a second site the same way** — a shop, a class register, a
   repair-tracker. The method found seven real gaps in one afternoon that six
   days of auditing had missed.
5. **Then the layout and the interface**, which is where you said this goes last.

## Unproven, and it should be said plainly

Nothing from 24 Aug has been **clicked**. The browser extension was not
connected, so the Actions panel's markup, the step popup's new boxes and a
refusal appearing under a real button have never been seen in a running page.
Everything below the markup is driven through `executeWorkflow` in node, which
is the strongest thing available without a browser and is not the same thing.

---

## Housekeeping

`git` in that working copy cannot delete its own lock files from my side, so you
will find stray `.git/*.stale-*` files and a `_to_delete/` folder with three
scratch scripts in it. All safe to delete.
