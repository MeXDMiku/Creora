# Where the first money actually comes from

**4 Sep 2026. The plan stops being abstract here.**

---

## First: the two stories that started this were both wrong

**"A person made a train app and Google bought it for billions."**
It was **Where Is My Train**, by **Sigmoid Labs**. Google acquired it December 2018 for a
reported **$30–40 million** — not billions, off by roughly **300x**. It was **five
co-founders**, all former **TiVo** engineers, with a team of about ten. It worked *offline*
using cell-tower triangulation and crowdsourced position data. Two to five years of work by
senior systems engineers. **No Indian rail app has ever produced a billion-dollar exit.**

**"A person made Hugging Face and sold it for billions."**
**Three** founders, 2016. The original product was **a chatbot app for teenagers** — it
failed. The model hub was the accidental byproduct of that failure. They raised **over $395
million** and reached ~250 employees. NVIDIA's **$12.93B** agreement was announced **3 Sep
2026 — yesterday** — and does not close until the first half of 2027, pending regulators.

### The count that matters

Built in days · by one person with no prior advantage · sold for over $1B:

> # ZERO. Not one, in the entire dataset.

- **Flappy Bird** — built in 2–3 days. **Never sold.**
- **Wordle** — a weekend build, by a Reddit engineer who had built r/place. Sold for
  **~$1–3 million.**
- **Stardew Valley** — genuinely solo, no advantage. **4.5 years.** Never sold.
- **Plenty of Fish** — genuinely solo, no advantage. **12 years.** $575M.
- **Instagram's** famous "$1 billion" **actually closed at $736M**, with 13 people, after
  Systrom's two years at Google.

**Median team size: 13. Median time to exit: 4.5 years.** The story compresses years into
days, erases teams, and rounds prices up by orders of magnitude.

---

## But the real point was right, and here is the answer to it

> *"The issue isn't making something big, it's finding people."*

Correct. And the finding below is that **the people already exist, the price is already set,
and nobody is standing in the spot.**

### The demand, measured

**Symbiotic Security scanned 1,072 live vibe-coded apps on Supabase backends (2 June 2026):**

- **98% had at least one security flaw.** Only 26 of 1,072 were clean.
- **308 exposed their Supabase keys in JavaScript.**
- **172 allowed unauthorized data deletion. 172 allowed unauthorized modification.**
- **44 exposed callable RPC functions** — *which is the exact thing `npm run shipped`
  already detects in this repo.*

A separate scan of 20,052 indie-directory URLs found an **11% exposure rate**.

### The price list already exists

| | |
|---|---|
| Quick security check | **$500** |
| Full audit + report | **$1,500** |
| Audit + remediation | **$3,000–5,000** |
| Full cleanup package | **$5,000–8,000** |
| Multi-tenant isolation fix | **$3,000–8,000** |
| Average *completed* Upwork rescue project | **~$7,200** |
| Ongoing retainer | **$290–500/month** |

**THE SWARM (Vienna) sells a "Supabase RLS Audit" at €1,500 fixed**, with the audit fee
credited against the fix, then maintenance from €290/month. That is a three-step ladder one
person can run.

### And the spot is empty

**Zero solo operators appear in the vibe-code audit directories. None of the listed agencies
publish a single Supabase or RLS case study.** The niche is named, priced, and unoccupied by
anyone who actually specialises in it.

---

## The one number that decides your income

The same work — multi-tenant JWT isolation, policy rewrites, stress testing — was posted on
Freelancer.com at **$8–15/hour** and drew **33 bids averaging $18/hour**. THE SWARM sells
that identical scope for **€1,500 fixed**.

> **Bid marketplaces price the seller. A productized page prices the problem.**

A funded startup leaking every customer's rows is facing a company-ending event. Nobody
shopping for that fix at $18/hour is a buyer worth having. **Never quote an hourly rate tied
to your geography.** The Lovable partner directory lists an Indonesian agency at $50/hr
beside a Canadian one at $130/hr — geography set the floor, positioning set the ceiling.

---

## The 30-day plan, and the line it does not cross

**The line:** do **not** scan other people's live applications without permission. That is
unauthorised security testing regardless of intent, and it is how this ends badly rather
than profitably. Reading public source code is fine. Probing someone's running database is
not.

**Week 1 — get listed where people are already looking.** All free, all open applications,
none currently containing a Supabase-security solo specialist:
- **Lovable Solution Partner Program** (lovable.dev/experts) — partners publish $50–130/hr
  with $1,000–4,500 minimums
- **Supabase Partner Catalog** — has an "Expert" partner type
- **Vercel Experts Marketplace**
- **vibecoding.app** agency directory — 13 companies listed, no solos

**Week 1–2 — one page, one price.** "Supabase RLS Audit — $1,500 fixed. You get a report of
exactly what a stranger can read, write and delete in your database, and what your code says
should happen instead. Fee credited against the fix." Fixed scope, fixed price, in USD.

**Week 2–4 — the credential you already have.** Run `shipped` and `stranger` on this repo
and write up what they found, including the finding nobody else's tool makes: *every scanner
in this category derives its tests from your policies, so none of them can tell you your
policy is wrong.* That is a case study, and none of the thirteen listed agencies has one.

**Then respond to people who are already asking.** Upwork postings, the Supabase Discord,
the discussion with 68 upvotes open since 2022. Answering a question someone asked is not
cold outreach. Volume cold email is: Belkins measured **0.45% reply across 7.5 million
sends** — about **6,250 emails per booked meeting**.

---

## Why this is the fastest route, and what it compounds into

| Route | Time to first dollar | Month 3 | Month 12 |
|---|---|---|---|
| **Productized Supabase security audit** | **1–3 weeks** | $2–5k/mo | $8–15k/mo |
| Vibe-code rescue retainers | 2–6 weeks | $3–6k/mo | $10–20k/mo |
| Upwork, niched to "Supabase security" | 2–8 weeks | $1.5–4k/mo | $5–10k/mo |
| **The node builder as SaaS** | **6–12 months** | **$0** | $500–3k MRR |
| Generic full-stack bidding | 1–4 weeks | $600–2k/mo | $1.5–3k/mo — **trap** |

**And it compounds, which is why it is not a detour.** Every audit is a real backend that
hardens the tooling. Twenty audits is twenty test cases no competitor has, plus twenty
customers who already pay you, plus the access matrix generator built from real systems
rather than guesses. That is exactly what **11 of 11** bootstrapped companies did: Atlassian
sold the tool it built to run its own support desk; Mailchimp sold to its own agency clients.

**And on being solo with nobody to check the idea:** you do not need important people to
validate it. **The check is a stranger paying $500.** That is available in about three weeks,
and it is a better signal than any advice either of us could get.
