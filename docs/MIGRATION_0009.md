# Migration 0009 — a row has to look like the table it is going into

**Not run yet.** Until it is, the server checks *who* is writing and never *what*.

## Why it is needed

`add_database_row` takes `row_data jsonb` and inserts it. **Every rule in the
product lives in the browser** — required, must be a number, must be a date,
must be a real email. That makes them advice to whoever uses the form and
nothing at all to whoever calls the RPC directly, and the anon key is printed in
every published page. Calling it is one line of `fetch`.

So a stranger can put a column that does not exist into your table, a paragraph
into your number column, and a megabyte into a field meant for a name — and the
editor will show all of it as though a person had typed it.

## What it does

Makes the server agree with the browser. The same three decisions
`coerceForColumn` makes in the client, made again where they cannot be skipped:

| | |
| :--- | :--- |
| a key that is not a column | **dropped** |
| a value in a typed column | **coerced**, or the write is refused |
| a row over 16 KB | **refused** |

**Coerced rather than refused**, wherever the browser would have accepted it.
Refusing anything the browser accepts turns a working form into a broken one —
and the browser sends `"5"` for a number column in some paths and `5` in others.
This is the same drift problem the two renderers have had nine times, here
across a network instead of between two files.

**A key that is not a column is dropped, not refused.** A builder who renames a
column while somebody has the form open would otherwise have that person's
submission rejected outright. Dropping keeps the answer they could still use.

**Where 16 KB comes from:** the free database is 500 MB
([Supabase pricing](https://supabase.com/pricing), checked 19 Aug 2026) and 0007
caps a page at 10,000 rows. 10,000 × 16 KB ≈ 160 MB, so one maximally abused
page takes about a third and no more. 16 KB is roughly 3,000 words — far beyond
any form field.

## What it deliberately does not enforce

**`required`, `email`, and the rest of the validation panel.** Those live on the
*block* that feeds a column, not on the column, and the server cannot see which
input fed which field. Enforcing a guess would refuse honest submissions, which
is worse than the gap. The three things above are properties of the **column**
and are knowable from the database.

## The trigger order is load-bearing

Postgres runs `BEFORE` triggers on a table **alphabetically**, which gives:

1. `enforce_row_limits_trigger` (0007) — is this page allowed another row
2. `enforce_row_shape_insert` (0009) — make the row look like the table
3. `enforce_unique_columns_insert` (0008) — is this value already taken

**Shape before unique is the one that matters.** Uniqueness compares the stored
value, so a slot arriving as `" 10am"` and one arriving as `"10am"` would be two
different bookings if they were compared before being tidied.

That order is an accident of three names chosen separately in three migrations,
so a check asserts it. Renaming a trigger would reorder the pipeline silently,
and the symptom would be a double booking nobody could reproduce.

## Steps

Easiest: run `supabase/RUN_ALL_MIGRATIONS.sql`, which is every migration in one
paste and safe to run whole. Otherwise paste this file on its own.

## Verifying it

You need to call the RPC directly, because the point is what happens when
somebody skips the form. In the browser console on a **published** page:

```js
// Replace with a real Database block id from the page.
await window.__creoraSupabase?.rpc('add_database_row', {
  p_id: crypto.randomUUID(),
  p_block_id: 'databaseBlock__…',
  p_row_data: { NotAColumn: 'junk', Price: 'a paragraph' },
})
```

1. **Before the migration:** it succeeds, and both the junk key and the
   paragraph appear in your table.
2. **After:** it is refused with *"Price has to be a number"*, and had the
   paragraph been a valid number, `NotAColumn` would simply not be there.
3. Submit the form normally afterwards — **it should still work exactly as
   before.** If it does not, that is this migration being stricter than the
   browser, which is the failure it is written to avoid.
