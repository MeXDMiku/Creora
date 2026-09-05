# The page — every word, ready to build around

**You build the UI. This is the copy.** Written to the one rule the research established:
*a bid marketplace prices the seller; a productized page prices the problem.* Nothing below
mentions hours, rates, or where you live.

---

## The one sentence, so we both stop losing it

> **Creora tells you who can actually read, write and delete every row in your database —
> as a plain list you can correct — and then keeps checking it stays true.**

That is the product. It is also the service. Everything below is that sentence sold at
three prices.

---

## HERO

### Headline
**Find out what a stranger can take from your app.**

### Subhead
Your database has rules about who can see what. Nobody has ever checked whether they work —
not your tests, not your AI, not your linter. In thirty seconds you will know.

### Primary button
`Run the free check`

### Under the button, small
No signup. Nothing installed. Runs on your machine, using only the key your website already
gives every visitor.

---

## THE PROBLEM — three short blocks

**A wrong rule doesn't throw an error.**
It returns the wrong rows. So it ships, and it keeps working, and nobody finds out until
somebody who isn't you downloads your customer list.

**Your AI can't see this.**
Cursor, Claude, Lovable, Copilot — every one of them writes files. None of them can see your
running system. When an AI fixes a permission it edits a file and tells you it's done. It has
no way to check, and it will sound certain either way.

**And it's not rare.**
1,072 AI-built apps on Supabase were scanned this year. **98% had at least one security
flaw.** 308 shipped their database keys inside their own JavaScript. 172 let a stranger
delete data.

---

## WHY THIS IS DIFFERENT — the section that wins the sale

### Every other scanner reads your rules and tells you what your rules say.

That sounds fine until you notice what it means: a tool that builds its tests **from** your
policies can only ever prove your policy does what your policy says. **It can never tell you
the policy is wrong.**

That matters, because wrong policies are what actually break. The vulnerability that exposed
170+ Lovable apps wasn't a missing rule. It was a rule that existed and was wrong. Every
scanner on the market would have reported it as protected.

**We do the opposite.** We ask your live system what it actually allows, write the answer
down in plain English, and hand it to you:

```
anon              can read     every row of  profiles
anon              can read     published rows of  pages
signed-in user    can update   ANY page, by id
```

**Then you tell us which lines are wrong.** That's the whole job — no code, no policy
language, no reading SQL. And the moment you mark a line, something exists that no tool in
this category has: **a statement of what you meant that didn't come from your code.**

From then on, we check it. Forever.

---

## WHAT YOU GET — three prices, one ladder

| | | |
|---|---|---|
| **The check** | **Free** | What a stranger can reach right now. Runs on your machine. Nothing sent anywhere. |
| **The audit** | **$1,500** | Every table and every function, tested as an outsider, as a signed-in user, and as somebody else's signed-in user. A written report of what is reachable, what your code claims should happen, and every place those two disagree. Delivered in five working days. **The fee comes off the fix.** |
| **The fix** | **from $3,000** | I fix what the audit found, and prove it's fixed by re-running the same tests in front of you. Fixed quote after the audit — never open-ended. |
| **Keep it true** | **$290/month** | Rules break silently when someone edits them later. We re-check yours every week and tell you the day one stops holding. |

*Button under the audit: `Book the audit`. Under the free check: `Run it yourself`.*

---

## THE HONESTY SECTION — keep this, it sells harder than claims

### What this does not check

Every report says so, on every run, including a clean one.

- Not your dependencies, your CI, your hosting or your DNS
- Not logic bugs or race conditions — only who can reach what
- Not whether a rule that exists is the *right* rule; only whether it does what you said
- Secrets that don't announce themselves. A password in a variable called `x` gets missed

**A finding here is a fact. The absence of one is not.** Any tool that goes quiet and lets
you assume you're safe has taught you something false.

---

## WHO THIS IS FOR

- You shipped something built with Lovable, Bolt, Replit, v0 or Cursor and can't read what it wrote
- You run apps for clients and their data is your liability
- An enterprise customer just sent you a security questionnaire
- You have real users and have never once checked what an outsider can reach

**Not for you if:** you want a compliance certificate. This is not SOC 2. This tells you what
is true.

---

## FAQ

**Do you need access to my database?**
No. The free check uses only the key your website already ships to every visitor. For the
audit I need read access, and I'll tell you exactly which permissions and why before you
grant anything.

**Is this safe to run?**
It only reads. No writes, no deletes, no service key, ever. It does the same requests a
visitor's browser already makes.

**How is this different from the free scanners?**
They check a fixed list of things that are usually wrong. This checks whether *your* rules do
what *you* meant. Those find missing rules; this finds wrong ones — and wrong ones are what
actually leak.

**What if you find nothing?**
Then you get a report of exactly what was tested and what was not, and you keep your money on
the fix you don't need. I'd rather you had that than a green tick.

---

## Rules for building this page

1. **No hourly rate anywhere.** Not in the FAQ, not in an email, not ever.
2. **Price in USD**, shown up front. Hiding the price turns this into a bid.
3. **The free check must actually run** and must find something real, or the page is a lie.
4. **One button per section.** The free check and the audit are the only two actions.
5. **No stock photos of padlocks.** Show the actual output — the plain-English matrix is the
   most convincing thing you have, because nobody else can show one.
