# What does everyone want that nobody thought was needed?

**4 Sep 2026. Written after re-reading the entire conversation history.**

---

## First, the bad news, stated plainly

**The product we settled on yesterday already exists and is priced.**

[VibeAppScanner](https://vibeappscanner.com/is-lovable-safe) scans apps built with Lovable,
Bolt and Replit. Free scan, "your score and issue counts in about 2 minutes". **$19/month**
for full findings with copy-paste fixes. It also sells continuous monitoring, AI-ready
fixes, security reports and a trust badge. It checks exposed API keys, missing RLS
policies, input validation, security headers, exposed `service_role` keys.

[SupaExplorer](https://github.com/ToritoIO/SupaExplorer) is a Chrome extension that
inspects a page's Supabase traffic live, plus a free leak scanner and security checklist.

So "tell a vibe-coder what their app is leaking" is taken, shipped, and cheap. Anyone who
tells you otherwise has not looked.

**The pain is real and well documented**, which is why the space is filling:
[CVE-2025-48757](https://securityonline.info/cve-2025-48757-lovables-row-level-security-breakdown-exposes-sensitive-data-across-hundreds-of-projects/)
— missing RLS in Lovable — **exposed 170+ applications**. The Moltbook breach leaked
**1.5 million API keys** through a Supabase misconfiguration. *(A widely-shared "380,000
leaking apps" figure was checked and is uncited — do not repeat it.)*

---

## What those products actually are

**A checklist.** A fixed list of things that are usually wrong: no RLS, key in the
frontend, missing header. Valuable, easy to copy, and already commoditised.

> **A checklist knows what is generally wrong. It cannot know what YOU meant.**

"Missing RLS on `documents`" is a checklist item. "**Only the author of a document may
read it — and last Tuesday's migration silently stopped enforcing that**" is not on any
checklist, because it depends on what this particular application is for. No scanner can
produce that finding. The intent was never written down anywhere.

This is the same line that has run through every piece of research in this project:

- Meta's own outage taxonomy: **42%** catchable by a stricter language, **58%** not.
- Microsoft's gray failure: **desired / observed / actual** are three different states.
- This repo, yesterday: `prod.sql` and the migrations disagreed about eight functions and
  **no file on disk could settle which one production was running.**
- Every graphical infrastructure tool stops at *condition → notify*; nobody closes
  *condition → action*.

**The checklist is the 42%. Intent is the 58%. VibeAppScanner is selling the 42% for $19.**

---

## The pattern behind Cursor and Lovable

Neither was a cleverness insight. Both were a **layer** insight.

- **Cursor.** Everyone wanted AI in the editor; Copilot already existed as an extension and
  was boxed in by extension APIs. Cursor forked the whole editor. The unlock was owning the
  *container*, which everyone else assumed was off-limits.
- **Lovable.** Everyone knew AI could write code. Lovable owns no model. It owns the
  **loop** — prompt, running app, look at it, fix it — and charges for the loop while other
  people's models do the work.

**Common shape: take something everyone agrees is valuable, and own a different layer than
everyone assumes you have to.**

---

## The candidate

> **Every AI coding tool in existence writes files. None of them can see the running system.**

Cursor, Claude Code, Copilot, Lovable, Bolt — their entire world model is a repository.
When an AI "fixes" your authorization rule, it edits a file and reports success. It cannot
know whether the change reached production, whether it did what was meant, or whether
something already there overrides it. **It is structurally blind to the only thing that
matters, and it will confidently tell you it is done.**

That blindness is the unowned layer. And it is *new*: for forty years the person who wrote
the code also operated the system, so the feedback loop was a human brain. It has been
broken for about two years.

So:

1. **The intent becomes a file that outlives the prompt.** Plain language, or a graph. It
   lives in the repo next to the code.
2. **It compiles into checks that run against the live system**, not against the source.
3. **The agent can call it** — MCP is the socket, and every one of those tools speaks MCP
   now — and gets a verdict back instead of a guess.
4. **The user is told when a rule that used to hold stops holding.**

Distribution follows from this rather than needing an audience: we do not compete with
Cursor, we plug into it. The checks run on the user's machine, so the marginal cost stays
zero. The finding is verifiable in thirty seconds, so no trust is required up front.

### This is Harsh's own idea, from session 11

> *"we let user pick an cheap API like googles and the AI will be given a MD file
> instructed all the rules it have to follow each message will have that message ai wont
> break or make mistake"*

He proposed the artifact. The only thing missing was the discipline this whole project has
been about: **the rules are checked against reality, not trusted.** An MD file the AI is
told to obey is a hope. An MD file that is compiled and continuously verified is a contract.

### And where the 3D instinct is actually right

It has come up in three separate sessions and been deprioritised three times. It is right
for exactly one thing.

Brooks's test is whether the subject matter is *inherently* spatial. General program logic
is not — that is why visual programming keeps failing. But **reachability is genuinely a
graph**: who can reach what, through which door, holding which key. Drawing that is drawing
the thing itself, not a metaphor for it.

**So: pictures for what a stranger can reach. Text for how rules are written.** That is the
Home Assistant split, and it is the only split with a two-million-home proof behind it.

---

## What has NOT been verified, and must be before a line is written

The research thread that was going to answer this **died mid-flight on a rate limit**, and
this document will not pretend otherwise.

**Unverified:** whether anyone has already built a persisted-intent artifact that keeps
verifying production. The things to check by name: **GitHub Spec Kit**, **Amazon Kiro**,
**Tessl** (Guy Podjarny's spec-centric company), plus **Pact** (does it run against
production or only CI?), **Checkly** ("monitoring as code" — does it assert authorization
rules or only uptime?), **Open Policy Agent** and **Cedar** (enforce at request time, but
do they verify?), and **Antithesis**.

If one of those already keeps intent alive against production for non-experts, this
candidate is dead too, and it is better to find that out in an afternoon than in six months.

**Also still true, and it is the hardest law found in any of this research:**

> The audience that wants a graphical interface has too little money, and the audience with
> money writes code.

Parse died on it. Coolify tops out at ~$13k/month with one person. Any version of this that
serves people who cannot pay will meet the same wall, whatever else is right about it.
