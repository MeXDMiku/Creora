# Staying on free infrastructure

**The condition this project is built under.** Not a preference — the bill has to
be zero, so every design decision that costs money is a design decision that
breaks the product.

Written 19 Aug 2026. **The figures below belong to Supabase and Cloudflare and
they change** — they are here, dated, with a source, and deliberately *not*
inside the app. A number typed into a product goes stale silently and then lies
with confidence, which is what this project's own capability audit did for six
days.

## What the free tiers actually give

Supabase Free, from their pricing page:

| | |
| :--- | :--- |
| database | **500 MB** |
| egress | **5 GB** (plus 5 GB cached) |
| file storage | **1 GB** |
| monthly active users | 50,000 |
| inactivity | **paused after 1 week**, limit 2 active projects |

The daily GitHub Action ping exists for that last row and nothing else.

Cloudflare Workers Free: 100,000 requests/day.

## What actually spends it, in order

### 1. The page blob, uploaded on every keystroke

`save_page` writes the **whole** page 500ms after you stop typing. So the page's
size is not a storage question — it is **bandwidth × how fast you type**. A 3 MB
page is 3 MB uploaded per pause for thought, all session.

It is also downloaded by every visitor. 3 MB × 1,700 visitors is the entire
monthly egress.

**Two things made pages big, and both were invisible until 19 Aug:**

- **Collected rows were saved into the page.** They live in `database_rows`,
  which is where every renderer reads them from — the copy inside the page was a
  second store of the same data. A table with 500 rows was stored twice and
  re-uploaded on every keystroke. Now stripped before writing.
- **An inlined photo.** `data:image/png;base64,...` is a real URL and the Image
  block accepts one, so pasting a photo instead of linking it gives you a 3 MB
  page. Now measured: over 512 KB the editor says so and names the block, over
  2 MB it refuses to keep saving.

### 2. Rows collected from strangers

A published form writes a row for anyone who submits it. **Migration 0007** caps
that at 60 per page per minute and 50,000 per page total — runaway protection,
not a pricing tier. The owner is exempt.

Without it, one script pointed at a live page fills the 500 MB.

### 3. Images

They belong in Storage (1 GB), not in the database. `SETUP_STORAGE.md` has the
bucket. The Image block stores a URL; anything else is the failure above.

## How to see where you are

**In the app:** the Health panel's *"What this costs to keep online"* — page
weight, rows on this page, pages in the project, and any picture pasted in
rather than linked. Measured, for the page you are on.

**For the real totals:** your Supabase dashboard. It knows the project figures
and the current limits; this app deliberately does not claim to.

## The rule that keeps this true

Anything that grows without a ceiling has to have one put on it **before** it
ships, not after somebody notices the project paused. Every item above was found
by asking "what grows, and who decides how much?" — not by watching a number go
up, because by then a week of egress is gone.

Sources: [Supabase pricing](https://supabase.com/pricing)
