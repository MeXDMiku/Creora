# A question keeps its answer

`src/lib/query.ts` could already answer a question. This is what makes the
answer **usable**: the question gets a name, and everything on the page that
already knew how to read a table reads the answer too.

```
Sales   (a block)          ByProduct  (a question)
                             from      Sales
                             group by  {{Product}}
                             keep      taken = sum of {{Pence}}
```

and then, with nothing else added anywhere:

* a repeater pointed at **ByProduct** shows the groups
* `sumOf("ByProduct", "taken")` in any formula totals them
* a condition can ask whether **ByProduct** is empty
* a published page answers the same question for a visitor

None of those learned a new word. That is the whole design: *a query is a table
you wrote.*

## What is in the repo

| file | what it does |
| --- | --- |
| `src/lib/queries.ts` | the resolver: names, order, cycles, failures |
| `src/state/atoms.ts` | `queriesAtom` — saved with the page, not with a block |
| `src/lib/bindingEngine.ts` | `tableScope` = the blocks' tables **plus every answer** |
| `src/components/PublishedRenderer.tsx` | a published page loads them too |

`rawTableScope` is the blocks alone. A query is answered over *that*, never over
a scope that already has answers in it — otherwise a query would be reading a
half-built table, whichever ones happened to run first.

## The three ways a named question goes wrong

All three are refused **by name**, because the one complaint every node tool
earns is being told something went wrong without being told where.

**A name that is already taken.** A question may not be called what a block is
called. Two things with one name is how a page shows the wrong one — silently,
and only sometimes. The block keeps its table; the question is told.

**A question about a question.** Allowed, and the ordering is the point: the run
order comes from *what they are about*, not from what order they were typed in.
`Best` can be written above `ByProduct` and still answer second.

**A circle.** Reported, with the loop spelled out —
`A → B → A` — rather than hung on. "Iterations and conditions are difficult to
represent" is the oldest complaint about dataflow programming, and a graph that
silently loops for ever is how a tool earns it.

Nothing in `queries.ts` throws. A page whose fourth question has a typo still
shows the other three, and the failure is readable from the store by the panel:

```
"ByProduct" could not be answered: There is no table called "Salez".
Tables on this page: Sales, Orders
```

## Where this came from

`/nodes` — a node canvas whose nodes run these primitives for real. Building it
is what turned three of the decisions above from taste into necessity:

* **A named reference is invisible to a wire-driven run.** The demo's runner is
  topological over wires, and a Table node reading `ByProduct` has no wire to
  the question that produces it. The order was luck until `withNameEdges`
  recovered the dependency *from the text*. `queryDependsOn` in `queries.ts` is
  the same idea, and exists for the same reason — including the part that reads
  table names out of `sumOf("Orders", …)` inside a formula, which is how a
  dependency hides.
* **A dependency you can see is a dependency you have to draw.** Wiring every
  reference is what turns these canvases into spaghetti at about thirty nodes.
  Names cost nothing to read and never cross.
* **The per-node preview is the feature.** Every review of every one of these
  tools names it, and `previewQuery` exists because of it.

## Still missing

The **panel**. A builder cannot write one of these yet — the eight boxes and the
preview are designed and unbuilt, so today a query can only arrive with a page
blob. That is the next piece, and it is the only thing between this and a
builder using it.
