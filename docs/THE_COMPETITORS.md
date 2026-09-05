# Who already sells this — checked 5 Sep 2026

**Read this before building the free check as if it were new. It is not.**

The honest headline: **the "paste your Supabase URL and key, get a live read/write/delete map"
product already exists, and one version is free.** The field is crowded. What is NOT occupied
is the specific thing this project identified in `THE_ANSWER.md` — and that is now the only
defensible place to stand.

---

## What already exists, verified

| Tool | What it does | Live-probe or code? | Price | Alive? |
|---|---|---|---|---|
| **vibe-eval.com** RLS Checker | Enter a deployed URL; it pulls the anon key from the frontend bundle, probes each table with an anon read, flags unrestricted **read AND write/delete**, "RPC WIDE OPEN," SECURITY DEFINER views | **Live, behavioural** | **Free** scan; platform from **$49/mo** | Yes, Aug 2026 |
| **AuditYour.App** | "RLS logic fuzzing — tries to read/write your tables to prove they are leaky," flags unprotected RPCs and leaked service-role keys | **Live, behavioural** | **Free tier**, $49 one-time, **$29/mo** continuous, $499 expert | Yes, 2026 |
| **Vibe App Scanner** | Scans a deployed app URL read-only; weekly Pro scan "logs in and tries to reach other users' data" | Live, URL-based | Free / $19 / $39 mo | Yes |
| **SupaExplorer** | Chrome extension; enumerates tables and RLS gaps for the app open in your browser | Live, but extension-only | Free (MIT) | Last release Dec 2025 |
| supashield, Sentris, rls-guard, rlsgate, pgTAP, basejump helpers | Developer-run CLIs / test libraries | Code / self-run | Free | Various |

**The closest competitor to our exact business model is AuditYour.App** — free scan → paid
audit → expert tier, testing read *and* write, flagging RPCs. **The strongest free tool a
visitor would compare us to is vibe-eval.com.**

## Supabase's own tools

- **RLS Tester** — still **paused** (announced April 2026), SELECT-only, dashboard-only.
- **Security Advisor / linter** — **static config check only.** ~29 lints. It does not query
  as anon to verify behaviour. So the platform itself still does not do live behavioural
  testing — consistent with everything found about why platforms avoid it.

## Aikido × Lovable

A **$100, one-shot** pentest (blackbox + greybox + **whitebox with source access**), useful
for RLS patterns — but code-based, not an anon-key behavioural product, and **not
continuous.**

---

## What NONE of them do — verified, high confidence

1. **Declare intended access and diff actual-vs-intended.** Found in **zero** tools. Every
   one reports what *is* reachable; none lets you say what *should* be reachable and shows
   the difference. This is the right half of the sentence in `THE_ANSWER.md`, still empty.
2. **Rigorous cross-tenant isolation** — provision two real signed-in users and prove user A
   cannot read user B's rows. Only Vibe App Scanner *gestures* at it; the free tools test
   anon plus at most one authenticated role. vibe-eval explicitly calls cross-tenant
   "limited."
3. **Deep SECURITY DEFINER RPC privilege escalation.** Competitors flag "wide-open" RPCs;
   none maps definer-privilege escalation thoroughly. *(Our `shipped.ts` already grades
   definer functions by whether they check caller identity and follows the call one level
   deep — ahead of the field here, but on code, not yet behaviourally.)*
4. **Project-ownership verification.** No competitor gates on proof of ownership. This is not
   optional politeness — **Supabase's Security Testing policy permits testing your own
   project and prohibits probing projects you do not control.** A hosted service that probes
   with a pasted key *must* verify ownership or it is facilitating exactly what the policy
   forbids. Nobody does it. *(Our `stranger.ts` already refuses a named target without
   `--i-own-this` — the seed of the one gate the whole field is missing.)*

---

## What this changes

**The free check cannot be the product or the claim — it is now table stakes, and free
elsewhere.** It can still be the top of the funnel, but the page must NOT lead with "find out
what a stranger can read." That is a commodity, and a visitor can get it free at vibe-eval.com
in the next tab.

**The claim has to be the four things above, in this order of how buildable-and-defensible
they are:**

1. **Intended-access diff** — "you told us what you meant; here is where your live database
   disagrees." Unoccupied, and it is our original thesis.
2. **Cross-tenant proof** — "we signed in as two of your users and one could read the other's
   data." Unoccupied rigorously, and it is the single most alarming thing you can show a
   founder.
3. **Ownership-gated and continuous** — legally necessary and nobody has it, so it doubles as
   a moat: it is compliance work, not just code, which is harder to copy.
4. **Deep RPC** — where we are already ahead in code.

**Revise `LANDING_COPY.md` accordingly:** the free check stays as the entry, but the headline
and the "why this is different" section move to the diff and the cross-tenant proof. Leading
with the commodity is the one way to lose to a free tool in an open tab.

## The one piece of good news in here

Being late is normal — every example in `HOW_THEY_ACTUALLY_DID_IT.md` was late to its
category. But "late with the same thing" loses. **The competitor check just told us exactly
which four things are not the same thing**, and two of them we have already started building.
That is worth more than finding an empty field, because an empty field usually means no
demand — and here the crowd proves the demand while leaving the hard part undone.
