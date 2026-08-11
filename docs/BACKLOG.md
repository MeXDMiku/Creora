# Backlog — everything decided in "Project restructure and review"

Source: the 10–11 Aug 2026 session. Every item below was decided or measured in
that conversation. Most of it was **never written into this repo** and existed
only in the transcript — which is how this project has lost decisions before.

`PROJECT_STATE.md` says what exists. `DIRECTION.md` says what we are aiming at
and what we refuse to build. **This file is the complete list, with status.**

Status key: `DONE` · `PART` partly done · `TODO` decided, not built ·
`OPEN` genuinely undecided

---

## 1. Shipped

| | what |
| :--- | :--- |
| DONE | Step 0 — 21 days of loose work committed and tagged `v0-prototype` |
| DONE | Schema captured into `supabase/schemas/prod.sql` |
| DONE | Step 1 — real block ids, unlimited blocks per page (was hard-capped at 2) |
| DONE | Step 2a — published pages navigate (`useNavigate` imported, never called) |
| DONE | Step 3 — identity and ownership, attacked live and held |
| DONE | Email sign-in, keeps the same `auth.uid()` so pages follow the account |
| DONE | Publish button, share link, copy, unpublish |
| DONE | `npm run typecheck` — `tsc --noEmit` was compiling zero files |
| DONE | Deployed: `creora.aridamanpratapsingh4.workers.dev` |
| DONE | Feedback page, live, holding rows submitted by people who are not the owner |
| DONE | Daily GitHub Action ping so Supabase never auto-pauses again |
| DONE | *(12 Aug)* Published pages stop leaking editor chrome; count is real |
| DONE | *(12 Aug)* Phone layout — published pages stack below 640px |
| DONE | *(12 Aug)* Animation presets |
| DONE | *(12 Aug)* Run history |
| DONE | *(12 Aug)* Blocks named, not numbered, in every dropdown |

---

## 2. Business model — decided, none of it built

**Free to build. Pay to publish.** Charge for what actually costs money — a live
page consuming database, bandwidth and visitor accounts. Do not charge for
poking at the editor, which costs ~nothing and is how someone decides they want it.

### The free tier, with the numbers that were argued for

| | Free | Paid |
| :--- | :--- | :--- |
| building | unlimited editing | — |
| pages | up to ~3 | more published pages |
| published | **1 page**, on a Creora URL | custom domain |
| badge | small "Made with Creora" | remove the badge |
| data | ~100 collected rows | higher row and storage limits |
| traffic | 1,000 visitors / month | — |
| dormancy | auto-unpublish after 30 days untouched, then delete the data | — |
| AI | BYOK — their key, their bill | later: end-user accounts, teams, AI included |
| export | `.creora` — always, forever | — |

- `TODO` **Do not cap accounts, cap the expensive things.** You cannot stop
  multi-accounting; Google accounts are free and infinite. But a Creora page is
  ~1 KB and a thousand dormant accounts cost about nothing. Cap traffic, rows and
  dormancy instead and abuse stops mattering rather than being fought.
- `TODO` **The badge is the entire marketing budget.** Do not skip it.
- `TODO` **Never make source code the paid feature.** Webflow can sell code
  export because their value *is* the markup. Here the value is the live shared
  backend, and exported code has none of it — a dead copy, no shared state, no
  submissions arriving. It would be selling a broken version of the product as
  the premium tier, and it monetises *leaving*. Every good paid feature should
  make the thing **more alive**.
- `TODO` Keep `.creora` export free forever. That is the user's **data**, not the
  code, and it is the thing that would have saved this project in July.
- `OPEN` **Do not pick a price yet.** Fix the shape; the number comes when
  somebody actually wants to pay.

---

## 3. Storage, images and hosting — measured, not guessed

**The 500 MB database is not the constraint.** Measured on 11 Aug:

```
3 pages          376 kB total
database rows     64 kB
average page       660 bytes      ← a Creora page is about one kilobyte
biggest page     1,065 bytes
whole database    11 MB           ← mostly Postgres's own system tables
```

At that size 500 MB is tens of thousands of pages. Two things could destroy it
overnight, and both are avoidable:

- `TODO` **Images must never be base64'd into the page JSON.** One inlined photo
  outweighs a hundred pages. The block stores a **URL and nothing else.** This is
  the single biggest storage risk in the product.
- `TODO` **Public form submissions** grow without limit once strangers can
  submit. That is a row cap on the free tier, not a storage panic.

### The $0 image pipeline, decided

1. Never base64 into page JSON.
2. **Compress in the browser before upload** — resize to ~1600px, WebP quality 80.
   A 4 MB phone photo becomes roughly 150 KB. *The highest-leverage line of code
   in the whole feature.*
3. Upload to **Supabase Storage**, scoped by page owner using the ownership
   rules that already exist.
4. At 150 KB each, 1 GB is about **6,600 images**.
5. When egress becomes the real limit, put **Cloudflare in front** — it caches
   images, its bandwidth is unlimited and free, and the 5 GB stops mattering.

Free plan: **1 GB storage, 5 GB egress.** Egress is the tighter limit.

### Hosting and domains

- Cloudflare free tier: unlimited bandwidth, 500 builds/month, **5 custom domains
  free** with SSL. Already in use.
- `TODO` A real domain is **one** purchase, roughly ₹800–1,200/year. Not now.
- `TODO` **You never buy domains for your users.** Someone who wants
  `theirshop.com` buys it themselves and points it at you. No reselling, no
  capital, no inventory. Custom domains are a paid *feature*, not a cost.

---

## 4. AI — the version matters more than the feature

Mechanically an AI block is cheap: another block with an input, a prompt, and a
typed output port. The binding engine already moves typed values between blocks.

| version | who pays | what it needs |
| :--- | :--- | :--- |
| AI in the editor, key in the builder's own browser | the builder | **nothing** — zero custody, zero liability |
| AI in the editor, key held by Creora | the builder | encrypted at rest, never sent to the browser |
| AI on a published page | the builder, spent by strangers | a server to hold the key + per-visitor rate limiting |

- `TODO` **Build the zero-custody version first.** The key stays in the builder's
  browser and is never sent to Creora at all. AI works immediately, no server.
- `TODO` If Creora ever holds other people's keys: encrypted at rest, never
  returned by any API, never in a published page's source. One leak is someone
  else's four-figure bill and it is your fault.
- `OPEN` BYOK quietly selects for developers — a person who "doesn't want to
  think about backends" also doesn't want an OpenAI account and a card. The
  resolution argued for was **both**: AI included in the subscription for normal
  users, BYOK as the escape hatch.
- `TODO` **Gate AI behind login.** An account makes per-person rate limiting
  possible, which turns an unbounded bill into a capped one. These two features
  want each other.

### The strategic point underneath it

> **Your advantage isn't generating. It's being editable afterwards by someone
> who can't code.**

v0, Lovable and Stitch generate beautifully — and hand back code or pictures. If
you can't code, what comes out is finished and frozen. The strongest version is
both: **AI writes the first draft as a node graph, then you adjust it visually**,
because every connection is visible and clickable. Generation gets 80% in ten
seconds; the nodes get the last 20% without a developer.

That is also the answer to "nobody builds websites like that anymore" — correct,
and nobody should. **The node graph isn't how you start a page. It's how you
change one.**

---

## 5. Identity — two different problems that sound the same

- `DONE` **You** logging into Creora — anonymous + email link.
- `TODO` **Google login for you** — an afternoon. Removes the 2-emails-per-hour
  friction hit daily.
- `TODO` **A visitor logging into a site someone built with Creora** — this is
  the real project. Every visitor of every site becomes an account in *this*
  Supabase project. That means: the Google consent screen says "Sign in to
  Creora" until per-site OAuth credentials exist; a membership layer, so a person
  is a member *of a site*; per-site profiles and roles; and the free tier's
  **50,000 monthly active users shared across every site on the platform.**
  This is what Clerk and Auth0 charge for. Understood work, not research — but
  plan it as multi-tenant auth, never as "add Google login".

---

## 6. The one foundation under all of it

The AI key must be hidden. OAuth secrets must be hidden. Rate limits must be
un-cheatable. **Three hats, one problem: there is nowhere private to run code.**

- `TODO` **A Supabase Edge Function layer**, built once and proven with the
  cheapest capability that needs it. `CLAUDE.md` Rule 7 already said every write
  should go through an Edge Function; it was never built, and this is where it
  returns.
- **One capability end to end before a second is started.** Five half-built
  capabilities are worth nothing.

---

## 7. From Twenty's workflow builder

| | |
| :--- | :--- |
| PART | **Named, typed outputs.** Dropdowns now show names. Still missing: a block publishing a *named variable* later blocks reference by name, not by block id. |
| TODO | **If / Else as a visible branch node**, with labelled If and Else paths. Conditions are still buried inside a workflow step, so the branch cannot be seen. |
| DONE | **Runs** — a run log exists. |
| TODO | **Versions**, and a Draft / Activate distinction. |
| TODO | **Per-node permissions** — the ownership model arriving at node level. |

And the primitives that matter more than block types:

- `TODO` `when a value changes` · `for each row in a collection` · `on page load`
  · `every N seconds`. Four of these combine into hundreds of behaviours; twenty
  new block types give twenty.

---

## 8. Editor and design

- `TODO` **The published output and the editor have opposite urgency.** A visitor
  never sees the editor. The published page is what needs to look modern, and
  soon. The editor is a builder's tool and can stay rough far longer.
- `TODO` **Do not redesign before the layout decision.** Making it beautiful on
  top of fixed x/y and then moving to stacks and grids means doing it twice.
  Decide layout, build the theme and token layer, and the "remake" becomes
  *applying* a system rather than redrawing by hand.
- `PART` Layout — published pages stack below 640px. Blocks are still stored at
  fixed x/y and the editor still positions absolutely.
- `DONE` Block names in dropdowns.
- `TODO` A visible insert affordance that does not move, and a keyboard shortcut
  to open the block menu from anywhere.

---

## 9. Code debt with a known shape

- `TODO` **Collections.** Rows are scoped only by `database_block_id`. Delete a
  Database block and its rows orphan in Supabase, unreachable through the
  product; two pages cannot share data; nothing but a client-generated string
  prevents two blocks sharing rows.
- `TODO` **Renderer merge.** Roughly **500 lines** in `PublishedRenderer.tsx`
  reimplement Timer, Database and List wholesale, including Database's Supabase
  writes. That is where the two sides silently drift — and Database is the one
  that writes real data.
- `TODO` **Accessibility divergence.** In the editor a button renders as a
  `<div>`; on published pages as a `<button>`. Cosmetically identical, and only
  one is keyboard-accessible.
- `TODO` `supabase login && supabase link` has never been run, which is why every
  DDL change is still a manual dashboard operation.
- `TODO` Custom SMTP before real users — the built-in sender allows **2 auth
  emails per hour**.

---

## 10. Still genuinely open

- `OPEN` Price.
- `OPEN` AI included in subscription vs BYOK only vs both.
- `OPEN` Whether the editor canvas keeps free x/y placement at all, or moves to
  stacks, rows and grids everywhere.
- `OPEN` Whether importing a Figma / AI-generated visual layer is ever built. The
  rule if it is: **import the visual layer only, always discard the logic**, and
  re-wire through nodes. Creora never reads the spaghetti to know it is spaghetti.

---

## 11. The rule that did the work

> Every real problem in this project was found by running the thing, and none of
> them by discussing it.

The two-blocks-per-page cap, the `useNavigate` that was never called, the type
checker that checked nothing, the eight open RPCs, the Database block overwriting
the page it had just loaded — all of them survived months of discussion by four
different AIs, and all of them died within minutes of someone reading the actual
file or opening the actual page.

**And the discipline: no new planning until the current step ships.**
