# What the interface should teach, and how

**Recorded 13 Aug 2026, from two references the owner supplied. Not a plan to
build now** -- the standing decision is that the visual redesign comes in Phase C,
after capability, because doing it now means doing it twice.

The reason it is written down in this much detail is that a design reference
looked at once and not recorded becomes "make it prettier" three weeks later,
and "make it prettier" is not a brief anybody can build from.

---

## The complaint this is answering

> "our visual teaching is too harsh for users, they can't get things done, they
> can't understand things"

That is not a complaint about colours. It is a complaint that **the interface
does not say what it is doing or what you are allowed to do next**, and the two
references were chosen because they both solve exactly that -- in different ways.

---

## Reference A -- the integration cards

A light, airy card grid. Each card is one connected service.

What is actually working in it:

| what it does | why it teaches |
| :--- | :--- |
| A **status pill with a coloured dot** -- "Connected", "Token expired" | The state is a sentence, not an icon. Red means "you must do something", and it says what. |
| **Two numbers per card, with a tiny label underneath** -- `96 / This week`, `100% / Coverage` | A number with no label is a decoration. A number with a label is a fact. |
| **A toggle in the corner** | The one thing you are most likely to want is where you can reach it, not in a menu. |
| **`2m ago`, `6h ago`** | Freshness is shown without being asked for. You never wonder whether you are looking at something stale. |
| Enormous whitespace, one idea per card | Nothing is crowded, so nothing has to be read twice. |

**The transferable rule: every state has a name, and every number has a label.**

---

## Reference B -- the node editor

A dark graph canvas. This one matters more, because it is the same shape of
product Creora is.

| what it does | what Creora does today |
| :--- | :--- |
| **Ports are named and typed** -- "Audio data in", "Control in", "FX out" | Unlabelled dots. You cannot tell what may connect to what until you try. |
| **Nodes show a preview of what they hold** -- the media thumbnail is in the node | Blocks show their value, which is close, but a Database shows a table and a repeater shows nothing. |
| **Per-node buttons in the header** -- duplicate, hide, delete | Right-click context menu. Discoverable only if you already know. |
| **One Inspect panel**, node title at the top, controls grouped under headings | Creora has this, and it is the closest thing already right. |
| **Named presets, not raw parameters** -- "Rave Mesh", "Corner Net", "Blue Slow" | Every control is a raw number. A named preset is a teaching device: it shows what the parameter is FOR. |
| **A live preview that is always on** | Preview is a mode you switch into. |
| **A status line: `graph valid · 2 media / 13 nodes`** | The Health panel says this, but only when opened. |
| **Zoom: `- + Fit Reset 72%`** | No zoom at all. A page bigger than the window cannot be seen. |

---

## The split that matters

Half of the list above is **styling** and half is **information design**, and
they have completely different costs.

**Styling** -- palette, spacing, shadows, the light card look. This is Phase C.
Doing it before the layout model and the tool categories means doing it twice,
which is the standing decision in DIRECTION.md and has not changed.

**Information design** -- naming the ports, showing state as a sentence,
labelling every number, a persistent status line, zoom. **These are not
cosmetic.** They are the difference between a builder knowing what to do next and
guessing, and several of them are small. The owner could not work out how to get
a typed value into a column (cycle 12) and that was not a colour problem.

**So: the redesign waits. Individual pieces of information design do not have
to, when they are cheap and they unblock somebody.**

Things already done that belong on this list, as evidence the split is real:

- the insert menu grouped into Interface / Data / Operations, with a plain line
  under each (cycle 9)
- the Health panel, which is a status line that has not been made persistent yet
  (cycle 11)
- column mappings that arrive already filled in, and a Connect button that
  refuses and explains (cycle 12)

---

## The one rule to keep from both references

**Nothing is unexplained and nothing is unnamed.**

Every port says what it carries. Every state says what it is in words a person
would use. Every number has a label. Every control that changes something says
what it changes. When something cannot work, it says so where you are looking,
not in a console.

That rule can be applied one screen at a time, for free, forever. The palette
cannot.
