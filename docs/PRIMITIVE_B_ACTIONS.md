# Primitive B, and the sentence in the design doc it disagrees with

> **B · Actions** — *"Needs a server, which is the real cost."*
> — `CONNECTING_THE_TWO.md`, the ranking table

That sentence is what put Actions third instead of first, and it is wrong in a
way worth writing down: it assumed **server** meant *a place to run code that
somebody has to pay for*.

Creora already has somewhere to put trusted code, already pays nothing for it,
and already trusts it with every row: **a Postgres function on the Supabase free
tier**, in the same database that is holding the tables.

Rules compile to a policy. **An Action compiles to a function.** Same shape,
same migration button, same promise — *written here, enforced there.*

---

## What an Action is

A name, the values a visitor is allowed to hand it, and five kinds of step.

```
Action "Check out"           given  Qty, ProductId

  remember Left   = Products.Stock  where {{id}} == {{ProductId}}
  remember Price  = Products.Pence  where {{id}} == {{ProductId}}
  refuse when {{Qty}} > {{Left}}    "There are not that many left."
  add row to Orders    Customer = Me, Total = {{Price}} * {{Qty}}, At = Now
  change rows in Products  where {{id}} == {{ProductId}}  Stock = {{Stock}} - {{Qty}}
  remove rows from Basket  where {{Customer}} == Me
```

Five step words, deliberately. Everything the lab's seven sites wanted —
checkout, assigning a ticket, taking a booking, closing a thread, a file and its
row going up together — is these five in a different order. A thousand nodes is
the same problem as a thousand functions.

---

## The three things that fall out for free

### 1. The server decides some values

`Total = {{Price}} * {{Qty}}`, where **Price was read from the table inside the
transaction**. A visitor can change `Qty`, because they typed it. They cannot
change `Price`, because they never touched it.

This is the oldest bug in commerce, and today Creora has no way to *not* have
it: a button runs its steps in the browser, so the price is whatever the page
said it was.

The panel says which is which, before publishing:

> **Step 2: Total is whatever the page said (Total).** If that is a price, a
> total, or who did it, a visitor can change it. Read it from a table in an
> earlier step instead, or use Me, MyEmail, MyRole, Now.

**And it does not go off on the right answer.** The warning fires only when
*nothing* in the value is trusted. `{{Price}} * {{Qty}}` is safe because the
price is trusted — a visitor may choose how many they want, and the money still
comes from the table. `{{Total}}` on its own is the bug. A warning that goes off
on the correct spelling is worse than no warning: it is how people learn to
click past them.

### 2. A transition can be refused

`refuse when` is one `raise exception`. "A closed ticket cannot be reopened",
"that slot is taken", "not yours" — sentences a dropdown cannot say, because a
dropdown offers every value it has.

### 3. All-or-none, which is implemented nowhere

A plpgsql function **is one transaction**. A refusal raises; Postgres rolls back
everything before it. Nothing in `actions.ts` implements this — it is
*inherited*, and that is the entire argument for compiling rather than
interpreting. An interpreter would have to get it right. A compiler gets to not
have to.

---

## What is checked, and why it is the only interesting kind of test

Two things that share no code:

| | |
| --- | --- |
| `runAction` | what the **panel previews**, in TypeScript |
| `toFunction` | what **actually runs**, in SQL |

They are held to the same answers on the same actions:

```
the preview answered 4200 because Price came from a table
  AND the SQL multiplies v_price by p_qty
  AND `p_price` appears nowhere in the output
```

If a preview says *"this would refuse"* and the function lets it through, the
preview is a lie — and a confident lie is worse than no preview.

---

## The generated function

```sql
-- Check out: 6 steps, given Qty, ProductId
-- Written in Creora. Until this migration is run, this action is NOT running.
create or replace function creora_check_out(p_qty text, p_productid text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_left text;
  v_price text;
  v_orderid uuid;
begin
  -- step 1: remember
  select stock into v_left from products where id = p_productid limit 1;
  -- step 3: refuse when
  if p_qty > v_left then
    raise exception 'There are not that many left.';
  end if;
  -- step 4: add row to
  insert into orders (customer, total, at)
  values (auth.uid(), v_price * p_qty, now()) returning id into v_orderid;
  ...
end;
$$;

revoke all on function creora_check_out(text, text) from public;
grant execute on function creora_check_out(text, text) to authenticated;
```

`security definer` is what makes it trusted: it runs as the owner, so it writes
tables the visitor's own policies would refuse — the whole reason to move the
work here.

`set search_path = public` is not decoration. A `security definer` function
without one is the standard way to hand somebody else's schema the keys.

`revoke all … from public` is there because a function is callable by default,
and an action nobody has to be signed in for is not an action, it is an
endpoint.

---

## Three names that must never collide

| written | becomes | where it came from |
| --- | --- | --- |
| `{{Qty}}`, a *given* value | `p_qty` | the page — a visitor typed it |
| `{{Left}}`, *remembered* | `v_left` | a table, inside the transaction |
| `{{Stock}}` | `stock` | the row being written |

`p_` / `v_` / bare. The prefixes exist because these three are the same
`{{Name}}` on the builder's screen and must be three different things in the
SQL. Getting it wrong is not a syntax error — it is a price a visitor can set.

---

## Two bugs the checks found that reading would not have

**`At = Now` threw "there is nothing called Now here."** The four server words
are an *action's* vocabulary, not the expression engine's, so an action supplies
them rather than asking the formula language to grow four globals for one
caller. Every refusal check passed while this was broken: a suite that looked
mostly green about an action that could not run at all.

**`{{Slot}}` is only bound in a row context.** Calling `evaluateExpression`
directly answered *"that formula could not be read — check the brackets and
quotes"* about a formula whose brackets were fine. Actions now go through
`rowFormulaValue`, the same evaluator every other box in Creora uses, with the
row as `{ ...scope, ...row }` so `{{ProductId}}` reaches a given value and
`{{Stock}}` reaches the row's own column — **the row wins on a collision**,
because inside a step about a row that is plainly what the name means.

---

## The panel and the call — 24 Aug

Both closed.

**`src/components/ActionsPanel.tsx`** is the screen. What decided its shape: the
primitive exists because a page decides the price, so the difference between a
trusted value and a page value is shown **on the box where it is typed**, not
reported afterwards --

    Total = {{Price}} * {{Qty}}     from the table
    Total = {{Total}}               from the page

`warningsFor` still says the sentence; the marker is what makes the sentence
land on the right line. The preview runs `runAction` against the page's real
tables on every keystroke, which is safe because it writes to a copy.

**`runAction`** is the step. Twenty of the twenty-one workflow actions happen in
the browser; this is the only one that happens at the store.

    functionNameFor(action)   creora_check_out   said once, so the migration
                                                 and the caller cannot disagree
    argsFor(action, given)    { p_qty: '3' }     only what the action DECLARED,
                                                 and a missing one goes as null

A missing value goes as `null` rather than not going: Postgres matches a
function by its argument list, so a short one is a *different function*, and the
error a visitor would meet is "could not find the function" — the message for a
migration that was never run. Two problems must not produce one sentence.

**A refusal is the action working.** `raise exception ... using errcode
'P0001'`, set explicitly rather than leant on. That code, and only that code,
means show the builder's sentence to the visitor exactly as typed.

**And it lands somewhere they are looking.** A Button renders a failure now, in
both renderers, which it did not need to while every failure was a failed row
write.

## What this changes about the order

| primitive | state |
| --- | --- |
| **D** · three outputs | shipped |
| **C** · Rules | shipped; migration written, **never run** |
| **A** · Queries | shipped, panel shipped |
| **B** · Actions | shipped: engine, compiler, panel and the call |
| **E** · when-this-changes | Supabase realtime, free tier, not built |
| **F** · every day at… | the only one with no free answer yet |

**One** of six actually needs somewhere to put code that does not exist, not
two — and it is the one the design doc already called *"wanted everywhere,
blocking nothing."*
