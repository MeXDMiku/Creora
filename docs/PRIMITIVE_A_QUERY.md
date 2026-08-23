# Primitive A, ready to build

**The Query — a named question, answered by the store.** Ranked fourth in
`CONNECTING_THE_TWO.md` and worth designing early because it is the one where
the *language* matters most: a group-by only a programmer can express is not a
feature for this product.

Written out here, and **checked against an answer worked out independently** —
`query.check.mjs` reproduces the entire dashboard, figure for figure, from the
hand-written RPC in `apps-b.js`. 26 assertions, all passing. That is a much
stronger claim than "the code runs".

---

## What it closes

| gap | what it was |
| :-- | :--- |
| 7 | an answer smaller than the data — group-by, buckets, top N |
| 8 | one list drawn from several tables — a union |
| 9 | paging the store does, not the page |
| 10 | one row per value — dedupe |

Four gaps, **one idea**: a list whose rows are not the rows of one table.

---

## The panel: eight boxes, three of them new

Everything except the middle three is already in the repeater's panel today, in
the same words. That is deliberate — the new idea should arrive as three extra
boxes on a familiar form, not as a query builder.

```
  FROM            Sales                          ← already have
  AND FROM        —                              ← NEW: a union
  KEEP ROWS WHERE {{Channel}} != "wholesale"     ← already have
  ONE ROW PER     —                              ← NEW: dedupe
  GROUP BY        left({{At}}, 7)                ← NEW: the buckets
  KEEP            taken = sum of {{Pence}}
                  orders = count
  ORDER BY        {{group}}, first to last        ← already have
  ONLY THE FIRST  5                               ← already have
```

### GROUP BY — what makes two rows the same row

An expression, run per row; equal answers land in one bucket. **Nobody lists the
buckets in advance** — that is the entire point, and the reason "trending"
and "revenue per month" were both impossible.

The result has a column called `group` holding the bucket's value, plus one
column per line of KEEP.

### KEEP — what to work out for each group

Short English, not a function call, because this is the box a non-coder fills
in:

```
count
sum of {{Pence}}
average of {{Rating}}
smallest of {{At}}        largest of {{At}}
first {{Name}}            list of {{Name}}
```

Anything else is refused **by listing what does work**:

> `"total of {{Pence}}" is not something to keep. Try: count, sum of {{Column}},
> average of {{Column}}, smallest of, largest of, first, list of.`

**KEEP with no GROUP BY is one row for the whole table** — "the total", "how
many". Most tools make that a separate feature; here it is the same one with the
grouping left out.

### AND FROM — a union

A second source, whose rows join the same list. `as` maps each source's columns
into one shape, which is what makes the result a table a repeater can show:

```
FROM      Likes    where the post is mine
  as      kind = "liked your post",  who = {{UserId}},    at = {{At}}
AND FROM  Follows  where {{FollowingId}} == Me
  as      kind = "followed you",     who = {{FollowerId}}, at = {{At}}
ORDER BY  {{at}}, last to first
```

That is the notifications feed, which was flatly unsayable.

### ONE ROW PER — and the box next to it

`one row per {{Author}}` is **ambiguous on its own: which row?** The first draft
of this answered "whichever came first", and the check written to prove that
order mattered passed either way — a decorative check, caught by trying to make
it fail.

So the question is asked properly:

```
ONE ROW PER   {{Author}}
KEEPING THE   largest of {{At}}      ← the newest post per author
```

With nothing said it keeps the first it meets, and says so.

---

## Where it runs, and why that is the point

**On the server.** A group-by in the page means downloading every sale to add
them up: fine for 40 rows, ruinous for 40,000, and on a free tier it is the
bill. `query.check.mjs` asserts the answer is smaller than the data, because
that is the property worth having and it is easy to lose.

In Creora that means the Query compiles to a `SECURITY DEFINER` function — the
same shape as `save_page_if_unchanged` — with the row rules still applied, since
a query must not be a way round them.

Until there is a server, a Query can run in the page and still be worth having:
it makes the four gaps *sayable*, and moving where it runs later changes no page
that uses it. **Say it first, move it later** is the right order, and the
opposite order is how a tool ends up with two ways to ask the same question.

---

## Where the changes go

1. **`src/lib/query.ts`** — new, pure, the whole of `query.js` from the lab
   translated: sources → dedupe → group → keep → order → limit. No React, no
   store, so `npm run check` can run all of it.
2. **`src/state/atoms.ts`** — queries live beside `formulas` and `workflows` in
   the page blob: `queriesAtom`, saved and loaded with the page.
3. **`tableScope`** in `bindingEngine.ts` — a query's result appears **as a
   table**, under its name. That one line is what makes every existing thing
   work on it: `countOf("Revenue by month", …)`, a repeater tracking it, a
   formula reading it. *A query is a table you wrote.*
4. **A panel** — the eight boxes, with the KEEP vocabulary listed under the box
   rather than in documentation.
5. **`diagnose.ts`** — a query naming a table or column that is not there, in
   the same shape as the existing filter-formula check.

The third point is the one that makes this small. Nothing else has to learn what
a query is.

---

## The checks it needs

Ported straight from `query.check.mjs`, which already has them:

| check | pins |
| :--- | :--- |
| `BY MONTH, and nobody listed the months in advance` | group-by |
| `with the same figures the hand-written version got` | correctness, against an independent answer |
| `THE TOTAL, with no grouping at all` | keep-without-group |
| `THREE TABLES BECOME ONE LIST, in time order` | union |
| `and rows of different shapes came out the same shape` | `as` |
| `AND THE OLDEST IS A DIFFERENT ANSWER` | `keeping the` really chooses |
| `THE LIMIT IS PART OF THE QUESTION` | the limit is not the page's job |
| `AND THE ANSWER IS SMALLER THAN THE DATA` | the property worth having |
| `a table that is not there names the ones that are` | it refuses usefully |
| `a keep nobody understands lists the ones that work` | so does that |

And the controls: drop the group-by, make `keeping the` ignore its argument,
apply the limit before the order instead of after, let a union skip its `as`.
