# Primitive D, ready to build

**Three outputs, not one.** Ranked first in `CONNECTING_THE_TWO.md`: the
smallest of the six, needed by all seven sites on every read, and the only one
that needs no server. Written out here at the level of files and functions so it
can be built without re-deriving it.

---

## The gap, precisely

A Creora block has **a value**. A thing that comes from a store has **three
states**, and only one of them is a value:

```
            ┌── value    the rows, the number
Database ───┼── loading  true while the answer is on its way
            └── failed   the message, and a way to try again
```

Half of this already exists and is unreachable. `BlockRuntimeState` already
carries `loading` and `error`; `setLoading` / `clearLoading` are already
workflow actions. **What is missing is that the language cannot see them.**
`formulaScope` puts `state.value` into scope and nothing else, so:

```
Orders.loading      → not parseable as a reference
```

Every site in the lab wraps every read in a loading state and an error state.
A builder can wire neither.

---

## The shape: a dotted name

```
Orders.loading      true while it is fetching
Orders.failed       true if the last read failed
Orders.error        the message, for showing
Orders.empty        true when it loaded and there was nothing
Orders.count        how many rows came back
```

Five names, one new idea. `Orders.empty` earns its place separately: **"loaded
and empty" and "still loading" look identical on screen today**, and that is the
single most common way a page built by a beginner looks broken.

Why dotted rather than `loadingOf(Orders)`: a bare `Orders` already evaluates to
a value, so a function would receive the value and not the block. The dot is the
only spelling that reaches the block itself.

**And a dotted name is not a member access — it is one name with a dot in it.**
That distinction is the whole implementation, and saying it this way removes a
change to the evaluator entirely. See below.

---

## Where the changes go

### 1. `src/lib/bindingEngine.ts` — `formulaScope`

Add the five per block, under both the name and the id, in the same order the
existing merge uses (names first, ids on top):

```ts
const facet = (key: string, state: any) => {
  scope[`${key}.loading`] = !!state?.loading;
  scope[`${key}.failed`]  = !!state?.error;
  scope[`${key}.error`]   = state?.error ?? '';
  scope[`${key}.count`]   = Array.isArray(state?.rows) ? state.rows.length : 0;
  // "empty" is deliberately false while loading. A page that says "no orders"
  // for half a second before showing five is worse than one that says nothing.
  scope[`${key}.empty`]   = !state?.loading && !state?.error
    && Array.isArray(state?.rows) && state.rows.length === 0;
};
```

`blockValuesByName` in `src/state/atoms.ts` needs the same, so markup and row
formulas get them too — one helper called from both, not two copies. **That is
the drift bug this project has had ten of.**

### 2. `src/lib/formula.ts` — rewrite before parsing, do not touch `walk`

The first draft of this plan added a `MemberExpression` branch to the evaluator.
**Do not.** jsep does parse `Orders.loading` as a MemberExpression — checked, in
every position that matters — but treating it as one is the wrong reading. There
is no object called `Orders` with a property on it; there is a block, and one of
five things you can ask about it.

So: **rewrite the dotted name into a name, before parsing**, exactly the way
`bindSlots` already rewrites `{{Column}}`:

```
Orders.loading and Orders.count > 0
        ↓
__facet0 and __facet1 > 0        with both put into the scope
```

Three things fall out of doing it this way rather than in the evaluator:

- **no change to `walk` at all**, so nothing that works today can break
- it works in **conditions and row formulas for free**, because they all end up
  in `evaluateExpression`
- the escalating-prefix collision fix is **already built and already checked** —
  reuse `bindSlots`'s prefix loop rather than inventing a second one

The rewrite must skip anything inside quotes, which `overSlots` in the same file
already knows how to do — one more caller, not a second scanner. And `1.5` is
safe without special-casing, because the name before the dot must start with a
letter.

Resolution at rewrite time, so the message arrives before the parser gets a
chance to say something less useful:

| what the scope has | what happens |
| :--- | :--- |
| `Orders.loading` | rewritten, value supplied |
| `Orders` but not `Orders.loading` | *"Orders has no loading. It has: …"* |
| neither | *"There is no block called Orders."* |

`identifiersIn` must report `Orders.loading` as one needed name, or Custom HTML
will fetch `Orders` and never the facet — the exact bug the condition-scanning
fix caught last time.

### 3. The fetch paths must actually set the states

Check each and fix what does not:

- `fetchListBlockRows` in `bindingEngine.ts`
- the Database block's own load
- the Live Data (`dataSourceBlock`) fetch

Each needs `loading: true` before, `loading: false` after, and `error` set on
failure **and cleared on success** — a stale error left behind is a page that
says it is broken when it is not.

### 4. The panel has to teach it

One line in the Repeater and Database inspectors, in the pattern
`calcExampleFor` already uses — built from the builder's own block name and
checked by being run:

```
Show while it is fetching:   {{calc: if(Orders.loading, "Loading…", "")}}
Show when there is nothing:  {{calc: if(Orders.empty, "No orders yet", "")}}
```

---

## The checks it needs

In a new group, `a block that fetches has three answers, not one`:

| check | pins |
| :--- | :--- |
| `A BLOCK IS LOADING, FAILED OR ANSWERED — never two at once` | the states are exclusive |
| `and "empty" is false while it is still loading` | the flicker bug |
| `a failed read says why, in a name a formula can reach` | `.error` is a string |
| `THE FACETS ARE REACHABLE BY THE NAME PRINTED ON THE BLOCK` | name resolution |
| `and by its id, because that is what the editor writes` | id resolution |
| `a facet that does not exist NAMES THE ONES THAT DO` | the error message |
| `EMPTY IS NEVER TRUE WHILE LOADING` | the flicker, as a rule not an example |
| `EMPTY IS NEVER TRUE AFTER A FAILURE` | a failed read is not evidence of nothing |
| `refreshing keeps the count it already has` | a list that does not blank itself |
| `a number with a decimal point is not a facet` | the rewrite's edge |
| `a dotted name inside quotes is left alone` | the rewrite's other edge |
| `a facet used only in markup is still fetched` | `identifiersIn` |
| `the fetch sets loading before and clears it after` | the runtime path |
| `AND CLEARS THE ERROR ON A SUCCESSFUL RETRY` | the stale-error bug |
| `a row filter can mention another block’s loading state` | `pageValues` carries facets |

## The controls that prove those checks work

| control | should turn red |
| :--- | :--- |
| drop the facets from `formulaScope` | THE FACETS ARE REACHABLE |
| make `empty` true while loading | "empty" is false while loading |
| stop clearing `error` on success | CLEARS THE ERROR ON A RETRY |
| drop the rewrite pass | THE FACETS ARE REACHABLE |
| let the rewrite run inside quotes | a dotted name inside quotes is left alone |
| leave the facets out of `identifiersIn` | a facet used only in markup |
| return the generic message instead of naming the facets | NAMES THE ONES THAT DO |

---

## Why this one first

It is the only primitive that:

- needs no server and no migration
- is needed by **every** site in the lab, on **every** read
- half exists already, unreachable, which is this project's most familiar shape
  of bug — a capability shipped and never wired to anything

And the thing it fixes is the one a visitor notices first. Tick **slow** in
`lab.html` and watch what a page does with no loading state; that is what every
Creora page does today on a bad connection.


---

## Settled before writing any of it

`facets.js` and `facets.check.mjs` in the lab hold the rules and **18 passing
assertions** over them — the life of one fetch, moment by moment, plus the four
invariants written as rules rather than examples. They exist because the risky
part of this primitive is not the plumbing, it is what the five names mean at
each instant, and that is easy to get subtly wrong and hard to notice.

Two of those cases are worth knowing before starting:

- **refreshing keeps the count it already has**, so a list does not blank itself
  every time it re-reads — which is what a naive "loading replaces everything"
  looks like on a slow connection
- **a retry after a failure is loading AND still failed**, so a page can show
  both, rather than a spinner that hides the reason it is spinning

The jsep parse was checked too, not assumed: `Orders.loading` comes back as a
clean two-Identifier MemberExpression bare, inside `if(...)`, and beside a
comparison.
