# Migration 0004 - rows gain an owner

**One SQL file, run once, in the Supabase SQL Editor. Additive: nothing that
works today changes.**

File: `supabase/migrations/0004_row_ownership.sql`

---

## What it unlocks

Until now every row in a Database belonged to the block and to nobody else.
That makes **"my cart", "my orders", "my saved things"** impossible - every
visitor to a published page can see every other visitor's rows, because there is
nothing on a row saying whose it is.

After this: a row remembers who wrote it, and a collection can be marked
**private**, which means the server itself refuses to hand a visitor rows that
are not theirs.

---

## The decision it makes, and why

**Privacy is enforced in the database, not in the editor.**

The easy version of this feature is a checkbox in the panel that filters the
list in the browser. That is not privacy. The other rows are still one fetch
away for anyone who opens the network tab, and a page that *looks* private while
leaking every customer's order is worse than one that never claimed to be.

So the flag is a row in `collection_settings`, and `list_database_rows` reads it
before deciding what to return. Three cases, in order:

| who is asking | what they get |
| :--- | :--- |
| collection is not private | everything, exactly as before |
| the page's owner | everything - it is their shop, and the orders are the point |
| anyone else | only rows they own |

---

## What it does **not** do

**A visitor here is an anonymous Supabase session, which lives in one browser.**
Clear the site data, or open the page on a phone instead of a laptop, and it is
a different visitor with a different, empty cart.

That is a real limitation, not a bug, and it is why *real accounts for visitors*
is the next item in the queue. Per-visitor rows are the half that has to exist
first: accounts without ownership on rows would have nothing to attach to.

---

## How to run it

1. Supabase dashboard, **SQL Editor**, **New query**.
2. Paste the whole of `supabase/migrations/0004_row_ownership.sql`.
3. Run it. It is wrapped in a transaction and is safe to run more than once.
4. The last line is `notify pgrst, 'reload schema'` - that is what makes the new
   functions visible to the app without waiting.

---

## What it adds

**Column** - `database_rows.owner_id uuid`, plus an index matching the query
"this collection, this owner, oldest first".

Existing rows keep a **null** owner. They belong to nobody, stay visible exactly
as they are today, and no "mine only" query will ever return them. Backfilling a
guess would be worse than leaving them honest.

**Table** - `collection_settings (block_id, page_id, per_visitor, updated_at)`.
RLS on, no policies, like every other table here: all access goes through
functions.

**Functions**

| function | who may call it | what it does |
| :--- | :--- | :--- |
| `is_collection_private(block_id)` | anyone | the flag, defaulting to false |
| `get_collection_private(block_id)` | anyone | same, for the editor |
| `set_collection_private(block_id, bool)` | the page's owner only | sets it |
| `add_database_row(...)` | unchanged callers | now also stamps `owner_id` |
| `list_database_rows(block_id)` | unchanged callers | now honours the flag |
| `update_my_database_row(id, data)` | the row's owner | change your own row |
| `delete_my_database_row(id)` | the row's owner | remove your own row |

`update_database_row` and `delete_database_row` are **untouched** - they still
require page-edit rights and remain the owner's tools. The two new `_my_`
functions are the visitor's, and they are what "change the quantity in my
basket" needs. There was no way to say that before: a visitor could add a row
and then never touch it again.

---

## The line to read twice

    and (auth.uid() is not null and dr.owner_id = auth.uid())

`auth.uid() is not null` is not decoration. Without it, a caller with **no
session** would match every row whose `owner_id` is null - which is every row
written before this migration - and a private collection would hand its entire
history to anyone signed out.

---

## After running it

In the editor, select a Database block and turn on **"Each visitor only sees
their own rows"**. Until the migration is run, that switch reports exactly what
is missing and points back at this page rather than failing silently.

**Then check it properly**, because none of the above has been run against a
real database yet - it was written while this session had no way to reach
Supabase:

1. Publish a page with a form writing into that Database.
2. Submit one row.
3. Open the published page in a private window - a different visitor - and
   confirm the first row is **not** visible.
4. Submit a second row there, then go back to the first window and confirm you
   see only yours.
5. As the page's owner, in the editor, confirm you see **both**.

If step 3 shows both rows, stop and say so: the flag did not take, and a
collection that reports itself private while showing everything is the worst
possible outcome.
