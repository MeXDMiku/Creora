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

**Rewritten 13 Aug 2026 from docs/CAPABILITIES.md, and derived rather than felt.**

The old queue was a list of things that had come up. This one is ordered by
**blast radius** -- how many real site types each missing piece unblocks -- which
is a question with an answer, unlike "what should we do next".

Re-derive it whenever the audit is re-run. If the queue and the audit ever
disagree, the audit is right and the queue is stale.

    !! PROVE MIGRATION 0004           Written, never run. Five steps in
                                      docs/MIGRATION_0004.md. Until this is done
                                      "a shop needs only payments" is a statement
                                      about a file, not about a database.

    -- LIVE VERIFICATION              PAID, 13 Aug. Six cycles owed, then a
                                      browser connected and found two shipped
                                      bugs in ninety seconds. It is now part of
                                      every cycle again, not a debt.

    -- Page parameters                DONE, cycle 8, 13 Aug. The chain closes:
                                      list, click, open with a value, read it,
                                      show that one row.

    -- More input types               DONE, cycle 9, 13 Aug. Ten kinds of field
                                      as ONE setting on the Input block, not six
                                      new blocks. Menu grouped into the three
                                      layers at the same time.

    -- Layout model                   DONE, cycle 10, 13 Aug. Per screen size,
                                      inherited field by field, automatic until
                                      touched. NOT SEEN ON A SCREEN -- the rules
                                      are checked, the feel is not.

    -- Status dashboard (Layer 3)     DONE, cycle 11, 14 Aug, as the Health
                                      panel. It was still sitting at the top of
                                      this queue on 16 Aug, three days after it
                                      shipped -- the second time this list has
                                      described finished work as the next thing
                                      to do. Prose is the one thing in this repo
                                      that nothing checks.

    -- Formula language               DONE, 16 Aug. Was `+ - * / %` over a
                                      `default: return 0`, so `if(...)` and
                                      `Price > 100` both silently answered 0.
                                      Now 30 functions, comparisons that hand
                                      over to evaluateCondition rather than
                                      being written twice, and errors that say
                                      what is wrong. Conditions can be a whole
                                      formula, which is what makes "only when
                                      Qty * Price > 500" sayable at all.

    -- The four primitives            ALL FOUR NOW EXIST, 16 Aug.
                                      `when a value changes` (cycle 12, plus
                                      formulas today -- they were left out of
                                      that fix and were a dead end in the chain),
                                      `for each row` (cycle 3), `every N seconds`
                                      (Timer + Live Data refresh), and
                                      `on page load` (today). The last one had
                                      been recorded as closed by the Live Data
                                      block, which was an overclaim: that block
                                      refreshes ITSELF. Nothing else on a page
                                      could react to the page opening.

    1  Status dashboard (Layer 3)     The Operations layer: what exists, what is
                                      published, what is BROKEN and nobody has
                                      noticed. Fell out of this queue during a
                                      renumber between cycles 8 and 10 and was
                                      not noticed for three cycles -- a plan is
                                      prose, and nothing checks prose.

    2  Visitor accounts               Email sign-in for the users of a BUILT
                                      site. Per-visitor rows exist; this is what
                                      makes them survive a second browser.

    3  A private server layer         Edge Functions. Nowhere to keep a secret
                                      today, which is why email, payments, API
                                      keys, spam guards and AI are all one
                                      missing foundation rather than five.

    4  Email                          Tell the owner, tell the visitor. Small
                                      once 5 exists, and half the ten site types
                                      are unfinished without it.

    5  Roles and permissions          The Discord-style layer. Needs 2.

    6  Payments and entitlements      Needs 2 and 3. Then perks, subscriptions
                                      and commission become settings rather than
                                      projects.

    7  Rich text per row              Blogs and posts need more than one line.

Everything else lives in BACKLOG.md and does not jump this queue without a
reason written down at step 6.

## The one rule that protects all of this

> **No new planning until the current step ships.**

It is the rule that turned 21 days of zero commits into a working deployed
product in three days. It was not new tooling and it was not a better idea. It
was finishing one thing at a time.


## What can and cannot be run from a Linux session

`npm run check` and the typecheck (`node ./node_modules/typescript/lib/tsc.js -p
tsconfig.app.json --noEmit`) are pure JavaScript and run anywhere.

**`npm run build` cannot.** `node_modules` holds
`@rolldown/binding-win32-x64-msvc` — the bundler's native binary, compiled for
Windows. Run from Linux it dies with `MODULE_NOT_FOUND` on the binding, which
surfaces as a bare `Segmentation fault (core dumped)` from `npm run build` and
looks exactly like the VM instability that makes `tsc` crash at random. It is
not that. Retrying will never work; the build has to happen on the machine that
owns the checkout.

So the ceiling on verification from a Linux session is: **typecheck + checks**.
The bundle itself is unverified until somebody runs `npm run build` on Windows.
Nothing in this project has ever broken between those two points, but that is a
record, not a guarantee.

`git push` from a Linux session hits `HTTP 403 from proxy after CONNECT`.
Committing works; pushing is the user's, on Windows.

`git` in that working copy also cannot remove its own lock files
(`Operation not permitted` on unlink). Move `.git/index.lock` and
`.git/HEAD.lock` aside before each git command or the next one fails.
