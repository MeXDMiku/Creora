# The presentation target, written down before the phase begins

**19 August 2026.** The engine work is deliberately first and the interface
last. That is the right order, but "we will do the UI later" is not a plan — it
is a shape with no edges, and it stays that way until somebody writes down what
"done" would mean.

So: a rich marketing site, of the koenigsegg.com class, taken apart into what
Creora would have to be able to express. Not built. **Listed**, so the phase has
a target rather than a vibe, and so the engine work happening now does not
quietly make it harder.

None of this is a data question. Every gap below is presentation, which is why
it belongs after the engine and not instead of it.

---

## What a site of that class is actually made of

| what it does | what Creora would need | today |
| :--- | :--- | :--- |
| full-bleed hero, video or image, text over it | a block that fills the viewport, content layered on top | **MISSING** — blocks are positioned, not layered |
| the nav shrinks and goes solid as you scroll | a value that is "how far down the page are we" | **MISSING** |
| sections fade and rise as they come into view | the same value, per block | **MISSING** |
| a horizontal gallery you drag through | one repeater, laid out across instead of down | **PART** — grid exists, drag-scroll does not |
| specification tables that stay readable on a phone | a table that becomes a list under a breakpoint | **PART** |
| three breakpoints, deliberately, not "it reflows" | per-breakpoint placement | **HAVE** — `layout.ts`, phone/desktop |
| type that scales with the viewport | a size that is a formula, not a number | **MISSING** |
| a configurator: pick a colour, the picture changes | a value driving an image source | **HAVE** — a slot in `src` |
| a model page per car, from one template | page parameters + a repeater | **HAVE** |
| press releases, newest first, paged | a repeater | **HAVE** |
| images that do not cost the visitor 12 MB | sized variants, lazy loading | **MISSING** — and it is a *free-tier* problem too |
| the whole thing at 60fps on a mid-range phone | a budget somebody checks | **MISSING** |

---

## The three that are one thing

**Scroll position is a value the page does not have.** The sticky nav, the
fade-in sections, the parallax and the progress bar are one missing input, used
four ways — exactly the shape the last two of these documents kept finding. A
`Scroll` block whose value is 0–100 would make all four ordinary conditions and
formulas, with no new syntax:

```
nav background    {{calc: if(Scroll > 5, "#000000", "transparent")}}
section opacity   {{calc: clamp((Scroll - 30) / 20, 0, 1)}}
progress bar      style="width: {{calc: Scroll}}%"
```

Style driven by a value already works. The value is what is missing.

---

## The two that are not

**Layering.** Every block on a Creora page occupies its own space. A hero is
text *on top of* an image, and a card is a caption *over* a photograph. Until
blocks can stack in a z-order inside a container, a site of this class cannot be
laid out at all — this is the one genuine blocker on the list.

**Type that scales.** A headline that is 96px on a laptop and 96px on a phone is
broken on the phone. Either a font size can be a formula, or there is a per-
breakpoint size. The second is smaller and probably right.

---

## What this phase is *not*

It is not a theme, a colour palette, or a set of prettier default blocks. Those
are worth having and they are not the blocker. **The blocker is that certain
things cannot be laid out at all**, and no amount of styling reaches them.

And it is not a page builder for the person building Creora. Everything here has
to be sayable by somebody who does not write code — which is why "a value that
is how far down the page you are" is the right shape and "an onScroll handler"
is not.

---

## The order this suggests

1. **Layering inside a container** — the only true blocker.
2. **A Scroll value** — one input, four behaviours.
3. **Per-breakpoint type sizes** — small, and everything looks broken without it.
4. **Image variants and lazy loading** — presentation *and* free-tier cost.
5. **A frame budget somebody checks**, in the way the renderer-drift budget is
   checked, so "it feels slow" becomes a number in a diff.

Items 1–3 are what stands between the current engine and a site that does not
announce that it was made with a builder.
