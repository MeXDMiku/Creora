# What we are making

**One page. If you read nothing else, read this.**

---

## The sentence

> **Creora is a node system where what you wire is not a website — it is the rules your
> system must obey. Creora enforces them in your real backend, and keeps checking they
> still hold.**

Same node system. Same Creora. The thing on the other end of the wire changed.

---

## Why that and not a website builder

Because "build a website without code" is being eaten by "describe it and get code",
now, with numbers — Airtable sold at a fifth of its peak, Webflow cut staff naming AI
builders, Lovable went $100M → $500M ARR in ten months. We would be racing people with
146 employees at the thing they are best at.

And because the interesting half was never the building. **AI writes the code now and
walks away.** Nobody tells you the rule it wrote can never fire, or that your policy
denies correctly today and is silently broken tomorrow, or that the green light is green
because the collector died.

---

## Why the node system is right (this was doubted and it should not have been)

The engineer who wrote **Google's own configuration language** — BCL, tens of millions
of lines, the ancestor of Kubernetes — spent twenty years watching it hurt people and
then built **CUE**, a *non-Turing-complete constraint language*, as his correction. His
verdict on general-purpose config: it "easily becomes non-deterministic" and lacks
"constraints and validation of data."

**A node graph with typed slots is a constraint system.** It lands where the most
experienced config-language designer alive landed after two decades.

## And why the node system alone is not enough

Meta published their own config-outage taxonomy: **42%** are things a stricter language
could catch. The other **58%** are load, subtlety, and valid config exposing a latent
bug — fixed only by blast radius, canaries, rate limits, rollback doctrine and standing
invariants. AWS's entire published safety story has *no language component at all*.

> **The node system is the 42%. The control plane is the 58%. Nobody ships both.**

That is the product, and it is why both halves belong in one thing.

---

## What "done" looks like, in order

1. **Stop lying about ourselves.** Every claim this product makes about its own state is
   asked, not remembered. *(started — `npm run applied`)*
2. **State a rule once; enforce it at the store.** Primitive C already does this. Extend
   it so the rule is also *continuously checked*, not just compiled.
3. **The nine failure shapes** in `HOW_THEY_RUN_IT.md` — derived from real outages at
   Google, Meta, AWS, Cloudflare and Azure. That is the build list, not a wishlist.
4. **Then the visuals**, 2D first. The 3D room is the incident view and the demo, never
   the daily driver — every serious product that tried it as a daily driver abandoned it.

---

## Who pays, and how much

Not consumers. **70 companies at $143/month is $10k a month.** Consumer at $5/month needs
sixty to two hundred thousand users. Seventy is a number you can picture.

Developer tools sell bottom-up — one engineer finds it, their company pays later. No
sales team required. And because the checks run on the user's own machine there is no
inference cost and no hosting cost, so nearly every pound of revenue is kept.

---

## The three documents behind this

- `HOW_THEY_RUN_IT.md` — how Google, Meta, AWS and Microsoft actually state intent, and
  the nine ways it goes wrong. **The build list.**
- `WHAT_A_WIRE_CAN_CARRY.md` — why the canvas is for tracing one path and everything else
  wants a different view.
- `CONNECTING_THE_TWO.md` — the six primitives.
