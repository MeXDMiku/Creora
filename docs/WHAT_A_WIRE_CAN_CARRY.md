# What a wire can carry, and the graph Creora is not drawing

**24 August 2026.** Prompted by a screenshot of a multi-agent run graph — 19
nodes, **340 edges**, a shared context bus with 14 readers — with the note *"here
is a reference of how messed up nodes can be"*.

It is a good reference, and the first useful thing is that its numbers are
checkable. So this begins by checking them, then reads what eight real node
systems put on a wire, and ends where it matters: **Creora's own canvas draws
five of the fourteen things a page actually depends on, and that fraction is
stable at every size.**

Two bugs came out of it and are already fixed. Both are at the bottom.

---

## 1. The hairball, measured

The screenshot reports `NODES 19 · EDGES 340 · BUS READERS 14`, and its run log
says `graph.load nodes=20 edges=340 · bus.attach ctx=shared readers=14`.

**340 is 99.4% of a complete graph on 19 nodes** (19 × 18 = 342). That makes it
look like everything talks to everything, which would be unfixable — a complete
graph cannot be tidied, because every pair really does talk.

It is not a complete graph. Count the exposed parameters on the five config
nodes down the left — `brief` has five rows, `sources` six, `constraints` four,
`budget` five, `prior runs` four:

```
24 parameters  x  14 bus readers  =  336
reported edges                       340
```

Within 1.2%. **It is a bipartite blow-up, not an all-pairs graph** — one side
values, the other side readers, drawn as every pair. That distinction decides
everything, because a blow-up has a fix.

### Edge count is a product, not a sum

```
now             24 params x 14 readers = 336 edges
+1 parameter    25 x 14 = 350           one slider costs 14 edges
+1 reader       24 x 15 = 360           one node costs 24 edges
double both     48 x 28 = 1344          twice the work, four times the mess
```

The same information, drawn other ways:

| topology | edges | |
| :--- | ---: | :--- |
| bus, drawn as edges — what is on screen | 336 | 100% |
| bus, drawn as **one hub node** | 38 | 11% |
| direct wires, only what each reader uses | 42 | 13% |
| one bundled wire per source | 70 | 21% |

The `GRAPH COST` panel in the corner says `cut 0 · folded 0 · relative cost
100%`. It is telling you that nothing was folded — the picture is admitting it.

### Two thresholds from the literature, and the second is the surprising one

**Twenty nodes.** Ghoniem, Fekete and Castagliola compared node-link diagrams
against adjacency matrices: *"when graphs are bigger than twenty vertices, the
matrix-based visualization outperforms node-link diagrams on most tasks."* The
one task node-link keeps winning is **following a path**. Finding a node,
finding a link, counting links, spotting the most-connected thing — a matrix
wins all of them.

> A canvas is for tracing one path. Every other question a builder has about
> their page wants a different view.

**Crossings stop mattering.** Kobourov et al. found that increasing crossings
*"negatively impacts accuracy and performance time and that impact is
significant for small graphs but not significant for large graphs."* Not because
crossings became harmless — because the drawing was already lost.

> **You cannot route your way out of a hairball.** Tidier layout helps a small
> graph and does nothing for a big one. The only thing that works is fewer edges.

---

## 2. What eight systems put on a wire

### Unreal Blueprints — two kinds of wire with **inverted arity**

Execution pins are white and carry *order*. Data pins are coloured by type and
carry *values*.

|  | fan-in | fan-out |
| :--- | :--- | :--- |
| execution | many — anything can lead here | **one** |
| data | **one** — a value comes from one place | many — anyone may read it |

An exec output takes one wire because two things at once has no order. The
answer is the `Sequence` node, and this is the deep idea:

> **An arity restriction exists to force an ambiguity to be named.** You are not
> forbidden from doing two things; you are required to say which is first.

Creora already has this and did not know it: a workflow's `steps[]` **is** the
Sequence node.

### Blender 5.0 — colour and shape are two different axes

- **Colour = the base type** (geometry, float, integer, …)
- **Shape = the structure** — vertical bar for a single value, diamond for a
  field, circle for something that adapts

And deliberately: shapes *"no longer change dynamically based on connections —
they now remain static, representing the node's expectations rather than current
runtime state."*

> **A port shows a contract. It does not show a state.** Static, so it means the
> same thing every time you look at it.

### Grasshopper — the wire shows how much is flowing

| wire | meaning |
| :--- | :--- |
| single grey line | one item |
| **double** grey line | a list |
| double **dashed** | a tree |
| **orange** | nothing came through |

The first three are cardinality drawn on the wire. The fourth is a *runtime
state* on the wire — the opposite of Blender's decision, and both are right:

> **The port shows the contract. The wire shows the traffic.**

Grasshopper also has three display modes — default, **faint**, and **hidden**
(hidden wires reappear in green when you select a component).

### Max/MSP — three cord kinds, and hide-on-lock

Separate looks for Max messages, MSP audio signals and Jitter matrices. Cords
can be **coloured by the user** to mark parts of a patch, given corners, and set
to **Hide on Lock** — so the wires vanish when the patch is *running* rather
than being edited, and auto-layer behind the objects.

> Wires exist for the builder, not for the person using the thing.

### ComfyUI "Use Everywhere" — the bus, done properly

The most-reached-for answer to the ComfyUI hairball is a broadcast that draws no
wires. A value reaches matching inputs by **type**, by **name**, or by **regex**
— and only inputs that are *unconnected*.

> **The bus is a default; a wire is an override.** That single rule is what the
> reference screenshot is missing.

Links can be toggled visible and are drawn **animated** — moving dots, a pulsing
glow — so a virtual link never reads as a real one.

### Godot — the one that died, and why

Godot removed VisualScript in 4.0. Their reasons, in their words:

1. **The text alternative won.** Users *"found out GDScript was a great fit and
   they pretty much ended up preferring it over VisualScript."*
2. **No high-level components.** *"Even though the visual scripting base
   functionality was there, Godot lacked high level components to make use of
   it. Engines like Unreal, Game Maker or Construct offer high level game
   features packaged together with the visual scripting solution."*
3. **No examples.** The docs never had any.

0.5% of users. And **visual shaders survived** — *"working well and appreciated
by many users, so they're not going anywhere."*

> A node system does not die of its graph model. It dies of **not having enough
> big things to put in the nodes**. Shaders are pure dataflow and thrive. General
> logic is control flow, and needs the nodes to be worth wiring.

That is the same sentence as your tester's *"not much they can do"*, arrived at
from the other direction, and it is an argument for **fewer, larger primitives**
— which is exactly what D, C, A and B have been.

### And the closest comparison of all

**Bubble — the leading no-code web app builder — does not use a node graph for
logic.** It uses ordered workflow steps: *"Workflows handle all logic and
actions… You can build complex logic chains visually."* n8n, Zapier and Make do
use graphs, but those are pipelines *between services* — closer to a shader than
to an app.

> The industry answer for web apps is: **the canvas is for layout, and logic is
> a list of steps.** Creora already has both. The steps are the durable half.

---

## 3. The five channels a wire has — and Creora uses none of them

| channel | says | who does it |
| :--- | :--- | :--- |
| **colour** | what type of thing | Unreal, Blender, Houdini |
| **shape / thickness** | how many — one, a list, a tree | Grasshopper, Blender 5.0 |
| **style** | order versus value | Unreal (white exec vs coloured data) |
| **live tint** | flowing, empty, failed, busy | Grasshopper (orange), ComfyUI (animated) |
| **visibility** | drawn, faint, hidden-until-selected | Grasshopper, Max, ComfyUI |

Creora's entire wire vocabulary is `src/components/WireOverlay.tsx`:

```
stroke="#6366f1"   strokeWidth={2}   strokeDasharray = only while dragging
```

One colour, one width, for every connection on every page. A wire between a
Button and a Database looks exactly like a wire between an Input and a List.

**And Creora already has the runtime states the fourth channel wants.** Primitive
D put `loading`, `failed`, `error`, `empty` and `count` on every block that
fetches. Nothing draws them on a wire.

---

## 4. The graph Creora is not drawing

A page has two graphs and they are not the same one.

- **Drawn**: `connections` — the wires.
- **Real**: those, plus every formula that addresses a block by raw id, every
  `filterBlockId` / `trackedBlockId` / `sortColumnBlockId` set in an inspector,
  every step condition and column mapping, every question's `from`, every
  action's `where`.

`npm run graph` measures both. An X-style home feed, built the way a builder
would build it:

```
nodes            15
drawn edges       5
real edges       14
INVISIBLE         9      64% of what the page depends on is not on screen
bus if drawn     90      (6 formula-holders x 15 blocks in scope)
```

And it does not improve with size — `npm run graph -- --demo`:

```
blocks  drawn   real  invisible   %hidden   bus-if-drawn
     8      2      6          4       67%             32
    20      5     15         10       67%            200
    48     12     36         24       67%           1152
    80     20     60         40       67%           3200
```

**Two of every three dependencies are invisible, at every scale.** That is
structural, not a matter of page size.

### The finding

The screenshot's failure and Creora's failure are opposite ends of one
unanswered question.

|  | reference graph | Creora today |
| :--- | :--- | :--- |
| what is drawn | **everything** | the wires only |
| edges at 80 blocks | ~3,200 | 20 of 60 |
| failure | unreadable | **incomplete** |

> Creora is not at risk of becoming that screenshot. It is at the opposite risk:
> a canvas that looks calm because it is showing you a third of the truth.
>
> Both are the same unanswered question — **which dependencies deserve a line?**

`formulaScope` puts every block's value in scope for every formula, keyed by raw
block id. **Creora already has the shared bus from the screenshot.** It has
simply never drawn it — which is why the canvas stays calm and why moving a
block can break a page with no line to follow.

---

## 5. Seven hard sites, asked of the engine

The method is the one in `BUILT_ONE_TO_FIND_OUT.md` and `BUILT_TWO_TO_FIND_OUT.md`,
used a third time: name the **mechanism** behind each site rather than its
screens, then put every mechanism to the real modules and record what came back.
`npm run sites` re-runs all of it.

The seven were chosen because their mechanisms differ, not their looks:

| site | the thing that is actually hard |
| :--- | :--- |
| **X** | a table that points at itself, and a feed filtered by who follows whom |
| **YouTube** | a long job nobody waits for, and per-viewer progress |
| **Twitch** | state that changes with nobody asking, and a very fast append |
| **Reddit** | a tree of unknown depth, and an order that changes as time passes |
| **Facebook** | a pair that must be mutual, and an audience chosen per row |
| **Gmail** | many-to-many labels, a thread, and a count per label per person |
| **IBM-style B2B** | a transition that may be refused, a trail of who did what, tenancy |

**34 mechanisms asked. The tally after today's two fixes:**

```
11  says it today, in a formula
 6  says it today, as a question
 5  says it today, as an action
 5  written — waiting on a migration that has never been run
 7  CANNOT SAY IT
```

### Three things a previous audit called impossible are not any more

`BUILT_TWO_TO_FIND_OUT.md`, five days ago, listed grouping (trending), unions
(notifications) and dedupe as the three things a real X needs and Creora could
not say. **Primitive A closed all three**, and nothing updated that document —
the same stale-prose failure the queue has had three times now.

### What the seven still cannot say — and it is four things, not seventy

| what | which site | what it needs |
| :--- | :--- | :--- |
| a channel going live while you watch | Twitch | **primitive E** |
| a concurrent viewer count | Twitch | **primitive E** |
| telling an uploader their video finished | YouTube | **primitive E** |
| a nightly digest, billing on the 1st | YouTube, B2B | **primitive F** |
| a comment tree of unknown depth | Reddit | recursion — `MAX_QUESTION_DEPTH` is 2 on purpose |
| a job that takes minutes and reports back | YouTube | somewhere to run work that outlives a request |
| chat at the rate a chat runs | Twitch | a **window** on a table — every row loads into the browser today |

> **Four of the seven are one primitive each: E and F.** The rest are recursion,
> a long job, and a window. That is a much smaller list than "build YouTube".

### And five more are written and simply not switched on

Facebook's per-post audience, one-friendship-per-pair, and B2B tenancy all
**answer correctly** in `ruleAllows` and compile to real policy SQL. None of it
is running, because the migrations have never been run. Today, on those three,
**hiding is not withholding**.

### The one that is better than expected

The B2B case is the strongest result in the whole probe. An approval workflow —
*a state machine with a refusable transition and an audit trail* — needed **no
new idea at all**:

```
Action "Approve quote"  given QuoteId
  remember Was = Quotes.State  where {{id}} == {{QuoteId}}
  refuse when {{Was}} != "submitted"   "Only a submitted quote can be approved."
  change rows in Quotes  where {{id}} == {{QuoteId}}   State = "approved"
  add row to Audit   QuoteId = {{QuoteId}}, Who = Me, What = "approved", At = Now
```

`Me` and `Now` are server words, so **the page cannot write the trail**. That is
the entire point of primitive B, and it arrives free.

---

## 6. Two bugs this found, both fixed

### A refusal that checks nothing switched off the only warning

```
refuse when {{PostId}} == ""                       <- checks nothing
remove rows from Posts where {{id}} == {{PostId}}
```

**No warnings at all, and it deletes anybody's row.** Written the obvious way
while translating "delete my post".

This is OWASP API1:2023, Broken Object Level Authorization — first of ten
because it is the easiest to exploit and the most widespread. Their prevention
rule is one sentence: check the user may act on the record *"in every function
that uses an input from the client to access a record in the database."*

An action is exactly such a function and worse placed than most: it is
`security definer`, so **it runs as the owner and every primitive-C policy is
skipped by design.** The thing that makes an action useful is the thing that
makes a missing check dangerous.

The warning that half-covered this was *"nothing here can refuse"* — a **proxy**,
and a proxy can be satisfied without fixing anything.

**The first fix was wrong, and the checks caught it in one run.** It asked
whether the row *belonged* to the caller. Checkout decrements the stock of
whatever product the visitor named, and that is correct — a product is not
theirs and never will be. Not every row a visitor names has an owner.

What separates checkout from "delete post" is not ownership: checkout **read
that row and refused on what it found**. So the rule is the weaker, checkable
one — *was anything read out of this row, and did anything refuse on it?*
Creora cannot know which check is right. It can know there wasn't one.

### A question could not ask about another table

`runQuery` called `evaluateExpression` with two arguments instead of three, so
`countOf` inside a question answered:

> *"Tables cannot be read from here — countOf and sumOf work in a formula or a
> condition, not in page markup"*

said inside a **question**, naming a third place entirely. The identical wrong
sentence is already recorded in `BUILT_TWO_TO_FIND_OUT.md` about conditions.

An omission, not a decision — nothing said why a question should be weaker than
the repeater filter beside it. Gmail's unread-count-per-label was CANNOT this
morning and is one line now:

```
from    Labels
where   countOf("Messages", '{{Row id}} == MessageId and {{Unread}} == true') > 0
per     {{LabelId}}   keep  count      ->   work=2  bills=1
```

---

## 7. What follows from all of this

Ranked by what the evidence supports, not by what is interesting.

**1 — Hide the wires until they are asked for.** Grasshopper, Max and ComfyUI
all arrived at this independently, and it is the only fix that survives
Kobourov: fewer edges drawn, not better routing. Faint by default; full
brightness for the selected block's own wires. Cheap, and it is the single
largest readability win available.

**2 — Draw the invisible two-thirds, on demand.** Selecting a block should
light every dependency it has — including the ones with no wire: the formulas
naming it, the lists filtering by it, the questions reading it. Today those are
64% of a real page and there is no way to see them at all. This is the one
that stops "I moved a block and something broke".

**3 — Give a wire the two channels that carry the most.** Colour for what kind
of thing flows; thickness or doubling for **one versus many**. Blender and
Grasshopper split those two axes deliberately and Creora currently has neither.

**4 — Then the live tint, which Creora has already built and never drawn.**
Primitive D put `loading`, `failed`, `empty` and `count` on every fetching
block. Grasshopper turns a wire orange when nothing came through. That is the
same idea, and half of it already exists.

**5 — Do not add a bus.** Creora already has one — `formulaScope` — and its
cost drawn out is 3,200 edges at 80 blocks, ten times the reference screenshot.
The rule to take from ComfyUI is not the bus; it is that **a broadcast fills
only unconnected inputs, so a wire always overrides it.**

**6 — Keep the canvas for tracing one path, and answer everything else
elsewhere.** Ghoniem's result is unambiguous: past twenty nodes, path-following
is the *only* task a node-link diagram still wins. "What reads this?", "what is
most connected?", "where is this used?" all want a list. The Health panel is
the right home for those, and it already exists.

**7 — And the Godot lesson, which outranks all six.** That system died with a
working graph model because there was nothing big enough to put in the nodes.
Creora's answer to that is D, C, A and B — four primitives that each do a large
thing in one sentence. **Finish E and F before adding block types.** Four of
the seven sites' remaining gaps are exactly those two.

---

## Sources

Ghoniem, Fekete & Castagliola, *A Comparison of the Readability of Graphs Using
Node-Link and Matrix-Based Representations* · Kobourov, Pupyrev & Saket, *Are
Crossings Important for Drawing Large Graphs?* · Dawson, Munzner & McGrenere,
*A search-set model of path tracing in graphs* · Epic, *Nodes in Unreal Engine*
· Blender, *New Socket Shapes* (Aug 2025) · *The Grasshopper Primer*, Wiring
Components · Cycling '74, *Patch Cords* · ComfyUI *Use Everywhere* · Godot,
*Godot 4.0 will discontinue VisualScript* · OWASP *API1:2023 Broken Object Level
Authorization*.
