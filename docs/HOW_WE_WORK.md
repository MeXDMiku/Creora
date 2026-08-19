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


## A negative control that comes back green, on this mount

The working copy is a network mount. A control that edits a file and
immediately runs the checks in a subprocess can start reading **before the write
has landed** — the check then runs against the unmodified file and passes, and
the control looks like it found a decorative check when it found nothing at all.

It has happened once, in a batch of five: the fifth control reported zero
failures, and re-running that single control on its own turned two checks red
correctly.

**So a green control is a question, not an answer.** Re-run it alone before
concluding anything. The three real explanations are still worth working
through — the check is hollow, the check is overclaiming, or the control broke
the wrong line — but on this mount there is a fourth, and it is the boring one.

A batch is still worth running; it is only the green results in it that need
repeating.

`scripts/control.mjs` chases this as far as it can be chased: it flushes each
write, then re-reads the file **from a child process** — the same question the
checks are about to ask — before starting anything. It still turns up about once
in a couple of dozen runs, so the tool does the re-run itself: **any result that
is not a clean catch is retried once**, and the report says when it was. Only
bad results are retried, deliberately. Retrying a red one until it goes green is
how a flake becomes a habit.

It also **puts every file back when it is killed**, which was written after
doing the opposite: a run was cut short by a timeout part way through a control
and left a deliberate lie in `src/lib/formula.ts`. The next `npm run check` said
3 failed, and the obvious reading of that — *the work I just did is broken* —
was wrong. That is the most expensive kind of wrong a test tool can be.


## The instrument lied: `'passed,' in output`

The controls above used to be run by a throwaway script that decided whether a
run had finished by asking whether the output contained `'passed,'`.

That string is also in the **name of a check**:

> `and it is negative once it has passed, which is what overdue means`

So a suite that **crashed** — no tally, no exit code read, half the checks never
run — came back as *finished, zero failed*. Two controls were cleared by that
green. One of them was hiding a crash and the other was hiding a check that
could not fail.

The rule this leaves behind is not "be careful with substrings". It is:

**A summary line must be matched as a line, anchored, and its absence must be
its own outcome.**

```js
const TALLY = /^(\d+) passed, (\d+) failed/m;   // ^ and m are the whole point
```

`npm run control` does this, and reports `NO TALLY AT ALL` as a distinct
result that can never be read as a pass.

Two things came out of that crash which are worth keeping:

- **`ran()` in `scripts/checks.ts`.** `check()` takes an already-worked-out
  value, so a check whose expression throws does not go red — it takes the
  process down before `check` is called, and every check after it never runs. A
  crash says *something moved*. A FAIL says *which sentence stopped being true*.
  Anywhere an expression is allowed to be wrong, wrap it.
- **The suite cannot exit without a tally.** A `process.on('exit')` guard prints
  one marked `SUITE STOPPED EARLY` if the last line was never reached, so a
  crash is countable rather than silent.


## Write the control before you believe the check

Two of the checks written for the relation work were caught by their own
controls and neither was caught by reading them:

- `THE TESTED ROW WINS OVER THE CALLER WHERE BOTH HAVE THE NAME` passed with the
  precedence **inverted**. The sentence described a contest that cannot happen:
  a `{{Column}}` slot is rewritten to an invented name before anything resolves,
  so there is nothing for a caller to shadow it with. The check was replaced
  with the guarantee that is actually true, which is stronger.
- Writing the replacement turned up a real bug in the same three lines. The
  invented name was a fixed `__w0`, so a caller value of that name got
  overwritten and `'{{Status}} == __w0'` quietly became `Status == Status` —
  every row matched, and the answer came back as a number. Found by asking
  *what would make this check fail?* rather than *does this check pass?*

And then the same control caught the check going stale an hour later. The
prefix was renamed `__w` → `__slot` during a tidy-up; the check still probed
`__w0`, still passed, and was testing nothing. Nothing about the code was wrong.
The check had simply stopped pointing at it, which is invisible from a green
run and obvious from a control.

**A check that hard-codes an internal detail has to be run against a control, or
it is a comment.**


## The instrument lied a second time, quieter

`npm run control` prints `SUITE STOPPED EARLY` when a run was cut short. It only
printed it on the *passing* branch. So a control that crashed the suite reported

```
  1 failed
  ✗ went red, but not where it should
```

with no red lines under it — which reads exactly like a decorative check, and
was a crash. Half an hour was spent looking for the wrong thing.

Same mistake as the `'passed,'` substring, in a new costume: **the instrument
leaving out the one word that explains the result.** The rule that comes out of
doing it twice is not about substrings or branches. It is:

> **Whatever explains an outcome has to be printed on every path that can
> produce that outcome, including the paths you think are boring.**

There is also now a difference between *the suite crashed* and *the machine
died*. This VM aborts node outright every so often (`Fatal error … unreachable
code`), which skips even the exit handler that guarantees a tally, and looks
identical to a crash from the outside. Told apart by the words V8 prints on the
way down: a VM abort is retried three times and, if it keeps happening, reported
as **unproven** rather than as either a pass or a failure.


## Sweep the sibling, then sweep it again

The relation work rewrote `{{Column}}` slots into invented names. `rows.ts` did
the identical rewrite for a repeater's filter — same regex, same bug, five
hundred lines away. Both now call one `bindSlots`.

That merge is what made the next bug findable. A row formula can contain a table
function whose condition has slots of its own:

```
{{Capacity}} - countOf("Bookings", '{{ClassId}} == RowId') > 0
```

`{{Capacity}}` is this class; `{{ClassId}}` is a booking and belongs to a call
that has not happened yet. A blind scan rewrote both, the condition compared
nothing to something, and **every row was kept** — no error, list unchanged,
filter apparently ignored. `bindSlots` now skips anything inside quotes.

Both halves of that are the same lesson: the bug lived in the seam between two
things that each looked right on their own.
