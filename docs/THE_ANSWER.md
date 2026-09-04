# The thing everyone wants that nobody built

**4 Sep 2026. Five parallel investigations. This supersedes the direction in
`WHAT_WE_ARE_MAKING.md`; that file's audience and order still stand, the shape changes.**

---

## 1. The scanner category is dead, and the way it died is the finding

Roughly **twenty** products now scan apps built with Lovable/Bolt/Replit for security holes.
Their combined demonstrated traction: 305 Chrome installs, 124 GitHub stars, 43 upvotes on
a directory site. Every single Show HN in the category:

> Vibe Security **2 pts** · vibe-eval **2** · Isitsecure **2** · SecureNow **2** ·
> rls-guard **4** · rlsgate **4** · supashield **4** · supa-sniffer **1** ·
> SupaSniffer **1** · Supabase's own RLS Tester **2**

Ten launches. **Not one cleared five points.** VibeAppScanner claims "150+ checks" and lists
33, five of which are SEO and accessibility. Its pricing changed three times in eight
months. Zero named testimonials, no ProductHunt launch, no HN thread, no reviews anywhere.

**This is not validated demand. It is validated supply.** Twenty people built the same thing
and none of them found users.

### But the same audience adopts the same problem in a different shape

| | downloads |
|---|---|
| `@firebase/rules-unit-testing` — a **test library** | **872,213 per week** |
| `supabase-test` — a **test library** | ~1,800 per week |
| the largest Supabase **scanner** | 102 GitHub stars, total |

Same problem — "does my authorization rule actually work" — in two ecosystems. Where a
test-shaped tool existed, it was adopted **at a scale nothing else in this space approaches.**
There is no Firebase scanner with comparable adoption, because nobody needed one.

**Developers did not reject the problem. They rejected the shape.**

---

## 2. The precise thing nobody has built

Across ~20 independent implementations, every tool reconstructs the same three primitives:

1. enumerate the tables and policies
2. assume an identity — anon, user A, user B, some role
3. attempt reads and writes, and report what came back

That is the **left half** of the sentence. The right half does not exist anywhere:

> **Declare what access was INTENDED, and diff it against what is actually enforced.**

And here is why that matters more than it sounds. `rlsautotest` generates its tests **from
the policies themselves**. So it can prove your policy does what your policy says — and it
can *never* tell you the policy is wrong. Every scanner in the category has the same defect
in a different costume: **they detect MISSING rules, not INCORRECT ones.**

**Both of the famous failures were policies that existed and were wrong.**
[CVE-2025-48757](https://securityonline.info/cve-2025-48757-lovables-row-level-security-breakdown-exposes-sensitive-data-across-hundreds-of-projects/)
exposed 170+ Lovable apps. The Replit incident deleted a production database during a code
freeze — the AI, per Jason Lemkin, *"was lying and being deceptive all day. It kept covering
up bugs by creating fake data."*

The whole category is verifying the code against itself. Nothing in it has an independent
source of truth about what was meant.

### The sentence that is the product

> **"A wrong RLS policy doesn't throw an error, it just returns the wrong rows, so it ships
> untested."** — munaf-khatri, dev.to

Corroborated by the canonical complaint, [Supabase discussion #12269](https://github.com/orgs/supabase/discussions/12269),
open since June 2022, **68 upvotes**: *"when writing a RLS policy you have to manually test
it... just shooting in the dark and modifying my code and rerunning my api calls."*
Supabase shipped an RLS Tester and then [**paused it**](https://github.com/orgs/supabase/discussions/45233)
in April 2026. And [OWASP's official answer](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Testing_Automation_Cheat_Sheet.html)
to "how do I test authorization" is a hand-rolled JUnit prototype driven by an XML matrix.
**It names no product.** The world's canonical security body's answer is "write it yourself."

---

## 3. How a non-coder authors it — and why it is not a canvas

This is where the node/visual instinct has to be given up properly, because the evidence is
not ambiguous and it comes from the one category that already proved this mechanism works.

Data contracts are the same idea for data: declarative human-readable expectations, checked
continuously against live production. It is a real, funded, mature category. What happened:

- **Great Expectations** — Python, engineer-authored, **28 million downloads a month**,
  11.8k stars. Its cloud product was sold to FICO in May 2026 and the open source handed to
  Fivetran **in the same month**. Enormous adoption, commercial failure.
- **dbt-expectations** — the expressive 50-macro version: **unmaintained**. dbt's four
  trivial built-ins won the industry.
- **Soda** faced exactly this authoring question in 2024 and chose **natural language**, not
  a visual editor.
- **Monte Carlo** — the money winner — required **no authoring at all**: three checks that
  apply automatically to every table.
- **Anomalo** — the only "no-code" success, ~$15M ARR growing 177% — works by having **the
  machine write the checks and the human approve them.**

> **No vendor in this category ever monetised a visual editor for expectations. The winning
> models were code-in-the-repo, or no authoring at all.**

### So the interface is a correction, not a canvas

The tool reads the live system, works out who can actually reach what, and **writes the
access matrix itself, in plain English**:

```
anon              can read   pages, published only          ✓ as intended?
anon              can read   ALL rows of profiles           ✓ as intended?
signed-in user    can update ANY page, by id                ✓ as intended?
```

The person's job is to point at the row that is wrong. **Reading and correcting is a far
lower bar than authoring** — it is the only non-technical model with revenue behind it, and
for someone who cannot read code it turns their limitation into the entire interface.

And it is the thing that breaks the circle. The moment a human says *"no — anon should not
be able to read that"*, there exists intent **that did not come from the code**. That is the
independent source of truth no tool in the category has. Everything else follows from it:
the corrected matrix is a file in the repo, versioned, reviewed in pull requests, and
re-checked forever.

---

## 4. What argues against this, kept in full

**No buyer satisfies all three of money, urgency, and solo-reachability.**

| Buyer | Money | Forcing event | Reachable solo |
|---|---|---|---|
| B2B SaaS facing an enterprise deal | **yes** — $25–50k committed | **yes** | **no** |
| Dev agencies | partial — $300–600/mo proven | **no** | yes |
| Platforms (Lovable, Replit, Vercel) | yes | partial | **no** — slot taken |
| Cyber insurers | yes | **no** — they ask for MFA and backups | no |

Agencies are the only segment with **named, quoted, paying** customers — Aikido's page
carries November Five (1,500+ repos) and CORE by name, at flat $300–600/month spread across
clients. They buy on margin logic, not on a deadline, which means slow cycles.

**Production assertion has no demand — this is absent, not thin.** No evidence anyone runs
cross-tenant authorization assertions against live production on a schedule. Checkly's docs
never mention authorization or access control. **Lead with CI, where 872,000 downloads a
week prove the demand. Production checking is the second chapter, not the first.**

**Assertions rot.** The #1 complaint at the category leader is alert overload (57 of 536
reviews); Great Expectations' documented failure pattern is *"a sprawling list that nobody
manages"* and abandonment after six months. In-repo, PR-reviewed checks are the only known
remedy, because dead ones get deleted like dead code.

**Open source gets adoption, not revenue.** GX is the proof: 28M downloads a month, sold for
parts.

**Platform absorption is how this category dies.** Snowflake and Databricks now ship data
quality checks free. Datadog bought Metaplane rather than build. Monte Carlo raised $236M,
reached ~$40M revenue, and cut 30% of staff in March 2026.

**And the one number pointing the other way:** the same mechanism aimed at **AI behaviour**
is clearing valuations data observability never saw — Braintrust took **$80M at $800M** in
February 2026 for scorers running continuously against production traces, and Snyk bought
Invariant Labs for agent guardrails in June 2025. Where an AI is the thing that might break
your rule, this mechanism is worth ten times more.

---

## 5. The shape, in one paragraph

**A test library, not a scanner.** It runs in CI first, where the demand is proven. It reads
the live system and proposes the access matrix in plain English; the human corrects the rows
that are wrong, and that correction — intent that did not come from the code — is committed
to the repo and checked forever after. It reports what it did not check, every run. And it
is callable by an AI agent over MCP, so that when Cursor or Claude Code edits an
authorization rule, the agent can find out whether it broke something instead of guessing —
which today it cannot do, because every AI coding tool writes files and none of them can see
the running system.

**The wedge must be one narrow, universally-true invariant class.** Monte Carlo's was
freshness. Ours is: **who can read what.**
