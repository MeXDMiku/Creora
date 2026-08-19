# What a real site needs, found by building one

**19 Aug 2026.** Written after building a working pottery-studio booking site
from scratch — browse, filter, search, detail pages, booking, waitlists,
cancellation, and an owner's dashboard — and then asking, feature by feature,
**what Creora would need to express it.**

This is a different method from the audit in CAPABILITIES.md. That one walks a
site *in the head* and writes down where it stops. This one builds the site,
runs it, and then tries to translate it. The two disagree in a useful way: the
audit said a blog and a directory were possible now. They are. What it could not
see is that **almost every interesting thing on this site needs one primitive
Creora does not have**, and it needs it in five different disguises.

The mockup is `mockup/clayfield-studio.html` — one file, no build, opens in a
browser. Its `logic.js` is the requirements document; the markup is only proof
the requirements run.

---

## The site, and what each part demands

| what the page does | what Creora needs | today |
| :--- | :--- | :--- |
| a class card shows **who teaches it** | read a field from a row in *another* table | **MISSING** |
| "5 places left" | `Capacity −` count of related rows, **per card** | **MISSING** |
| "★ 4.5 (2 reviews)" | average of related rows, per card | **MISSING** |
| search finds classes **by teacher name** | search across a relation | **MISSING** |
| "best rated first" | sort by a computed value | **MISSING** |
| "hide full" | filter by a computed value | **MISSING** |
| booking is confirmed **or** waitlisted | write a value decided by a count, at write time | PART |
| cancelling **promotes the longest waiter** | update the *oldest* row matching a query | PART |
| "£397 taken" on the dashboard | sum a related row's price across every booking | **MISSING** |
| "you are booked" vs "book" vs "full" | per-visitor rows | written, migration 0004 unrun |
| same person cannot book twice | uniqueness on **two** columns together | PART (0008 does one) |
| the Studio tab only for the owner | show something by role | **MISSING** |
| a full card is greyed, a low one is amber | styling driven by a value | **MISSING** |
| detail page for one class | page parameters | **HAVE** |
| the booking form's rules | validation | **HAVE** + 0009 |
| stat tiles, flash messages, tables | formulas, setText, repeater | **HAVE** |

Fifteen behaviours. Three work today.

---

## The finding: it is nearly all one missing thing

Nine of those rows look like nine features. They are **one**, wearing different
clothes:

> **A formula cannot refer to the row it is standing in when it asks about
> another table.**

Creora already has `countOf` `sumOf` `avgOf` `minOf` `maxOf` `joinOf`, and each
takes a condition. What it cannot do is write the condition that matters:

```
{{calc: Capacity - countOf("Bookings", '{{ClassId}} == ???') }}
                                                      ^^^
                        the id of the class this card is for
```

Inside that condition, `{{ClassId}}` means *the bookings table's* column — which
is right — and there is no way at all to say *"…equals the id of the row I am
rendering"*. The condition is a string; the row is outside it.

Every one of these is that same sentence:

- **who teaches it** → `joinOf("Instructors", "Name", '{{Row id}} == <this class's InstructorId>')`
- **places left** → `Capacity - countOf("Bookings", '{{ClassId}} == <this class's id>')`
- **rating** → `avgOf("Reviews", "Rating", '{{ClassId}} == <this class's id>')`
- **revenue** → for each booking, the price of `<that booking's ClassId>`
- **hide full / best rated** → filter and sort on the results of the above

### And the fix is small

The condition is already evaluated by the same expression engine as everything
else. It is given a scope containing only the aggregated table's row. **Give it
the calling scope underneath**, with `{{Column}}` slots still winning:

```
{{calc: Capacity - countOf("Bookings", '{{ClassId}} == RowId') }}
```

`{{ClassId}}` is the booking being tested. `RowId` is a bare name, so it falls
through to the scope of whatever asked — the class card. No new syntax, no new
block, and it turns six of the nine into one-liners, **including the lookup**:

```
{{calc: joinOf("Instructors", "Name", '{{Row id}} == InstructorId') }}
```

That is a relation, built out of parts that already exist.

---

## What is left after that

Ordered by how many of the fifteen it unblocks.

| rank | missing | unblocks | size |
| :--- | :--- | :--- | :--- |
| 1 | **the calling row inside a table condition** | 6 of the 15 | **small** |
| 2 | **sort and filter a repeater by a formula** | 2 | small |
| 3 | **per-visitor rows** — migration 0004 | 2 | written, unrun |
| 4 | **act on the oldest matching row** | the waitlist promotion | small |
| 5 | **uniqueness across two columns** | one person, one booking | small, extends 0008 |
| 6 | **show something by role** | the owner's dashboard | medium |
| 7 | **style driven by a value** | full/low/open cards | medium, and touches layout |

Ranks 1, 2, 4 and 5 are all small, and together they are eleven of the fifteen.
None of them is a new block type. **The engine does not need more nodes; it
needs the ones it has to be able to see each other.**

---

## What the mockup did *not* need, which is worth knowing

It never wanted a new kind of block. Six block types carried the whole site:
repeater, text, input, button, database, formula. What it wanted, every time,
was for those to **compose** — a repeater whose rows can ask questions about
another table, a formula that can sort a list, a button whose action depends on
a count.

That is the opposite of the instinct to add block types, and it is the second
time this project has learned it: the primitives note in BACKLOG.md says four
triggers combine into hundreds of behaviours while twenty new block types give
twenty. This is the same lesson on the data side.

## How to re-run this

Build a different site — a shop, a class register, a repair-tracker — the same
way: make it work first, then translate. Every gap in this document came from
translating something that already ran. None came from listing features.
