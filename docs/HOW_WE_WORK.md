# How we work

Written 12 Aug, after a fair observation: *"we are currently working on anything
randomly... we need a proper way and structure, from where we start to where we
end."*

Correct, and worth being blunt about. In one session this got built: live data,
webhooks, if/else, aggregates, custom CSS, My Design, Visitor. All useful, all
tested, all committed. **And every single one was chosen because it came up in
the previous message.** That is reactive, not planned. It is a faster and more
productive version of the July drift, but it is the same shape: the newest idea
wins.

This file fixes that. It is the process, and it outranks enthusiasm -- including
mine.

---

## The cycle

One pass = one shippable thing. Never start step 3 of a new cycle before
finishing step 6 of the current one.

**1. VERIFY what already exists**
Open the live site. Load every page. Attack the security model as a stranger.
Nothing new gets built on top of something that quietly broke. Ten minutes,
every cycle, no exceptions.

**2. FIX what verify found**
Bugs before features, always. A bug found and not fixed becomes a bug found
twice.

**3. BUILD exactly one thing**
The top item of the queue below. Not the most interesting one, not the one
mentioned most recently -- the top one. If it turns out to be bigger than a
session, it gets split and re-queued, not half-built.

**4. PROVE it, by running it**
Not a type-check. Not a build. Run the thing: click it, submit to it, attack it,
measure it, open it at 390px. Every real problem this project has ever had was
found this way and none were found by discussion.

**5. RECORD it**
PROJECT_STATE gets what now exists and what is verified against production.
BACKLOG gets what changed. If it is a decision, DIRECTION gets it. A future
session starts cold from these files; anything not written down did not happen.

**6. DECIDE, once**
**This is the only step where new ideas are allowed in.** They get ranked against
the queue and either inserted with a reason, or written to the backlog and left
alone. Then the cycle restarts at 1.

---

## Where new ideas go

New ideas are good. This project's best ones -- the redstone framing, treat it like
Lego, bring your own design, the three layers -- all arrived mid-conversation.

The rule is not "stop having ideas". It is:

> **An idea gets captured immediately and built at step 6.**

Capturing is cheap and takes a minute. Building on impulse costs a cycle and
leaves the previous thing unverified. The July record is 21 days of proof that
the cost is real.

Same for me: if I start building something because it was just mentioned rather
than because it is next, that is a process failure, and saying so is more useful
than the feature.

---

## The phases

Cycles are small. Phases are the arc, and they are ordered because each one is
wasted without the last.

| | phase | done when |
| :--- | :--- | :--- |
| A | **Foundation** -- identity, ownership, publishing, deployment | **done** |
| B | **Capability** -- enough tools to build a real site end to end | a stranger can build a working page without asking for a missing feature |
| C | **Arrangement** -- layout model, then categories, then the UI | the tools are findable and pages work on a phone |
| D | **Polish and launch** -- theme layer, onboarding, pricing | someone pays |

**We are in B.** Note that C contains the visual redesign, and it sits after B on
purpose: doing it now means doing it twice, which is the standing decision in
DIRECTION.md.

---

## The queue

Ordered by how much each unblocks, not by size or appeal. Cycle takes the top.

    1  Validation and form states     required, format, error message, loading,
                                      disable-while-sending. No form is usable
                                      without it and no server is needed.
    2  Images                         upload, display, gallery. Blocks more site
                                      types than anything else.
    3  For each row                   until this exists no list can be laid out,
                                      which blocks blogs, directories, galleries,
                                      search results.
    4  Collections + per-visitor data rows stop belonging to a block, gain an
                                      owner. Opens carts and "my things".
    5  Text and date primitives       join, format, now, add days. Small, needed
                                      by nearly every site.
    6  Search, filter, sort, paginate a table of 500 rows is unusable today.
    7  Real sign-in for visitors      the multi-tenant one. Visitor already
                                      exists; this makes it mean something.
    8  Status dashboard (Layer 3)     what is running, what failed, usage.
    9  Team permissions               independent of 7, cheaper than it looks.
    10 Payments and entitlements      then perks and commission become settings.

Everything else lives in BACKLOG.md and does not jump this queue without a reason
written down at step 6.

---

## The one rule that protects all of this

> **No new planning until the current step ships.**

It is the rule that turned 21 days of zero commits into a working deployed
product in three days. It was not new tooling and it was not a better idea. It
was finishing one thing at a time.
