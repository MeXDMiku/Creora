# The one primitive under all of it, and the business model

Written 11 Aug after the owner described what he wants people to be able to
build: YouTube and X style platforms, premium subscriptions with perks for their
own users, and a commission when something big is built on Creora.

Two findings. The first changes the build order. The second answers the money
question.

---

## 1. Everything he described needs the SAME missing primitive

Look at the list — they seem like six separate features:

| what someone wants to build | what it needs |
| :--- | :--- |
| a cart | data that belongs to one visitor |
| "my uploads", "my orders" | data that belongs to one visitor |
| a profile page | who is this visitor |
| a subscriber-only area | who is this visitor, and what have they paid for |
| perks for premium members | who is this visitor, and what have they paid for |
| a YouTube or X style platform | all of the above |

They are one feature. **The current visitor, as a value you can ask questions
about.**

Everything else needed to build those platforms *already exists*:

- showing and hiding blocks — `setVisible` / `setHidden`, working today
- deciding when — many conditions per step, all/any, with negatives, plus
  Otherwise, working today
- data, live updates, external APIs, sending data out — working today
- the visual being entirely the builder's own — My Design, working today

So a subscriber-only area is not a new system. It is
`if {{Visitor.plan}} is "premium" show this block, otherwise show that one` —
and every part of that sentence exists except `{{Visitor}}`.

**That reframes end-user accounts.** It has been sitting in the backlog as the
biggest, scariest item. It is big — it is genuinely multi-tenant auth. But it is
not one feature among many: it is **the single primitive that unlocks an entire
category of website**, and the rest of the machinery to use it is already built
and tested.

### What the primitive actually is

A value, available to conditions and to My Design slots, describing whoever is
looking at the page right now:

    Visitor.signedIn      true / false
    Visitor.id            stable per person
    Visitor.name          if they gave one
    Visitor.plan          free / premium / whatever the builder named
    Visitor.since         when they joined

Plus data scoped to them — the shared / per-visitor switch on a table.

Nothing about that needs new UI concepts. It plugs into the condition system that
already exists, which is what makes it worth building properly rather than as a
special case.

---

## 2. The commission idea is not weird. It is one of the strongest models there is

> *"if one big hit from our website — a person makes Twitch on our platform — we
> can take a bit of commission."*

That is how Shopify, Roblox, the App Store, Substack, Gumroad and Patreon all
work, and it is the best-aligned model in software: **Creora only wins when the
person using it wins.** Nobody resents a percentage of money they would not have
made otherwise. It is much easier to defend than a subscription, and it scales
without Creora having to sell anything.

Three honest things about it.

**It needs Creora to be the payment rail.** A commission on someone else's
revenue is only collectable if the money passes through. The standard mechanism
is Stripe Connect: the builder connects their own Stripe, Creora takes an
application fee on each payment. Stripe carries most of the compliance weight.
This is understood work, not research — but it is real work, and it is the
gateway to this model.

**It pays late.** A percentage of nothing is nothing, and most sites are small.
It is upside, not income. The subscription (**free to build, pay to publish**,
already decided) is what pays while the upside is waiting.

**Both together is the right shape**, and it is what Shopify does: a
predictable subscription plus a percentage of what flows through. Substack's pure
10% works because writers arrive with audiences; Creora's users will not.

### Order

    1  end-user accounts       the primitive above. Unlocks the entire category
    2  payments, Stripe Connect the rail. Makes subscriptions-for-their-users possible
    3  entitlements + gating   nearly free once 1 and 2 exist -- conditions already work
    4  commission              a setting on 2, once anyone is actually earning

Note that step 3, which sounds like the hard part — perks, tiers, members-only
areas — is the cheapest step on the list. It is conditions, and conditions are
done.
