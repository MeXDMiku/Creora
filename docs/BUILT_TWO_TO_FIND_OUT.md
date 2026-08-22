# What a social app needs, found by building one

**19 August 2026.** The second time this method has been used. The first built a
pottery-studio booking site (`BUILT_ONE_TO_FIND_OUT.md`) and found that almost
everything interesting on it was one missing sentence. This one builds a
**working social app** — the shape of thing that is nearly all backend — and
asks the same question.

The mockup is `nib.html`: one file, no build, opens in a browser. Feed, replies,
threads, likes, reposts, follows, profiles, notifications, search, hashtag
pages, trending, who-to-follow, sign-in-as. Its `check.mjs` runs 32 assertions
over `logic.js`; `logic.js` is the requirements document and the markup is only
proof that it runs.

**Four tables and three of them are join tables.** That is what makes this a
harder test than the pottery site, where relations pointed one way:

```
posts   -> users          who wrote it
posts   -> posts          a reply, or a repost — A TABLE POINTING AT ITSELF
likes   -> posts, users   a PAIR, which is a relationship and not a record
follows -> users, users   a pair of the SAME table, twice
```

---

## The method: twenty questions, asked by running them

Rather than reading the code and judging, each question the app asks its data
was **put to the real Creora engine** and the answer recorded. That distinction
matters — three of the results were the opposite of what reading suggested.

### Fourteen already worked

All of these came free from the relation work earlier in the day:

| what the app asks | how Creora says it |
| :--- | :--- |
| like count | `countOf("Likes", '{{PostId}} == RowId')` |
| did I like this | `countOf("Likes", '{{PostId}} == RowId and {{UserId}} == Me') > 0` |
| reply count | `countOf("Posts", '{{ReplyToId}} == RowId')` |
| repost count | `countOf("Posts", '{{RepostOfId}} == RowId')` |
| who wrote it | `joinOf("Users", "Name", '{{Row id}} == AuthorId')` |
| what a repost repeats | `joinOf("Posts", "Body", '{{Row id}} == RepostOfId')` — **the same table** |
| follower count | `countOf("Follows", '{{FollowingId}} == RowId')` |
| following count | `countOf("Follows", '{{FollowerId}} == RowId')` |
| am I following them | `countOf("Follows", '{{FollowerId}} == Me and {{FollowingId}} == RowId') > 0` |
| most-liked first | sort by `countOf("Likes", '{{PostId}} == RowId')` |
| unlike | delete the first row matching `{{PostId}} == P and {{UserId}} == Me` |
| character counter | `280 - len(Box)` |
| "you already posted that" | `countOf("Posts", '{{AuthorId}} == Me and {{Body}} == Box') > 0` |
| posts carrying one tag | `countOf("Posts", 'contains({{Body}}, "#pottery")')` |

**A table pointing at itself needed nothing special.** A reply, a repost and a
thread are the same shape as a relation to another table, where the other table
happens to be this one. That was the result most likely to have gone the other
way.

### Six did not, and four of them were one thing

---

## The finding: a list could not see the page

> **A repeater's filter could reach constants and its own columns. It could not
> reach the page it was standing on.**

```
countOf("Follows", '{{FollowerId}} == Me')
```

→ *"Use {{Me}} to mean a column. A plain name refers to a block, and there is no
block called Me."*

About a block sitting on the same page, with `Me` printed on it.

Almost every list on a real site is filtered by **who is looking**. A home feed.
A cart. "My orders." "People I do not follow yet." None of them were sayable —
and the same gap was why the pottery site's `0004` migration mattered so much,
approached from the other end.

**And the obvious repair is a trap.** Writing `{{Me}}` instead makes the
condition compare the tested row against a column it does not have. That matches
nothing, and reports **no error at all**:

```
rows:  (empty)
error: none
```

An empty list with nothing to explain it. This project's worst failure shape,
reached by writing the most natural thing.

### The second half of the same gap

A condition could not name **its own row's column** either:

```
countOf("Follows", '{{FollowingId}} == AuthorId')
                                      ^^^^^^^^
                    the post doing the asking, not the follow being tested
```

Bare names were deliberately excluded from a row formula's scope, so that
`Price` would fail with *"use {{Price}}"* and teach the syntax. Good message,
wrong rule: **inside a condition the two spellings genuinely mean different
rows**, and there was no way to say the second one.

### The fix

A bare name in a row formula now reaches outward through three layers, outermost
first, each winning over the one before:

1. the blocks on the page, by the name printed on them
2. this row's own columns
3. `RowId` and `RowNumber`

The same order and the same rule as the markup beside it. The teaching survives
where it was actually needed: a *misspelling* reaches none of the three and
still says so.

```
the home feed     {{ReplyToId}} == "" and (AuthorId == Me or
                    countOf("Follows", '{{FollowerId}} == Me and {{FollowingId}} == AuthorId') > 0)

who to follow     RowId != Me and countOf("Follows", '{{FollowerId}} == Me and {{FollowingId}} == RowId') == 0

my likes          countOf("Likes", '{{PostId}} == RowId and {{UserId}} == Me') > 0

a search box      SearchBox == "" or contains({{Body}}, SearchBox)
```

---

## The third gap: a question could not contain a question

"The author of the post this repost repeats" is a lookup inside a lookup.
It was refused — with a message that named the wrong place entirely:

> *"Tables cannot be read from here — countOf and sumOf work in a formula or a
> condition, not in page markup"*

said **inside a condition**.

Conditions can reach other tables now, so two hops work:

```
{{calc: joinOf("Users", "Name",
          '{{Row id}} == joinOf("Posts", "AuthorId", "{{Row id}} == RepostOfId")')}}
```

**And it stops at two.** Each level runs once per row of the level outside it,
so three levels is rows-cubed. Nothing recurses forever — the depth is fixed by
the text somebody typed — but a page that takes nine seconds to draw is broken
in the way that matters, and would be blamed on the data rather than on the
sentence. Three levels refuses and says to store the answer in a column instead.

---

## What still cannot be said

These are real and none of them is a bug. Written down here so they are known
rather than discovered.

### 1. There is no grouping — `trending` is impossible

Every other question counts rows that **already exist**. Trending invents the
rows it counts: it pulls hashtags out of a body of text and groups equal ones,
without knowing the tags in advance.

```
countOf("Posts", 'contains({{Body}}, "#pottery")')     ← works, if you know the tag
the top four tags, whatever they turn out to be        ← nothing in the language
```

The shape needed is **"count rows by the value of an expression"** — a group-by.
It is also what "sales per month", "orders per customer" and "votes per option"
all are, so it is not a social-media feature.

### 2. A list shows one table — notifications need three

```
somebody liked a post of mine     likes,  joined to posts
somebody replied to a post of mine posts, joined to posts
somebody followed me               follows
```

Three different shapes of row, interleaved into one list in time order. A
repeater shows one table. Three stacked repeaters would show three separate
lists in three blocks, which is a different thing from a notifications feed.

The shape needed is a **union**: one list drawing rows from more than one table,
with a shared sort.

### 3. A feed cannot remove a duplicate

The mockup shows a post twice when somebody you follow reposts something already
in your feed. Real X collapses that. A repeater has no "one row per value of
this expression".

### 4. Uniqueness across two columns — still

One person, one like on one post; one follow per pair. Enforceable only in the
database, and that is migration `0008` extended, which has never been run.

---

## Where that leaves the question

> *"if you can make a website like koenigsegg.com, or a working X.com, only then
> is our website fully ready"*

Honest answer, split in two, because they are different tests.

### The X.com test — the engine

**The core loop is expressible now.** Sign in, a feed of the people you follow,
post, reply, thread, like, unlike, repost, follow, unfollow, profile with
counts, search across posts and people, hashtag pages, who-to-follow,
sort-by-popular, "you already posted that". Every one of those is a formula or a
step, and none needs a new block type.

**Three things are not, and one of them a real X needs:** grouping (trending),
unions (notifications), and dedupe. Two of the three are the same underlying
missing idea — *a list whose rows are not rows of one table*.

**And it would not be safe.** Every row a Database block loads reaches the
visitor's browser. On a social app that means every user's data on every page.
Fixing that is `0004` — written, never run — and it is the difference between a
demo and something you would let strangers use.

### The Koenigsegg test — the presentation

Nothing in that site is a data question. It is full-bleed video, scroll-driven
motion, a sticky nav that changes on scroll, image galleries, typography at
three breakpoints, a configurator. **That is the layout and interface phase**,
which is deliberately last, and it is a different kind of work from everything
above — see `KOENIGSEGG_CLASS.md` for what it would actually require.

**The engine is close. The interface has not started.** Those are the two honest
sentences, and they are worth keeping apart.
