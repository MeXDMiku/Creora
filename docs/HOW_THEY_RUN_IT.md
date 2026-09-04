# How Google, Meta, AWS and Microsoft actually state operational intent

**Researched 31 Aug 2026 from published papers, postmortems and the AWS Builders' Library.** No leaks
needed — the public record is richer and more accurate than any leak.

The question: *how does an engineer at these companies say what should happen, and what stops that
statement being wrong?* Because that is exactly what a node system would replace.

---

## 1 · The finding that matters most

**The author of Google's configuration language spent twenty years and concluded he had built it wrong.**

Borg — the system Kubernetes descends from — uses **BCL/GCL**, a *Turing-complete* language that
evaluates into declarative protobuf. Google has "tens of millions of lines of BCL." The Borg paper's
own lessons section admits BCL's ~230 parameters make it hard for casual users and "constrains its
evolution." A 2023 follow-up paper says the same thing again, eight years later: *"with the growth in
complexity the configuration is getting harder to understand and reason about."* Both times the fix was
more tooling on top, never a language change.

Marcel van Lohuizen, BCL/GCL's original author, later built **CUE** — a **non-Turing-complete
constraint and unification language** — explicitly as a reaction. His argument:

- general-purpose config languages mean *"configuration easily becomes non-deterministic"*
- they lack *"constraints and validation of data"*
- unification is *"commutative, associative and idempotent"* — order-independent — unlike inheritance,
  where *"order matters"* and automation gets complicated
- text templating (Helm, YAML) *"manipulates text, not data. As a result, output is often rendered
  without error or indication the configuration is invalid until it is applied to the live system."*

**A node graph with typed slots is a constraint system, not a Turing-complete one.** It is closer to
CUE than to BCL — which is to say it lands where the most experienced config-language designer alive
landed after two decades of watching his own language hurt people.

---

## 2 · But a language only fixes 42% of it

Meta published the numbers, in a peer-reviewed venue, about its own config system causing its own
outages. Their incident taxonomy:

| type | share | could a stricter language catch it? |
| :--- | ---: | :--- |
| **I** — typo / syntax / type errors | **42%** | yes |
| **II** — load and subtlety | 36% | **no** |
| **III** — valid config exposing a latent code bug | 22% | **no** |

And the cross-company synthesis is blunt: the *language* layer contributes almost exclusively at one
step — schema validation at commit time. **Everything else is process and architecture**: canarying,
bake time, cells and blast radius, rate limiting on the actuation side, rollback-safety engineering,
quorum on the config store, kill switches, constant-work propagation.

AWS — whose published corpus is the deepest on this question — has **essentially no language-level
safety story at all.** Their entire narrative is pipeline stages, bake time, cells, static stability
and constant work, applied uniformly regardless of what generated the change.

> **The node system is the 42%. The control plane is the 58%. Neither is the answer alone, and
> nobody ships both.**

---

## 3 · The nine shapes a better intent system must prevent

Synthesised from real outages at Google, Meta, AWS, Cloudflare and Azure. **None of them are grammar
errors.** Every one was syntactically and type-valid, and still wrong.

1. **Stated scope ≠ actual effect.** Google 2019: "a small number of servers" hit many regions.
   Google GCE: "one unused block" withdrew all blocks. Meta 2021: "assess capacity" withdrew all
   capacity. *Fix: force the actual computed target set to be inspectable and independently
   recomputed before commit. Azure's what-if diff is the only close analog and none of the systems
   that failed had one.*
2. **An absent value silently becomes a permissive default.** AWS Seoul DNS. *Fix: safety-critical
   fields have no implicit default, or default fail-CLOSED.*
3. **A correct validator's verdict never reaches the enforcement point.** Google's GCE incident: the
   canary caught it; a bug in the code reading the canary's verdict discarded it. *Fix: two
   independently implemented checks, not one authoritative gate. The strongest single argument in the
   whole corpus.*
4. **Risk conditional on a rare input shape, not on deployment wave.** Google 2025. *Region-by-region
   canarying is provably insufficient when the trigger is a data shape.*
5. **The order of a staged rollout is itself an unvalidated claim.** Cloudflare 2022 put the
   highest-risk cohort last.
6. **Machine-generated artifacts trusted more than human-authored ones.** Cloudflare, November 2025 —
   their #1 remediation item, stated plainly: *"Hardening ingestion of Cloudflare-generated
   configuration files in the same way we would for user-generated input."*
7. **Fleet-global invariants invisible to any single change's diff.** AWS Kinesis 2020. *Needs a
   standing, continuously-checked invariant independent of any review.*
8. **Auto-remediation that cannot tell "this one is broken" from "everything on this build is about to
   break the same way."** Azure 2012. *Automated repair is itself generated intent and needs the same
   rate limits and correlation checks as a human change.*
9. **Rollback assumed safe when it is the riskier path.** Azure 2012's second, self-inflicted outage.
   AWS's entire published rollback doctrine exists because this assumption is false often enough.

---

## 4 · What this says about the AI-agent idea

Item 6 is the whole answer, and it is not theoretical — it is a production outage at Cloudflare in
November 2025 caused by exactly the failure being proposed here, with their own fix stated:
**hold machine-generated configuration to the same bar as untrusted user input.**

So: an AI given a rules file and asked nicely to follow it is the *unhardened* version. Instructions in
a prompt are not a validator. The correct shape, straight from the corpus:

- the agent may only emit **node operations into typed slots** — it cannot write config, SQL, or shell
- every emission is validated by the same schema and the same invariant checks a human's would be
- the **computed effect** is shown before commit (item 1), not the instruction
- **two independent checks**, because one gate's plumbing can be defeated by an unrelated bug (item 3)
- **rate limits on actuation** regardless of input validity (item 8)
- and rollback is treated as a risky path of its own (item 9)

Then it does not matter whether the model read the rules, forgot them, or was talked out of them.
**The illegal operation is not a thing it can say.**

---

## 5 · Nobody has solved this

- Google admitted BCL's problems twice, eight years apart, and bolted tooling on both times. The
  actual redesign happened outside the lineage, by the original author, at a different company.
- Meta published its own outage rate and its own 42/36/22 split.
- Cloudflare's top remediation in late 2025 was "trust our own output less."
- Independent commentary notes Google cycled through several config-delivery strategies without
  settling, and that internal tooling has holes the SRE book implies are filled.

This is an open problem at every company that has the most money and the best engineers in the world.
That is not a reason it is unwinnable. It is the reason it is worth winning.
