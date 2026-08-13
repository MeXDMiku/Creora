# What a website needs, and what Creora has

**Second audit. Written 13 Aug 2026, against the code as it stands.**

The first audit (11 Aug) is superseded. It listed images, validation,
for-each-row, dates, search and per-visitor data as missing; six cycles later
all six exist. An audit nobody re-runs is worse than none, because it keeps
pointing at work that is already done.

Method, so this can be re-run rather than re-felt:

1. **Inventory taken from the code, not from memory** — block types from
   `BLOCK_NODE_TYPES`, actions from the `WorkflowStep` union, operators from
   `conditions.ts`, filters from `format.ts`, rules from `validation.ts`, RPCs
   from the migrations.
2. **Walk real site types end to end** and mark where each one stops.
3. **Order what is left by blast radius** — how many site types a missing piece
   unblocks — not by size or appeal.

Legend: `HAVE` · `PART` partly · `MISSING` · `UNPROVED` written but never run

---

## Part 1 — What exists today, counted

**16 block types**
Button · Number display · Toggle · Input · Text label · Formula · Timer ·
History chart · Database · List · Shape · Live data · My design · Visitor ·
**Image** · **For each row**

**18 workflow actions**
increment · decrement · set · setText · toggle · reset · setVisible · setHidden ·
addRow · updateRow · deleteRow · exportCsv · sendWebhook · validate · setLoading ·
clearLoading · setDisabled · setEnabled

**14 condition operators**, each with its opposite, plus `isValid` / `isInvalid`
which ask a field's own rules.

**13 validation rules** — required, email, number, whole number, url, phone,
min/max length, min/max value, starts/ends with, your own regular expression,
matches another field.

**15 display filters** — date, time, ago, plus, minus, money, number, round,
percent, upper, lower, title, trim, truncate, default.

**17 database functions**, all `SECURITY DEFINER`, with RLS on and no policies,
so every read and write goes through one.

**370 runnable checks.**

That is not a skeleton. It is roughly the capability surface of a small
commercial builder — with one very large hole, which is Part 3.

---

## Part 2 — Ten real websites, re-walked

Same ten as the first audit, so the two can be compared directly.

| # | site | verdict on 11 Aug | verdict today | what still stops it |
| :--- | :--- | :--- | :--- | :--- |
| 1 | **Waitlist / signup** | closest to possible | **possible now** | nothing — validation, submit, states all exist |
| 2 | **Landing page** | blocked on images + layout | **blocked on layout only** | fixed x/y; does not reflow on a phone |
| 3 | **Contact form** | blocked on email | **PART** | works, but the owner is not told. Webhook is the workaround, email is the answer |
| 4 | **Portfolio / gallery** | blocked on images | **possible now** | grid layout in For-each-row is the gallery |
| 5 | **Blog** | blocked on for-each-row + dates | **PART** | list works; **there is no detail page** — no way to open one row |
| 6 | **Directory / listing** | blocked on for-each-row + search | **PART** | same one gap: no detail page |
| 7 | **Booking** | blocked on dates + private state + server | **blocked** | no date picker, no conflict prevention |
| 8 | **Shop** | blocked on private state + payments | **blocked on payments** | cart is now possible (unproved); money is not |
| 9 | **Community** | blocked on end-user identity | **blocked** | no accounts for visitors |
| 10 | **Internal dashboard** | blocked on identity + roles + filtering | **PART** | filtering exists; roles and login do not |

**Four of ten moved. One gap appeared that the first audit did not see.**

---

## Part 3 — The hole this audit found

### There is no way to open one row.

A blog lists posts and cannot show a post. A directory lists businesses and
cannot show a business. A shop lists products and cannot show a product.

This is not a missing block — clicking a row already puts its value into the
repeater, and buttons already navigate to another page. **What is missing is that
a page cannot receive a value.** Every page is the same for everybody; there is
no `/view/<page>?id=<row>`, and nothing on the destination page can ask "which
row was I opened with".

It blocks **three** of the ten site types on its own, it is the smallest item in
this document, and no previous plan contained it — because every plan so far was
written by asking "what feature is missing" rather than by walking a site from
the first click to the last.

**It is the highest blast-radius item and it is roughly one cycle.**

---

## Part 4 — Everything still missing, ordered by blast radius

| rank | missing | unblocks | size |
| :--- | :--- | :--- | :--- |
| 1 | **Page parameters** — a page can be opened *with* a row | blog, directory, shop detail, any master/detail | small |
| 2 | **Layout model** — containers, stacking, reflow | every site on a phone. Landing pages entirely | **large, and it is a rewrite** |
| 3 | **More input types** — dropdown, checkbox, radio, number, long text, date | booking, shop, dashboard, most real forms | medium |
| 4 | **Visitor accounts** — email sign-in for the *built* site's users | community, shop, dashboard, anything with "my" | medium, needs a migration |
| 5 | **A private server layer** — Edge Functions | email, payments, API keys, spam guards, AI | medium, unlocks 6–8 |
| 6 | **Email** — tell the owner, tell the visitor | contact form, booking, shop, community | small once 5 exists |
| 7 | **Payments** | shop, subscriptions, the whole revenue idea | large, needs 4 and 5 |
| 8 | **Roles and permissions** | dashboards, teams, the Discord-style layer | medium, needs 4 |
| 9 | **Rich text per row** | blog, community | medium |
| 10 | **Date and time picker** | booking | small, part of 3 |

**Read rank 1–3 as the rest of Phase B.** Ranks 4–8 are a second wave that all
depend on the same two foundations: visitor accounts and a private server.

---

## Part 5 — Two things this audit will not pretend

**Six cycles of work have not been seen running.** Every "HAVE" above is a claim
about code, held up by 370 checks and by nothing on the real domain. The most
likely place for that to be wrong is not the logic — it is the editor: dragging,
selecting, the panel, the slash menu. None of it has been touched by a human
since 11 Aug.

**Migration 0004 is `UNPROVED`.** Per-visitor rows are written and documented and
have never been run. Until they are, "a shop is blocked only on payments" is a
statement about a file, not about a database.

---

## How to re-run this

When it feels stale, it is. The mechanical half is one command:

    grep -o "'[a-zA-Z]*Block'," src/lib/blockRegistry.ts
    sed -n "/  action:/,/;/p" src/types/creora.ts
    grep -o "case '[a-zA-Z ]*':" src/lib/conditions.ts
    grep -ho "function public\.[a-z_]*" supabase/migrations/*.sql

The half that matters is the other one: **pick a real website, build it in your
head from the first click to the last, and write down where you stop.** Every
gap in Part 3 was found that way, and none of them were found by listing
features.
