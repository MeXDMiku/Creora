# Migration 0005 — a page can be deleted

**Not run yet.** Until it is, the × on a page tab opens the warning, and
pressing "Delete it anyway" answers with a plain sentence naming this file
rather than a PostgREST error about schema cache.

## Why it is needed

There was no way to delete a page at all. The database had `create_page`,
`save_page`, `list_pages`, `get_page` and `set_page_published`, and nothing
else — so a page made by accident was permanent. This project reached six
pages, five of them called "Untitled", none removable. Once `goToPage` shipped
with a page picker, those five became five identical entries in a dropdown, so
the missing delete had started blocking a feature rather than just cluttering a
toolbar.

## The decision it makes

**Deleting a page also deletes the rows collected on it.** Destructive, no undo.
Chosen deliberately: the alternative is rows outliving the page they belonged
to, keyed to a block id on a page that no longer exists — invisible in the
editor, unreachable, and still counting against the free tier's row limit for
ever.

The app asks first, says how many rows will go, and offers to save them as CSV
before it happens. The function is the half that cannot ask.

## What it deliberately does not do

Wires on **other** pages pointing at this one are left alone. Rewriting somebody
else's page as a side effect of deleting this one edits work nobody asked to
have edited. The Health panel reports them as *"points at a page that is gone"*,
so they are named rather than silent — that is the honest half of the trade.

## Steps

1. Supabase → **SQL Editor** → **+ New**
2. Paste all of `supabase/migrations/0005_delete_page.sql`
3. **Run**. It is wrapped in a transaction, so it either all works or none of it does.
4. Reload the editor.

## Verifying it

1. Make a throwaway page (**+ New Page**) and put a Database block on it with a row or two.
2. Click the **×** on that page's tab. The warning should name the page and the row count.
3. Press **Save the data first** — one CSV per table should download, and open in Excel with its accents intact.
4. Press **Delete it anyway**. The page should disappear from the strip and the editor should move to another page.
5. Reload. It should still be gone.

**If step 2 shows "at least N rows"** rather than an exact count, the page's
tables had not finished loading. Open the page, wait for the table to fill, then
try again — the wording is deliberately cautious rather than confidently wrong.
