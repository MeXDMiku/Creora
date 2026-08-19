# What a website needs, and what Creora has

**Third audit. Written 19 Aug 2026, against the code as it stands.**

The second audit (13 Aug) is superseded. It named page parameters as the
highest blast-radius item, more input types as rank 3, and a date picker as rank
10. **All three exist now**, and the second audit kept pointing at them for six
days — which is exactly what its own first paragraph warned about.

So this time the counts are not typed by hand. They are asserted against the
code by `npm run check`, in the group *"this audit still describes the
product"*. If a block type or an action is added and this file is not updated,
the checks go red. **An audit that can go stale silently will.**

Method, unchanged and still worth following:

1. **Inventory from the code, not from memory** — and now checked.
2. **Walk real site types end to end** and mark where each one stops.
3. **Order what is left by blast radius** — how many site types a missing piece
   unblocks — not by size or appeal.

Legend: `HAVE` · `PART` partly · `MISSING` · `UNPROVED` written but never run

---

## Part 1 — What exists today, counted

**17 block types**
Button · Number display · Toggle · Input · Text label · Formula · Timer ·
History chart · Database · List · Shape · Live data · My design · Visitor ·
Image · For each row · **Page value**

**20 workflow actions**
increment · decrement · set · setText · toggle · reset · setVisible · setHidden ·
addRow · updateRow · deleteRow · exportCsv · sendWebhook · validate · setLoading ·
clearLoading · setDisabled · setEnabled · **goToPage** · **openUrl**

**10 condition operators** in five opposed pairs, plus `isValid` / `isInvalid`
which ask a field's own rules — and, since 16 Aug, **a condition may be a whole
formula** instead, which is what made "only when quantity times price is over
500" sayable at all.

**17 validation rules** — required, email, number, whole number, url, phone,
min/max length, min/max value, starts/ends with, your own regular expression,
matches another field, and **is a date / is after / is before** (either taking
the word `today`).

**15 display filters** — date, time, ago, plus, minus, money, number, round,
percent, upper, lower, title, trim, truncate, default.

**47 formula functions** — this is the newest and largest addition, and none of
it existed on 13 Aug. The evaluator was `+ - * / %` over a `default: return 0`,
so `if(...)` and `Price > 100` both silently answered **0**.

- 30 general: `if` `and` `or` `not` `isBlank`, min/max/sum/avg/abs/floor/ceil/
  round/pow/sqrt/clamp, len/upper/lower/trim/join/concat/contains/startsWith/
  endsWith/replace/left/right, number/text
- 6 over a whole table: `countOf` `sumOf` `avgOf` `minOf` `maxOf` `joinOf`,
  each taking an optional row condition
- 11 dates: `daysUntil` `daysSince` `daysBetween` `dateAdd` `isBefore` `isAfter`
  `isSameDay` `year` `month` `day` `weekday`, plus `today` and `now` as words

**4 column types** — text, number, boolean, **date**.

**7 migrations**, all `SECURITY DEFINER` with RLS on and no policies, so every
read and write goes through one function.

**1,480 runnable checks**, each with a negative control.

---

## Part 2 — Ten real websites, re-walked

Same ten as both previous audits, so all three can be compared.

| # | site | 11 Aug | 13 Aug | today | what still stops it |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **Waitlist / signup** | closest | possible | **possible** | nothing |
| 2 | **Landing page** | blocked | blocked on layout | **blocked on layout** | fixed x/y; no reflow on a phone |
| 3 | **Contact form** | blocked on email | PART | **PART** | works, but the owner is not told. Webhook is the workaround; email is the answer |
| 4 | **Portfolio / gallery** | blocked | possible | **possible** | — |
| 5 | **Blog** | blocked | PART — no detail page | **possible** | page parameters shipped; a row can open a page |
| 6 | **Directory / listing** | blocked | PART — no detail page | **possible** | same |
| 7 | **Booking** | blocked | blocked | **PART** | date picker, date column and date maths all exist. **No conflict prevention** — nothing stops two people booking one slot |
| 8 | **Shop** | blocked | blocked on payments | **blocked on payments** | cart is possible; money is not |
| 9 | **Community** | blocked | blocked | **blocked** | no accounts for visitors |
| 10 | **Internal dashboard** | blocked | PART | **PART** | numbers are strong now — several figures from one table, dates, totals. Roles and login still missing |

**Three of ten moved.** Two on page parameters, one on dates.

---

## Part 3 — The hole this audit found

### Two people can book the same slot.

Booking moved from `blocked` to `PART` because dates arrived — a date column, a
picker, `daysUntil`, "must be in the future". A visitor can now choose a slot
and it is stored correctly.

**Nothing stops the next visitor choosing the same one.** There is no uniqueness
anywhere: not on a column, not in a condition, not in the database. A workflow
can check "is this slot taken" only against the rows the browser happens to have
loaded, which is the wrong question asked of the wrong copy — two people pressing
Submit within the same second both see a free slot and both get it.

This is the same shape as the save race fixed in migration 0006, one layer up,
and it is not a client-side problem: it can only be answered where the write
happens.

It blocks booking outright, and it quietly blocks anything with a limited
quantity — tickets, appointments, stock.

---

## Part 4 — Everything still missing, ordered by blast radius

| rank | missing | unblocks | size |
| :--- | :--- | :--- | :--- |
| 1 | **Layout model** — containers, stacking, reflow | every site on a phone; landing pages entirely | **large, and it is a rewrite** |
| 2 | **Visitor accounts** — sign-in for the *built* site's users | community, shop, dashboard, anything with "my" | medium, needs a migration |
| 3 | **A private server layer** — Edge Functions | email, payments, API keys, spam guards, AI | medium, unlocks 4–6 |
| 4 | **Uniqueness / no double-booking** | booking, tickets, anything with limited stock | small, needs a migration |
| 5 | **Email** — tell the owner, tell the visitor | contact form, booking, shop, community | small once 3 exists |
| 6 | **Payments** | shop, subscriptions, the whole revenue idea | large, needs 2 and 3 |
| 7 | **Roles and permissions** | dashboards, teams | medium, needs 2 |
| 8 | **Rich text per row** | blog, community | medium |

**Rank 1 is the one the builder has already chosen to do last**, deliberately:
functions first, layout after. Ranks 2–3 are the two foundations everything
below them waits on.

---

## Part 5 — Three things this audit will not pretend

**None of this has been seen running since 16 Aug.** Every `HAVE` above is a
claim about code held up by 1,480 checks and by nothing on the real domain. The
most likely place for that to be wrong is not the logic — it is the editor:
dragging, selecting, the panel, the slash menu.

**Four migrations are `UNPROVED`.** 0004 (per-visitor rows), 0005 (delete a
page), 0006 (two tabs overwriting each other) and 0007 (row limits) are written,
documented and never run. Until they are:

- a shop is blocked on more than payments
- deleting a page explains itself instead of working
- **two tabs still overwrite each other**
- **a published form can still be filled by a script**

**A published page still leaks its webhook URLs.** `get_page` returns the
workflows whole, so anything a builder put in a `sendWebhook` step is readable by
any visitor. That is rank 3's job and it is the one thing here that is a security
hole rather than a missing feature.

---

## How to re-run this

The mechanical half is now `npm run check` — the group *"this audit still
describes the product"* asserts every number in Part 1 against the code, so this
file cannot drift quietly. `node --experimental-strip-types --import
./scripts/register.mjs scripts/inventory-report.ts` prints the same figures with
the names attached.

The half that matters is unchanged: **pick a real website, build it in your head
from the first click to the last, and write down where you stop.** Every gap in
Part 3 of all three audits was found that way. None of them were found by listing
features.
