# Every way a page talks to a store, and which ones Creora can say

**19 August 2026.** Written after building **seven working sites** and, for six
of them, a **fake Supabase** underneath — real row-level security, real
constraints, real transactions, real realtime, real storage, real latency, real
failures.

That last part is the whole method. Every mockup before this kept its data in an
array in the same file as the page, and an array cannot refuse you, has no
latency, never fails, does not know who is asking, and is never edited by
somebody else while you are looking at it. **The interesting half of "connect
the backend to the frontend" is invisible until the backend can say no.**

| site | the seam it exists to stress |
| :--- | :--- |
| **Nib** — a social app | joins, self-relations, feeds filtered by who is looking |
| **Kilnworks** — a shop | a checkout that is five writes and must be all-or-nothing |
| **Clayfield Support** — a helpdesk | the same row looking different to different people |
| **Wheel Room** — booking | two people cannot have the same seat |
| **Studio Board** — kanban | somebody else edits while you are looking |
| **Kilnworks Numbers** — a dashboard | every figure is a group-by |
| **Studio Gallery** — uploads | a file and a row that must stay in step |
| **Studio Application** — a long form | a half-finished thing that survives closing the tab |

`nanobase.check.mjs` (26 assertions) proves the fake backend really refuses
things. `sites.check.mjs` (62) proves each site really does its seam. All 88
pass; they are what makes the table below evidence rather than opinion.

---

## The taxonomy: 40 connections, in seven families

Legend — **HAVE**: sayable today · **PART**: sayable awkwardly or unsafely ·
**NONE**: not sayable.

### 1. Reading

| # | the connection | state | seen in |
| :-- | :--- | :-- | :--- |
| 1 | a table becomes a list | HAVE | all |
| 2 | one row, by an id in the address | HAVE | desk, nib |
| 3 | filtered by a constant | HAVE | all |
| 4 | **filtered by something on the page** — a box, who is signed in | HAVE *(built today)* | nib, shop |
| 5 | **filtered by membership of another table** — a real join | HAVE *(built today)* | nib |
| 6 | a value derived per row — count, sum, lookup across a relation | HAVE | nib, book |
| 7 | **an answer smaller than the data** — group-by, buckets, top N | **NONE** | dash |
| 8 | **one list drawn from several tables** — a union | **NONE** | nib |
| 9 | paging the *store* does, not the page | PART | dash, shop |
| 10 | one row per value — dedupe / distinct | **NONE** | nib |

### 2. Writing

| # | the connection | state | seen in |
| :-- | :--- | :-- | :--- |
| 11 | insert one row from a form | HAVE | all |
| 12 | update one row | HAVE | all |
| 13 | delete one or many | HAVE | all |
| 14 | insert-or-update — "add to basket" | PART | shop |
| 15 | toggle a pair — like, follow, attend | PART | nib, book |
| 16 | **several writes, all or none** | **NONE** | shop, files |
| 17 | **a value the SERVER decides** — price, author, timestamp | **NONE** | shop |
| 18 | **refuse if somebody got there first** | PART | board |

### 3. Guarding

| # | the connection | state | seen in |
| :-- | :--- | :-- | :--- |
| 19 | who may READ a row | **NONE** *(0004 written, unrun)* | desk, shop, files |
| 20 | who may WRITE a row | PART | all |
| 21 | **which COLUMN a person may see** | **NONE** | desk |
| 22 | **which transitions are allowed** — a state machine | **NONE** | desk |
| 23 | unique across two columns | **NONE** *(0008 extended)* | book, nib |
| 24 | a rule the store enforces, not the form | PART *(0009)* | all |

### 4. Reacting

| # | the connection | state | seen in |
| :-- | :--- | :-- | :--- |
| 25 | **a loading state while a read is in flight** | **NONE** | all six |
| 26 | an error state with a retry | PART *(writes yes, reads no)* | all six |
| 27 | re-read after a write | HAVE | all |
| 28 | **hear that somebody ELSE changed something** | PART *(polling, no push)* | board |
| 29 | show it immediately, then reconcile | **NONE** | board |
| 30 | who else is here — presence | **NONE** | board |

### 5. Files

| # | the connection | state | seen in |
| :-- | :--- | :-- | :--- |
| 31 | upload and get a URL | HAVE | files |
| 32 | **a private file, link expires** | **NONE** | files |
| 33 | **a quota** | **NONE** | files |
| 34 | **keep the file and its row in step** | **NONE** | files |

### 6. Time

| # | the connection | state | seen in |
| :-- | :--- | :-- | :--- |
| 35 | **something that happens on a schedule** | **NONE** | desk (SLA), book (reminders) |
| 36 | a value that depends on now | HAVE | book, desk |

### 7. Half-finished things

The family nothing else in the lab touches, and the one a non-coder builds most
often: a form too long to finish in one sitting.

| # | the connection | state | seen in |
| :-- | :--- | :-- | :--- |
| 37 | **a draft row that exists BEFORE it is valid** | **NONE** | apply |
| 38 | a question that appears because of an earlier answer | PART | apply |
| 39 | a field that saves itself as you type | PART | apply |
| 40 | **a one-way state, after which the row is read-only** | **NONE** | apply |

**Score: 13 HAVE, 9 PART, 18 NONE.**

### The trap in 38, which is worth its own paragraph

Creora can hide a question. It cannot make a hidden question **not required** —
validation belongs to the field, and a field that is not on screen is still
being validated. So the builder hides "how many years?" for beginners, and
beginners cannot submit the form, and nothing on the page says why.

The fix is not a better checkbox. It is that **the store decides which questions
are being asked, from the answers**, and validates exactly those — which is
primitive **B** below.

---

## Three things the lab found that no amount of reading would have

**A rollback puts the rows back and cannot put the bytes back.** An upload that
succeeds and then fails at the row insert leaves a file nobody can see and
nobody meant to pay for. There is no transaction across a database and a file
store — not in nanobase, not in Supabase, not anywhere — and a no-code builder
has no way of even knowing the problem exists.

**A row you may not read is missing, not refused.** That is correct (an error
would leak that it exists) and it means a page cannot tell *"no results"* from
*"not allowed"*. Somebody will one day swear their data has vanished.

**Realtime is filtered per listener.** Two people watching the same board are
told different things and both are right. Anything built on "everyone sees the
same events" is wrong the moment security exists.

---

## The system: six primitives, not eighteen features

Eighteen missing connections is not eighteen features. Grouped by what they
actually need, they are **six primitives**, and this project has learned twice
already that primitives beat block types — four triggers combine into hundreds
of behaviours, twenty new blocks give twenty.

### A · The Query — a named question, answered by the store

> Closes 7, 8, 9, 10 · and makes 4, 5, 6 cheaper

A saved question with holes in it, defined once and usable anywhere a table is
usable. Not SQL — the same formula language, with three verbs a table does not
have:

```
Query "Revenue by month"
  from     Sales
  group by  left(At, 7)          ← the buckets are not known in advance
  keep      total of Pence, count of rows
  order by  the group, first to last

Query "My notifications"
  from     Likes   where {{PostId}} in (my posts)   as "liked your post"
  and from Follows where {{FollowingId}} == Me      as "followed you"
  order by At, newest first        ← ONE list, three tables
```

Why it must be one node and not three settings on a repeater: a query is
**reusable and parameterised**. The dashboard asks the same question with a
different date range; the shop asks "best sellers" on two pages. And it is the
only shape that lets the answer be smaller than the data, which on a free tier
is the difference between working and a bill.

### B · The Action — a named sequence of writes, on the server, all-or-none

> Closes 14, 15, 16, 17, 18, 22, 34, 38, 40

Today a button runs steps in the browser. An Action runs them **where the data
is**, as one unit, and either all of it happened or none of it did.

```
Action "Check out"
  for each row in my basket
    read the product          ← the PRICE comes from here, not from the page
    refuse if stock < qty     "Only 2 left and you asked for 3"
  write an order
  write a line per item, take the stock off
  empty the basket
```

Three things fall out of it for free, and each was a separate missing feature:

- **the server decides some values** (price, author, timestamp), which is the
  fix for the oldest bug in commerce — trusting a price the page sent
- **a transition can be refused** — "a closed ticket cannot be reopened" — so a
  workflow stops being a dropdown that offers every value
- **a file and its row** go up together or not at all

### C · The Rule — who may do what, said once, enforced at the store

> Closes 19, 20, 21, 23, 24

Attached to a table, in the same language as everything else, and **compiled
into a migration** rather than checked by the page:

```
Rule on Tickets
  read     when  Author == Me  or  MyRole == "agent"
  write    when  MyRole == "agent"

Rule on Messages
  read     when  MyRole == "agent"  or  Internal is off
  ↑ column-shaped security expressed as a row rule, which is why
    "just hide the block" is not a security model

Rule on Bookings
  one row per   SlotId + UserId       ← two columns, which no page can promise
```

This is the piece with a hard edge: it cannot be done in the browser at all, and
it is where migrations 0004 and 0008 already point. Everything else on this list
is a convenience; this one is the difference between a demo and something you
would let strangers use.

### D · Every data block has three outputs, not one

> Closes 25, 26, and half of 29

The largest *conceptual* gap, and the cheapest to miss. A Creora block has **a
value**. A thing that comes from a store has **three states** and only one of
them is a value:

```
            ┌── value    the rows / the number
Database ───┼── loading  true while the answer is on its way
            └── failed   the message, and a way to try again
```

Every one of the six sites in the lab needed all three, on every read. Today a
builder can wire the first. The other two are why a page built with a no-code
tool feels wrong the moment the network is slow — and the lab has a **"slow"**
and a **"flaky"** tick-box precisely so that is visible rather than theoretical.

### E · "When this changes" — a fourth trigger

> Closes 28, 30, and the other half of 29

There are three triggers today: when pressed, when changed, when the page opens.
The fourth is **when the data changes** — from anywhere, including somebody
else's browser.

```
When Bookings changes → refresh this list
When Cards changes    → refresh, and say "Tomas moved a card"
```

One event. It gives live counts, a board that keeps up, and presence (a table of
who-is-here with rows that expire) without any of those being a feature.

### F · "Every day at…" — a fifth trigger

> Closes 35

A workflow that runs on a schedule with nobody watching. Reminders the day
before, an SLA that escalates, a nightly rollup that makes the dashboard cheap.
Every business site in the lab wanted one; none of them could have one.

---

## The order

Ranked by *sites unblocked per unit of work*, from the evidence above.

| | primitive | closes | why here |
| :-- | :--- | :-- | :--- |
| **1** | **D · loading / failed outputs** | 25, 26 | Smallest, and every site needs it on every read. Nothing else makes a page feel real faster. |
| **2** | **C · Rules** | 19, 20, 21, 23, 24 | The only one that is a *safety* problem. 0004 and 0008 are already written; this is the interface to them. |
| **3** | **B · Actions** | 14–18, 22, 34, 38, 40 | Unblocks the shop, the helpdesk and the booking site in one go. Needs a server, which is the real cost. |
| **4** | **A · Queries** | 7–10 | Unblocks the dashboard entirely and the notifications feed. |
| **5** | **E · When-this-changes** | 28, 29, 30 | Turns polling into pushing; the board goes from nearly-right to right. |
| **6** | **F · Schedules** | 35 | Wanted everywhere, blocking nothing. |

> **2026-08-23 — the line below is wrong, and `docs/PRIMITIVE_B_ACTIONS.md`
> is why.** "Server" here meant *a place to run code somebody pays for*. B needs
> trusted code, not a runtime, and a `security definer` Postgres function on the
> free tier is exactly that — the same place C's policies already live. **B is
> built and compiles to one.** F is the only one still without a free answer.

**Two of the six need a server that Creora does not have** (B and F), and one is
a migration that exists and has never been run (C). That is the honest shape of
"connecting the backend to the frontend": it is not mostly missing blocks. It is
mostly **missing somewhere to put trusted code**.

---

## What this says about the original question

A site of the X.com class is expressible today apart from grouping, unions and
dedupe — all three of which are **A**.

A site of the shop / helpdesk / booking class is *not*, and the missing piece is
**B** and **C**: work that must happen where the data is, and rules that must be
enforced where the writing happens.

And every site of every class, including the ones that already work, is missing
**D** — which is the one a visitor would notice first.

A long application form — the single most common thing a non-coder builds — is
missing **B** as well, in the least obvious way: not because the form is hard,
but because *which questions count* has to be decided where the submitting
happens, or a hidden question quietly blocks the submit button for ever.
