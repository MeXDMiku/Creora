# Migration 0008 — two people cannot take the same slot

**Not run yet.** Until it is, the *used once* checkbox records an intention and
nothing enforces it.

## Why it is needed

Nothing anywhere enforced that a value is used once — not a column, not a
condition, not the database. A booking form could be filled in twice for the
same time, a ticket sold twice, a username claimed twice, and **the page showed
both as successful, because both were.**

A workflow cannot answer this. It can only check the rows the visitor's *browser*
happens to have loaded, which is the wrong question asked of the wrong copy: two
people pressing Submit in the same second both see a free slot and both get it.
Same shape as the save race that 0006 fixed, one layer up.

## What it does

A column marked **used once** in the Database panel. Before any row is written —
insert or update — a trigger checks whether that value already exists in that
column of that block, and refuses if it does.

**Blank never collides.** Two rows that have not filled the field in are not the
same booking, and refusing the second would make an optional field impossible to
leave empty twice.

## The lock, which is the whole difference between a rule and a hope

"Check whether it exists, then insert" is **not a guarantee**. Two transactions
can both look, both find nothing, and both insert — the exact failure this
exists to stop, merely made rarer and harder to reproduce. A guarantee that only
holds when nobody is racing is not one, and shipping it as though it were would
be worse than shipping nothing, because somebody would rely on it.

So the check takes a transaction-scoped advisory lock keyed on the block, the
column and the value. Two visitors submitting the same slot at the same instant
queue behind one another and the second loses. Every write goes through the
trigger, so there is no path around it.

A unique index would be stronger and is not available: it would have to name the
column, and the column is chosen per block inside a JSON document.

## What it deliberately does not do

**No back-fill.** Turning the checkbox on for a column that already holds
duplicates deletes nothing. The builder decides what to do about the rows they
already have; new writes are refused from now on.

## Steps

1. Supabase → **SQL Editor** → **+ New**
2. Paste all of `supabase/migrations/0008_unique_columns.sql`
3. **Run**. It is wrapped in a transaction, so it either all works or none of it does.
4. Reload the editor.

Order does not matter against the other migrations.

## Verifying it

1. On a page with a Database block, tick **Used once** on a column — say `Slot`.
2. Add a row with `Slot` = `10am`. It should save.
3. Add another row with `Slot` = `10am`. It should be **refused**, the row should
   come off the table rather than sitting there looking saved, and the message
   should name the column: *"That Slot is already taken."*
4. Add a row leaving `Slot` empty, twice. **Both should save** — blank is not a claim.
5. Change an existing row's `Slot` to one another row already holds. Refused too.

**Before running the migration**, step 3 saves happily and you have two bookings
for 10am. That is the bug.
