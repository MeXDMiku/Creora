# What we are making

**One page. If you read nothing else, read this.**

---

## SETTLED 4 SEP 2026. DO NOT RE-OPEN BEFORE 3 DEC 2026.

Read this section before answering any question about direction.

**The drift had one cause, and it was a question.** Nearly every session asked some
version of *"how does this become a billion-dollar thing?"* Every answer to that question
is a different product, because the question has no stable answer. Five sessions, five
answers, five products: a website builder, a backend, a server manager, a lie detector, a
scanner. The steering input changed weekly, so the product did.

So it is settled below, and **the billion-dollar question is not a valid reason to change
it.** Neither is a competitor announcement, a new model, or a better-sounding frame. Only
these are: a real user says something we did not expect, or a number comes back wrong.

**Who it is for.** Not consumers. Not hobbyists with home servers. The freelancer with
twelve client Supabase projects. The two-person agency shipping apps for clients. The
founder who cannot read the code an AI wrote for them and has just been sent a security
questionnaire by their first real customer. They have money, they cannot audit their own
backend, and they buy without a sales call because the alternative is a $5,000
penetration test.

That is the original vision with one correction: the non-coder we serve is not *someone
with a home server*, it is *someone running a business on an app they cannot read*.

**The order. Do not skip a step to reach a later one.**

1. **Detect.** Free forever, runs on their machine, zero marginal cost. Spreads because
   the finding is worth a screenshot. Requires no trust — they verify it themselves.
   *(`npm run shipped`, `npm run stranger`, `npm run applied` — all three exist.)*
2. **Explain and fix.** The user brings a cheap API key. Nothing runs on our money.
3. **State the rule so it keeps checking.** This is the node graph, and this is the
   subscription. Nobody has this.
4. **Point the same engine at servers instead of databases.** Rules, tuning, restarts.
   Only after step 3 has revenue — it needs per-vendor drivers and it can brick hardware.

**The real risk is not competition or cost. It is false positives.** Four were produced in
a single session on 4 Sep. A security tool believed twice and wrong once is uninstalled.
The discipline is the moat, not the checks: five answers instead of two, what-was-not-
checked printed on every run including a clean one, and every mistake written into the
file that made it.

**Seventy customers at $143/month is $10,000 a month.** That is the target. Not a billion.

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
