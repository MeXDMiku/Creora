# The five questions that keep coming back

**Answered from the research, 4 Sep 2026. When one of these comes up again, read this
instead of re-deciding.**

---

## 1. Why would anyone buy from the website?

**Nobody buys because they were convinced. They buy because the free check showed them
something true about their own system that they can verify in thirty seconds.**

That is the whole mechanism, and it is why the free check must be real and must run instantly.
The visitor arrives curious and leaves with a problem they did not have five minutes ago —
one they can confirm themselves, without trusting us.

The base rate says it will find something: **1,072 live vibe-coded Supabase apps were
scanned this year and 98% had at least one flaw.** 308 shipped their database keys in their
own JavaScript. 172 allowed a stranger to delete data.

The buyer is never browsing. They are one of:

- someone whose enterprise customer just sent a security questionnaire
- an agency whose client's data is their liability
- someone who just read about a breach in a tool they use
- someone who ran the free check and saw their own table listed

**Only the last one is ours to create — and it is the one that converts.**

---

## 2. How will they find it?

The channel research was brutal and specific. What does **not** work:

| | |
|---|---|
| Cold email at volume | **0.45% reply rate** across 7.5M sends — ~6,250 emails per booked meeting |
| Getting recommended by an LLM | Models used **32–39 unique libraries across 500+ problems**. A new package is not in the weights |
| `llms.txt` | **97% of files across 137,000 domains were never requested once** |
| Show HN | **Median score: 2 points.** Take the free shot, plan nothing around it |
| Twitter from a cold account | A measured **4 impressions** |

What does:

1. **Directories where people arrive with buying intent** — Lovable Solution Partners,
   Supabase Partner Catalog, Vercel Experts, vibecoding.app. All free, all open applications,
   and **not one contains a Supabase-security specialist today.** This is the whole answer to
   "how will they find me" and it takes an afternoon.
2. **Being inside other people's comparisons.** Comparative listicles are roughly **one third
   of all AI citations**. You get recommended by appearing in someone else's "best tools for
   X", not by optimising your own page.
3. **Answering questions people already asked** — the Supabase thread with 68 upvotes open
   since 2022, Upwork postings, the Supabase Discord. Answering an existing question is not
   cold outreach.

---

## 3. Wouldn't Supabase have built it? Wouldn't someone else?

**Supabase did build it. They paused it.**

Their own words, discussion #45233, April 2026: *"We've decided to pause development of this
feature preview while we re-evaluate its direction."* The RLS Tester was SELECT-only by
design, dashboard-only, and structurally blind to `SECURITY DEFINER` functions — which is
where access control in a Supabase app actually lives. Their official testing story, pgTAP,
runs against a **local** database, not production.

**Why they don't finish it:** Supabase sells compute and storage. A tool that tells you your
policies are wrong is a support cost, not a revenue line — and it is a tool whose main output
is "your Supabase database is leaking." Platforms are structurally bad at shipping the thing
that makes them look bad.

**Which is exactly why they partner instead.** In March 2026 **Lovable partnered with Aikido**
to put pentesting inside Lovable at $100 a scan, rather than building it. Platforms build the
free layer and partner for the paid one. That is the door, and it is an application form, not
a pitch.

**And others did try — about twenty of them.** They all built the same half: enumerate the
tables, impersonate an identity, attempt reads, report what came back. Every one derives its
tests **from your policies**, which means it can only ever prove your policy does what your
policy says. It can never tell you the policy is wrong.

That is not an oversight, it is the obvious approach — and it is circular. Breaking it
requires a human looking at a proposed line and saying *"no, that is wrong,"* which is a
product decision, not a technical one. Nobody made it. `rls-guard` gestured at it, got four
points on Hacker News, and stopped at a v0.1 scaffold.

**The honest flaw in our own idea:** we do not yet know that anyone will pay for the
difference. We know they adopt the shape (Firebase's rules-testing library does **872,000
downloads a week**). We do not know they pay. That is what the first $1,500 answers.

---

## 4. B2B or B2C?

**B2B. This is settled by evidence, not preference.**

**Kite shut down with 500,000 monthly active developers.** Their own stated reason: *"our 500k
developers would not pay to use it."* Developer-focused tools convert at a **median 5% —
explicitly half the rate of tools not sold to developers.** Sidekiq has 1,850 paying customers
against **115 million downloads**.

Every bootstrapped winner in the research sold to a company or a business owner, never to an
individual developer.

**So sell to people with something to lose:** agencies carrying client liability, funded
startups with real users, anyone processing payments or personal data. **Never to the
vibe-coder themselves** — one tool in this space monetises at **$5 a report**, and
non-technical builders often never open their Supabase dashboard at all.

---

## 5. How do we make a lot, on subscription like Cursor?

**Honest answer: not the way Cursor does, and the difference is structural.**

Cursor's subscription works because it is opened every day, sold per seat, and the pain is
continuous. An audit is a one-off. A retainer is monthly but low-touch. Pretending otherwise
would be the fifth frame in nine sessions.

**What is genuinely recurring here is narrow and real:** not *"check my app"* but **"tell me
the day something that was true stops being true."** Code changes weekly; an AI edits a
policy and nothing anywhere notices. That is the $290–500/month line, and it recurs for the
same reason monitoring recurs.

The arithmetic, plainly:

| | |
|---|---|
| 70 retainers × $290 | **$20,000/month** |
| 200 retainers × $290 | **$58,000/month** |
| Plus audits at $1,500 and fixes at $3,000+ | on top |

**That is a real business and it is not Cursor.** Cursor needed $11M and 21 months of salaried
iteration through eight failed launches to get where it is.

**Where the Cursor-scale version actually lives** — and this is chapter three, not chapter
one: **Braintrust raised $80M at an $800M valuation in February 2026** for this identical
mechanism aimed at **AI behaviour** rather than database access. Same engine, different
subject, roughly ten times the multiple. You only get to point the engine there by building
it first, on something small enough to be right about.

---

## The thing underneath all five questions

Every one of these is a request for certainty before starting. There isn't any, and there was
none for anyone in the research either — Cursor's founders launched eight times to scores of
1, 2, 4 and 14 before it worked.

**The only instrument that answers "will anyone buy this" is a page with a price on it.**
That costs days, not months, and the answer arrives in weeks.
