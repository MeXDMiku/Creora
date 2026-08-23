# Primitive C, ready to build

**The Rule — who may do what, said once, enforced at the store.**

Ranked second in `CONNECTING_THE_TWO.md` and the **only one of the six that is a
safety problem rather than a convenience**. Everything else being missing makes
a site harder to build. This being missing makes a built site unsafe, in a way
nobody can see from the outside, because hiding a block looks exactly like
withholding a row.

Built and checked in the lab: `rules.js`, **48 assertions**, covering what a
rule *means*, what it *compiles to*, and that the two agree.

---

## What it closes

| gap | what it was |
| :-- | :--- |
| 19 | who may READ a row |
| 20 | who may WRITE a row |
| 21 | which COLUMN a person may see |
| 23 | unique across two columns |
| 24 | a rule the store enforces, not the form |

---

## The panel

Four boxes per table, in the language a builder already writes filters in:

```
Table: Tickets

  READ    when   MyRole == "agent" or {{Author}} == Me
  ADD     when   {{Author}} == Me
  CHANGE  when   MyRole == "agent"
  REMOVE  when   nobody

  ONE ROW PER    SlotId + UserId
```

Three words are free: **anybody**, **nobody**, **signed in**. Everything else is
an ordinary expression over `{{Column}}` and three names about who is asking —
`Me`, `MyRole`, `MyEmail`.

Deliberately **not a new mini-language**. A second syntax for security would be
the opposite of this project's whole argument.

### Column-shaped security is a row rule

```
READ on Messages   when   MyRole == "agent" or {{Internal}} == false
```

A customer sees ordinary replies on their own ticket and never the internal
note. That is why *"just hide the block"* is not a security model, and it needs
no new concept to say.

---

## A rule fails CLOSED, and everything else fails open

Worth stating loudly because it is the opposite of every other formula here.

- A repeater's **filter** that cannot be worked out **keeps every row**. Hiding
  everything looks like a table with no data; showing too much is visible and
  leads somebody to the filter.
- A **rule** that cannot be worked out **refuses**. Showing too much is a leak,
  and a leak is not visible to the person it happens to.

They point in opposite directions on purpose. Somebody reading both will
otherwise think one is a mistake.

**No rule at all means nobody** — Supabase's default and the right one. A store
that is open until you close it has been open in production at least once for
everybody who has ever used one.

---

## The compiler is the half that matters

A rule the browser applies is not a rule. Each table's rules compile to one
idempotent migration, in the shape this project's other migrations already use:

```sql
begin;

alter table public.tickets enable row level security;

drop policy if exists tickets_read on public.tickets;
create policy tickets_read on public.tickets for select
  using (auth.jwt() ->> 'role' = 'agent' or author = auth.uid());

drop policy if exists tickets_insert on public.tickets;
create policy tickets_insert on public.tickets for insert
  with check (author = auth.uid());

drop policy if exists tickets_update on public.tickets;
create policy tickets_update on public.tickets for update
  using  (auth.jwt() ->> 'role' = 'agent')
  with check (auth.jwt() ->> 'role' = 'agent');

drop policy if exists tickets_delete on public.tickets;
create policy tickets_delete on public.tickets for delete using (false);

create unique index if not exists bookings_unique_slot_id_user_id
  on public.bookings (slot_id, user_id);

commit;
```

Three details that are load-bearing and easy to get wrong:

- **insert uses `with check`, update uses BOTH.** `using` alone on an update
  lets a row be changed *out of* your reach — you may edit it, and the edit can
  set the owner to somebody else.
- **"nobody" is a policy saying `false`, not a missing policy.** A missing one
  reads as "not configured yet" to the next person looking.
- **drop before create**, so running it twice is safe and an edit replaces
  rather than duplicates.

### What the compiler refuses

Anything it does not understand must never become `true`. A policy that says
true because a compiler shrugged is worse than no policy, because somebody is
relying on it.

> *"A rule cannot ask about another table. Put the answer in a column on this
> table and compare that, or the database has to run a query for every row it
> looks at."*

---

## The panel warns before any of it is written

Three warnings, all of them seen in real no-code sites:

1. **Nothing can read this table.** Every list will be empty and it will look
   like the data is gone.
2. **Anybody can read a table with a personal-looking column.** Everything in it
   reaches every visitor's browser.
3. **The one nobody expects.** An add-rule of *"signed in"* on a table with an
   owner column lets anybody signed in write a row **in somebody else's name**.
   The warning names the sentence to write: `{{Owner}} == Me`.

---

## Two bugs this found in itself, both worth keeping

**A signed-out stranger matched every ownerless row.** `{{Owner}} == Me` with no
session made `Me` null, and a row with a blank owner made it `null == null` —
**true**.

The leak is bad. The disagreement is worse: Postgres does *not* behave that way.
`owner = auth.uid()` with both null is `NULL`, which a policy reads as refuse.
So the page would have shown what the database hid. **A rule and the policy it
compiles to disagreeing about who may read a row is the one outcome this
primitive must never have.** A rule mentioning `Me` is now false when nobody is
signed in.

**A text value compiled to a column name.** `MyRole == "agent"` came out as
`… = "agent"`, and in SQL double quotes mean an *identifier*. Postgres would
have said *column "agent" does not exist* — or, if a column called `agent`
happened to exist, compared against it and said nothing at all.

It was invisible because **the check covering it had the same mistake written
into its expected value**. A check written from the same wrong idea as the code
cannot catch the code. The replacement asserts the quote kind out loud, and
there is a second one asserting no double quotes survive anywhere.

---

## Where the changes go

1. **`src/lib/rules.ts`** — new, pure: `allows`, `toSql`, `toMigration`,
   `warningsFor`. All of `rules.js` from the lab. No React, no store, so
   `npm run check` runs every line of it.
2. **`src/state/atoms.ts`** — rules live on the Database block's runtime state,
   beside its columns, and travel with the page.
3. **The Database inspector** — the four boxes, the three free words listed
   under them, and the warnings shown inline rather than in the Health panel,
   because this is the moment somebody is deciding.
4. **A "copy the migration" button** — the same shape as
   `RUN_ALL_MIGRATIONS.sql`: one paste, safe to run twice.
5. **`diagnose.ts`** — a rule that cannot compile is a **broken** finding, not a
   warning. It means the table is not protected at all.
6. **`bundleMigrations.ts`** — generated rule migrations join the bundle, so
   there is still one thing to paste.

## The one thing to be careful about

**The panel must not pretend a rule is in force before the migration is run.**
Everything else in this project can be built and used immediately; this one has
a gap between saying it and it being true, and that gap is exactly where somebody
would trust something that is not yet real.

So the block should say which of its rules are **written** and which are
**running**, and the two should not look the same. That is a small piece of
interface with more safety value than the rest of the primitive.
