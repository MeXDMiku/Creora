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

    npm run check      # 78 checks, runs the real modules
    npm run typecheck

Then the half a machine cannot do: open the live site, load every page, attack
the security model as a stranger. Nothing new gets built on top of something that
quietly broke. Ten minutes, every cycle, no exceptions.

If the live half cannot be done -- browser disconnected, site down -- say so in
the same breath as the result. A cycle that reports "verified" on the local half
alone is the "everything works" failure wearing a clean shirt.

**2. FIX what verify found**
Bugs before features, always. A bug found and not fixed becomes a bug found
twice.

**3. BUILD exactly one thing**
The top item of the queue below. Not the most interesting one, not the one
mentioned most recently -- the top one. If it turns out to be bigger than a
session, it gets split and re-queued, not half-built.

**While live verification is blocked, build what can be proved and queue what
cannot.** Server work -- migrations, RPCs, policies -- cannot be applied from
here and cannot be checked afterwards without a browser, so building it means
shipping it unproven. That is the one reason allowed for taking the second item
instead of the first, and taking it must be written down at step 5 with the
reason, exactly as cycle 4 did.

**4. PROVE it, by running it**
Not a type-check. Not a build. Run the thing: click it, submit to it, attack it,
measure it, open it at 390px. Every real problem this project has ever had was
found this way and none were found by discussion.

Anything that can be checked without a browser goes into `scripts/checks.ts` and
stays there, so the next cycle re-proves it for free. **A new check must be seen
to fail once** -- break the thing on purpose, watch it go red, put it back. A
check that has never failed is decoration.

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

    -- Validation and form states     DONE, cycle 1, 12 Aug.
    -- Images                         DONE, cycle 2, 13 Aug. Display and upload.
                                      Gallery deliberately left to "for each
                                      row" rather than built twice. Uploads need
                                      docs/SETUP_STORAGE.md run once.

    !! LIVE VERIFICATION              SIX cycles owed, and there is now unproven
                                      SQL in the repo. This is no longer a
                                      hygiene debt, it is a correctness one. Nothing has been clicked
                                      on the real domain since 11 Aug. Cycle 3
                                      fixed an XSS that was live, so confirming
                                      that fix on the real domain is now the
                                      first thing worth a browser.

    -- For each row                   DONE, cycle 3, 13 Aug. Gallery falls out of
                                      it, as predicted, via grid layout.
    -- Text and date primitives       DONE, cycle 4, 13 Aug. Taken ahead of
                                      collections because collections cannot be
                                      proved while the browser is down. Filters
                                      inside {{ }}, everywhere slots work.

    -- Per-visitor rows                WRITTEN, cycle 6, 13 Aug. Migration 0004
                                      plus one switch. NOT RUN, NOT PROVED.
                                      docs/MIGRATION_0004.md has the five steps
                                      that would prove it. Do that before
                                      anything else builds on top.

    1  Cross-page collections         rows keyed by a name rather than a block,
                                      so two pages share one list. Half of it
                                      already works: point two blocks at one
                                      tracked id.
    -- Search, filter, sort, paginate DONE, cycle 5, 13 Aug. Controls come from
                                      blocks, so a visitor operates the list.
    2  Real sign-in for visitors      the multi-tenant one. Visitor already
                                      exists; this makes it mean something.
    3  Status dashboard (Layer 3)     what is running, what failed, usage.
    4  Team permissions               independent of 2, cheaper than it looks.
    5  Payments and entitlements      then perks and commission become settings.

Everything else lives in BACKLOG.md and does not jump this queue without a reason
written down at step 6.

---

## The one rule that protects all of this

> **No new planning until the current step ships.**

It is the rule that turned 21 days of zero commits into a working deployed
product in three days. It was not new tooling and it was not a better idea. It
was finishing one thing at a time.
