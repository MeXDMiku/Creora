# Migration 0007 — a published form cannot fill the database on its own

**Not run yet.** Until it is, a published page's form inserts a row for anyone
who submits it, with no limit of any kind.

## Why it is needed

One script pointed at a live page writes rows until the Supabase project stops
working. The bill and the outage both land on the builder, who did nothing but
publish a contact form — and nothing in the app or the database would even slow
it down.

## What it does

A `BEFORE INSERT` trigger on `database_rows`, with two limits:

| limit | number | what it is for |
| :--- | :--- | :--- |
| per page, per minute | 60 | a person managing a form does one or two; sixty is a machine |
| per page, ever | 50,000 | a runaway backstop, far above any free tier |

**The owner is exempt.** Seeding a table, importing a spreadsheet or restoring a
backup is not abuse, and being throttled on your own page would be
indefensible.

**These are runaway protection, not a pricing tier.** The free-tier row
allowance is a product decision and is deliberately not encoded here. To change
the numbers, edit the two constants at the top of the function and run the file
again.

## Why a trigger rather than a change to `add_database_row`

That function has two versions in this repo's history — 0001, and 0004 with
`owner_id` — and only one of them may be installed. A trigger on the table is
independent of which, needs no ordering against those migrations, and covers any
future way of writing a row, including one somebody adds later without
remembering this file exists.

## What had to be fixed in the app first

The workflow that adds a row added it to the page and fired the insert into the
background, logging a warning if it failed. **A visitor pressed Submit, watched
their row appear, and nothing had been stored.** The count went up, the table
filled in, and the data was not there — and neither they nor the builder had any
way to know.

These limits make that reachable on purpose rather than only when the network
fails, so it had to stop being silent. Now a rejected row is taken back off the
page and the reason is shown. The same sweep found the same silence in two more
places: a delete that would not land left the row gone from the page (it
returned on the next reload), and `updateRow`'s read failing meant the update
**never reached the server at all**.

## Steps

1. Supabase → **SQL Editor** → **+ New**
2. Paste all of `supabase/migrations/0007_row_limits.sql`
3. **Run**. It is wrapped in a transaction, so it either all works or none of it does.

Order does not matter against 0004/0005/0006 — this one stands alone.

## Verifying it

1. Open a **published** page with a form, in a private window so you are not the owner.
2. Submit it. The row should appear as normal.
3. Submit sixty times in under a minute — a `for` loop in the browser console on
   that page is the honest way to test it.
4. The next submission should be refused, the row should **vanish from the
   page** rather than sit there looking saved, and the message should say to
   wait a moment.
5. Sign in as the owner on the same page and submit again. **It should work** —
   the owner is exempt.

**Before running the migration**, step 4 will not happen: the rows just keep
being written. That is the bug.
