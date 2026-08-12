# Team permissions — the Discord model for Layer 3

Asked for 11 Aug: a sub-layer of Operations for **other people who work on the
site with you**. Like a Discord server — give one developer permission to see and
change some things, not see others, and never modify certain ones.

This is a real, well-shaped feature. Two things about it are worth knowing before
anyone starts.

---

## 1. This is NOT the same as end-user accounts, and it is far cheaper

They sound similar and they are not:

| | who | cost |
| :--- | :--- | :--- |
| **end-user accounts** | visitors logging in to a site *someone built* | multi-tenant auth. The largest item on the whole list |
| **team permissions** | other builders working on *your* site | membership plus permission checks |

Builder identity **already exists** — email sign-in works, every page has an
`owner_id`, and ownership is enforced and attack-tested. Team permissions is
adding a second way to answer "may this person do this", next to the one that is
already there. It needs no new auth system.

That makes it much smaller than it looks, and it does **not** have to wait behind
end-user accounts.

## 2. The permissions themselves

Discord's actual insight is not roles, it is that **roles are bundles of
capabilities**, and the capabilities are what the system checks. Same here:

| capability | means |
| :--- | :--- |
| `page.view` | open this page in the editor at all |
| `design.edit` | move, resize, style, custom CSS, My Design markup |
| `logic.edit` | wires, workflows, conditions, the Otherwise branch |
| `data.view` | see the rows in a table |
| `data.edit` | add, change and delete rows |
| `publish` | publish and unpublish |
| `settings.manage` | domain, sign-in, integrations, webhook addresses |
| `members.manage` | invite and remove people, change what they can do |

Roles are presets over those, and a preset must never be the only option — the
same "a default is a starting point, never a ceiling" rule:

    Owner       everything, cannot be removed
    Admin       everything except members.manage
    Developer   logic.edit + data.view + page.view
    Designer    design.edit + page.view          (no data, no logic)
    Analyst     data.view + page.view            (read only)
    Viewer      page.view

`data.view` being separate from `page.view` is the one that matters most: it is
how a designer can lay out a page without reading the submissions on it.

## 3. Shape of the work

- `page_members (page_id, user_id, capabilities jsonb, invited_by, created_at)`
- `can_edit_page(page)` becomes `can(page, capability)`; **every** RPC checks the
  specific capability rather than ownership
- an invite flow, by email, reusing the sign-in that already exists
- a Members panel in Layer 3

## 4. Two things that will bite, named now

**Every RPC must be re-checked.** The eight RPCs were once all granted to `anon`
with no caller check, and a stranger could overwrite any page. That was closed by
one rule: ownership. Replacing one rule with eight capabilities means eight
chances to get it wrong. This needs the same treatment that worked before —
build it, then attack it as each role, and confirm every refusal.

**Secrets are the real problem, and they are already accumulating.** A webhook
address lives in a page's workflow, and an API address lives in a Live Data
block. Anyone with `page.view` can read them today, because they sit in the page
JSON. So "this developer must not see our Zapier address" is **impossible**
without moving secrets out of the page and behind the server layer.

That is not a reason to delay team permissions — most of it works without it. It
is a reason to be honest in the interface about which things are genuinely
hidden and which are merely not shown, and never to claim the second is the
first.

## 5. Where it sits

`TODO`, Layer 3, after validation and images but **not** behind end-user
accounts — it is independent of them and much smaller. The natural moment is when
a second person actually touches the project, and not before.
