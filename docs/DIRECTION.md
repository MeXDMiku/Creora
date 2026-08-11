# Direction notes

Short, and deliberately not a build order. `PROJECT_STATE.md` says what exists.
This says what we are aiming at and what we decided not to do.

## The one sentence

Creora is where you build a page that people can use *together*, in five
minutes, and watch what they do to it, live.

The differentiator is not the editor. It is that a published Creora page runs
on **shared server state** — every visitor sees the same numbers and rows.
Almost every no-code builder gives each visitor a private session instead.

## References, and what to take from each *(11 Aug 2026)*

**Twenty's workflow builder** — trigger, action, if/else, AI agent as nodes,
inspector on the right. Roughly 80% of this already exists here. It is
confirmation the block-and-wire model is right, not a reason to restart.

Worth stealing, roughly in order of value for effort:

1. **Named, typed outputs.** Their AI node publishes `Variable Name: Summary`,
   `Type: Text`, and later nodes reference the name. Creora references blocks by
   id and shows `Button (7b41)` in dropdowns. Naming is a small change with a
   large readability payoff.
2. **If/Else as a visible branch node** with labelled If and Else paths.
   Creora buries conditions inside a workflow step, so the branch cannot be
   seen on the canvas.
3. **Runs and versions.** They have run history, versions, and a Draft /
   Activate distinction. Creora has none, so when a workflow misbehaves there
   is nothing to inspect.
4. **Per-node permissions**, which is the ownership work from Step 3 arriving
   at node level.

**make.design** — a prompt box that produces a design. The useful reframing is
that this is not a competitor to copy: it is *an example of a page someone
could build in Creora* once an AI block exists. Prompt box -> AI block ->
display block. It is the demo, not the roadmap.

**Google Stitch and similar AI design canvases** — take the minimalism of the
interface. Do **not** take the model. A chat box that generates the whole page
is the opposite of a node system where every connection is visible and
adjustable. Only one of those can be the primary way in, and "nothing is
hidden" is the advantage here.

## The AI block, and the trap inside it

Mechanically an AI block is cheap: another block type with an input, a prompt,
and a typed output port. The binding engine already moves typed values between
blocks.

The trap is which version gets built.

| | who pays | what it needs |
| :--- | :--- | :--- |
| AI in the editor | you, your key, your usage | a key in settings |
| AI on a published page | **you**, spent by strangers | a server function to hold the key, plus per-visitor rate limiting |

The key cannot sit in the browser on a published page, so the interesting
version needs a server proxy that does not exist yet, and rate limiting that
needs to know who a visitor is — which is why it sits on top of publishing,
ownership, and identity rather than beside them.

## Deliberately not doing

Carried over from the 10 Aug restructure and still true:

- Desktop app, Tauri, bundled local AI
- The four-mode system (Write / Design / Data / Preview) — there is one mode,
  build, and one output, published
- Real-time collaboration, Y.js
- A Figma-grade scene graph, auto-layout, nested components
- Chat-generates-the-whole-page as the primary interface


## What Creora supplies, and what the user supplies *(decided 11 Aug 2026)*

The user supplies logic and content. Creora supplies the parts that normally
need an engineer: accounts, data, AI, payments. That is the position — not a
design tool.

### No drawing tools. Ever.

Modern-looking output comes from **constraint, not freedom**. Squarespace,
Notion and Linear all look current and none of them handed anyone a Figma.
Infinite freedom requires skill; a small set of choices that cannot be combined
badly does not.

So: no pixel dragging, no arbitrary colours, no font pickers. Instead themes, a
token set, layouts that arrange themselves, and animation as presets attached
to events. This is **less** work than free absolute positioning, not more — it
is bounded rather than open-ended.

Animation is nearly free here: a value changing is already an event in the
binding engine, so `animate on change` is a property on a block rather than a
timeline editor. One primitive, many effects. That is the redstone pattern.

### Few primitives, not many blocks

Redstone has about five parts and people built CPUs from them; Mojang never
added a CPU block. This project drifted the other way — eleven block types,
each capped at two per page, and the power went down.

Power should come from new **kinds of primitive**, not more block types:
`when a value changes`, `for each row`, `on page load`, `every N seconds`.
Four of those combine into hundreds of behaviours. Twenty new block types give
twenty behaviours.

### The three capabilities are not equal

| capability | cost | why |
| :--- | :--- | :--- |
| animation presets | cheap, weeks | value changes are already events |
| AI block | medium | key cannot be in the browser; strangers spend the owner's credits |
| end-user login (Google etc.) | **the real project** | multi-tenant auth, see below |

"My visitors log in with Google" means every visitor of every site anyone
builds becomes an account in **this** Supabase project. That is multi-tenant
auth and it brings: a consent screen saying "Sign in to Creora" rather than the
site's own name until per-site OAuth credentials exist; a membership layer, so
a person is a member *of a site* rather than just a user; per-site profiles and
roles; and the free tier's 50,000 monthly active users being shared across
every site on the platform. This is what Clerk and Auth0 charge for. Understood
work, not research — but it is the largest item on the list and should be
planned as such, not as "add Google login".

Gating AI behind login is the right instinct: an account makes rate limiting
per person possible, which turns an unbounded bill into a capped one. Those two
features want each other.

### They all need the same foundation first

Creora runs entirely in the browser plus database RPCs. There is nowhere
private to run code. But the AI key must be hidden, OAuth secrets must be
hidden, and rate limits must be un-cheatable — all three need a server.

So the next foundation is **one small private place to run code** (Supabase
Edge Functions), proven with the cheapest capability that needs it. Rule 7 in
CLAUDE.md already said every write should go through an Edge Function; it was
never built, and this is where it returns.

**One capability end to end before a second is started.** Five half-built
capabilities are worth nothing.

### The real blocker is layout, not competition

Blocks are stored at fixed x/y and rendered absolutely positioned. That is fine
on a monitor and falls apart on a phone — and "modern website" means "works on
a phone" more than it means anything else. At some point positions stop being
pixels and become stacks, rows and grids that reflow. This is the decision the
old documents deferred repeatedly, and it is the same root as the
TipTap-as-canvas question.

Nothing above is a reason to start it today. It is the reason not to build a
design system on top of x/y coordinates.

## Order

Identity and ownership are done. Next is a Publish button, because
`set_page_published` exists in the database and nothing in the interface calls
it — pages currently cannot be published without hand-calling an RPC. Then one
real public page end to end. Collections, the renderer merge, named outputs and
the AI block all sit after that.
