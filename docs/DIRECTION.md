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

### Defaults are a starting point, never a ceiling *(added 11 Aug 2026)*

A correction from the owner, and it needs recording because it sits right next to
the rule below and could look like a contradiction:

> *"I don't want any default option. A blank screen with all the functions and
> tools there. If the user wants to hide views, show views, show a certain
> amount, or write their own CSS for the view count -- give them the tools."*

Both are true, and the resolution is one sentence: **Creora decides nothing on
the builder's behalf that cannot be undone.**

- "No drawing tools" means the *defaults* are opinionated, so a person who is not
  a designer gets a modern-looking page without choosing anything. That stays.
- It does **not** mean the ceiling is the default. Anyone who knows exactly what
  they want must be able to say it.

So every block now takes **custom CSS**, merged last so it beats everything
Creora computed. Squarespace, Webflow and Notion all work this way: strong
defaults plus a code escape hatch. It is the difference between a tool that is
*opinionated* and a tool that is *restrictive*.

The fence on the hatch: declarations only, no selectors and no media queries.
A block can restyle itself as far as it likes and can never reach out and break
the page around it.

The same principle applies past styling, and is the standing test for any new
feature: **is this a starting point, or a ceiling?** A default anyone can
override is the first. A behaviour nobody can turn off is the second, and needs
an argument.

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

## "Are we just an extension?" — the positioning question *(11 Aug 2026)*

Asked directly: *can Creora let a user build the whole UI, animation and all? If
not, are we just an extension that takes a Figma or AI-made site and makes it
work — which is worrying, because people are making six figures from AI-made
sites alone.*

The premise is true. Lovable, Bolt, v0 and Base44 generate real working sites
with backends today, and at least one solo non-technical founder has scaled a
Lovable-built app to real revenue. That is not a threat to wave away.

But **both halves of the question set up a false choice.**

### Creora should not try to be Figma, and does not need to be

A blank canvas requires skill. Squarespace, Notion and Linear all produce
modern-looking output and none of them hands anyone a drawing tool. What they
give is a small set of choices that cannot be combined badly.

So "can a user build the whole UI here?" — **yes**, the Squarespace way:
templates, themes, tokens, sections, animation presets. Not the Figma way. That
is the existing no-drawing-tools decision, and it is what makes Creora
**standalone rather than dependent**.

This reorders something: **the theme and template layer matters more than the
importer.** If Creora needs a Figma import to produce a decent-looking page, then
it really is an extension. If it has its own good defaults, import becomes a
bonus for the minority who arrive with a design. Import is the optional path, not
the core one.

### Generation and editing are different jobs

An AI builder hands back a **finished, frozen artifact**. For someone who cannot
code, that is excellent at creation and bad at change:

- change one thing → describe it in English again and hope nothing else broke
- something breaks → no way to see why
- wire a real backend safely → CVE-2025-48757: ~1 in 10 analysed Lovable projects
  had Supabase tables any stranger could read

**Generation is a creation technology. Creora is a change technology.** Nobody
finishes a website. Prices change, a form needs one more field, a page gets
added. That is the whole life of a site after day one, and it is where "describe
it and hope" is at its worst.

### So the position is not extension, and not Figma

| layer | who supplies it | status |
| :--- | :--- | :--- |
| looks | Creora, via themes / templates / sections | **the gap that keeps this standalone** |
| looks, if you already have a design | imported shapes, roles assigned | mechanism exists (ShapeBlock roles) |
| logic, data, backend | Creora | the part nobody gives a non-coder |

And the strongest version, already recorded: **AI writes the first draft as a
node graph**, not as code. Then generation and editability stop being opposites.
Generation gets 80% in ten seconds; the nodes get the last 20% without a
developer.

### The real risk, stated plainly

Not that AI generates well — it does, and that is fine. The risk is **AI
*editing*.** If Lovable lets someone say "make the button blue and add a phone
field" and it simply works, then a node graph has to be genuinely *better* than
that, not merely different.

The honest answer to why it can be: nodes win when the change is one you need to
be **sure** about. Money, permissions, whether something actually saved, who can
see what. English-to-code is pleasant for cosmetic changes and frightening for
anything you must verify. That is why Unreal's Blueprints survive next to AI
coding assistants, and why spreadsheet formulas survive next to scripts — a thing
you can see and trust beats a thing you must take on faith, for a lot of people.

**And the one advantage nothing else has:** a published Creora page runs on
shared server state. Every visitor sees the same numbers change. No AI builder
output does that by default, because each generated site gives every visitor a
private session. That is not a design feature, and it cannot be copied by
generating prettier code.

## Order

Done: identity and ownership, the Publish button, one real public page end to
end, a phone layout for published pages, and animation presets.

Next, in the order this document argues for:

1. **Named, typed outputs** — partly done. Dropdowns now show a block's name and
   only append its id when two blocks share a name. What is still missing is the
   Twenty idea proper: a block publishing a *named variable* that later blocks
   reference by name rather than by block id.
2. **If/Else as a visible branch node.** Conditions are still buried inside a
   workflow step, so a branch cannot be seen on the canvas.
3. **Run history.** When a workflow does not fire there is nothing to inspect.
   This is the direct cause of the July debugging sessions, which turned into
   clicking things repeatedly and guessing.
4. **Collections** — rows are still scoped only by `database_block_id`. Delete a
   Database block and its rows orphan in Supabase, unreachable through the
   product, and two pages cannot share data.
5. **An Edge Function layer**, proven with the cheapest capability that needs it.
   The one foundation under AI keys, OAuth secrets and un-cheatable rate limits.
6. **End-user accounts** — the large one. Plan it as multi-tenant auth, not as
   "add Google login".

The layout decision is no longer entirely deferred: published pages stack below
640px. That is the narrow first step, not the full model — blocks are still
stored at fixed x/y, and the editor still positions absolutely. A theme and
token layer should wait until positions are stacks, rows and grids, or the
design work gets done twice.
