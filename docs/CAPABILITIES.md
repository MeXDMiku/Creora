# What a website needs, and what Creora has

An audit, not a wish list. Real site types, what each actually requires, and
whether Creora can do it today. The point is to find **the missing pieces that
block whole categories of website**, not to list nice ideas.

Written 11 Aug 2026 against the code as it stands.

Legend: `HAVE` · `PART` partly · `MISSING` · `BLOCKED BY` depends on something else

---

## Part 1 — The one finding that matters most

**Creora has shared state and no private state.**

Every visitor to a published page sees the same rows and the same numbers. That
is the differentiator and it is genuinely rare — almost no no-code builder does
it. But it is currently the *only* mode, and most websites need the other one
too:

| needs private-per-visitor state | can Creora build it |
| :--- | :--- |
| a shopping cart | no |
| "my orders", "my profile", "my bookings" | no |
| a half-finished form you come back to | no |
| a quiz score that is yours, not everyone's | no |
| anything behind a login | no |

One switch on a Database — **shared / per visitor** — plus a `whose row is this`
column, opens all of it. That is a small idea with a very large blast radius, and
it is the single highest-leverage thing missing. It needs end-user identity to
mean anything, which is why identity keeps coming up as the big one.

The second finding: **data can come out (CSV) but nothing can go out to another
system, and nothing can come in.** No webhook, no API call, no email. That is
what "it should land in the right place in my Excel" really needs, and it is the
same missing foundation as the AI key — nowhere private to run code.

---

## Part 2 — Ten real websites, and what stops each one

| # | site | what it needs beyond what exists | verdict |
| :--- | :--- | :--- | :--- |
| 1 | **Waitlist / signup** | required-field validation, duplicate check, thank-you state, notify owner | **closest to possible today** — the Feedback page is 80% of it |
| 2 | **Landing page** | image blocks, sections, responsive layout, meta/social preview | blocked on images + layout |
| 3 | **Contact form** | validation, email send, spam guard | blocked on email |
| 4 | **Portfolio / gallery** | image upload, gallery, lightbox | blocked on images |
| 5 | **Blog** | list → detail navigation, rich text per item, dates, sort/paginate | blocked on for-each-row + dates |
| 6 | **Directory / listing** | search, filter, sort, pagination, detail page | blocked on for-each-row + search |
| 7 | **Booking** | date/time picker, availability, conflict prevention, confirmation | blocked on dates + private state + server |
| 8 | **Shop** | cart (private), payment, inventory, order record, receipt | blocked on private state + payments + server |
| 9 | **Community** | end-user accounts, posts, comments, moderation | blocked on end-user identity |
| 10 | **Internal dashboard** | login, roles, tables with filters, charts, CRUD | blocked on identity + roles + filtering |

**Read the right-hand column as a build order.** Five distinct blockers cover all
ten: images, layout, for-each-row, identity/private state, and a server.

---

## Part 3 — The catalogue, by category

This is the structure the eventual UI should be organised around — the
"main function → sub category" shape of Photoshop, Unreal or Blender.

### 1. Content and layout
| | |
| :--- | :--- |
| `HAVE` | text, headings, shapes, colour, size, position |
| `HAVE` | responsive stacking on published pages below 640px |
| `MISSING` | **images** — upload, display, gallery. Blocks the most site types of anything here. `BLOCKED BY` the image pipeline (BACKLOG §3) |
| `MISSING` | sections / containers / grouping — blocks are a flat list |
| `MISSING` | video, icons, dividers, spacers |
| `MISSING` | themes and design tokens `BLOCKED BY` the layout decision |
| `MISSING` | page meta: title, description, social preview image |

### 2. Input and validation
| | |
| :--- | :--- |
| `HAVE` | text input, toggle |
| `MISSING` | **required / min / max / format validation, and an error message** — no real form exists without this |
| `MISSING` | dropdown, radio, checkbox group, multi-line text, number input, date picker, file upload |
| `MISSING` | multi-step forms, progress, "you already submitted" |

### 3. Logic and flow
| | |
| :--- | :--- |
| `HAVE` | many conditions per step, all/any, full positive+negative operators |
| `HAVE` | increment, decrement, set, toggle, reset, show, hide |
| `HAVE` | numeric formulas, one level of chaining |
| `MISSING` | **else** `BLOCKED BY` the port model (BACKLOG) |
| `MISSING` | **for each row** — no loop of any kind `BLOCKED BY` collections |
| `MISSING` | **on page load**, **every N seconds** as page-level triggers |
| `MISSING` | **remember something between visits** — no per-visitor memory |
| `MISSING` | text operations: join, split, upper/lower, template ("Hi {name}") |
| `MISSING` | dates: now, format, add days, difference, compare |
| `MISSING` | random, rounding, min/max across values |

### 4. Data
| | |
| :--- | :--- |
| `HAVE` | a table, add/update/delete a row, row count, live shared updates |
| `HAVE` | **download as CSV**, columns in the builder's order |
| `MISSING` | **collections** — rows belong to a block id, orphan when it is deleted, cannot be shared between pages |
| `MISSING` | **search, filter, sort, paginate** — a table of 500 rows is unusable |
| `MISSING` | **private-per-visitor rows** — see Part 1 |
| `MISSING` | relations between tables, unique constraints, computed columns |
| `MISSING` | import a CSV *in* |

### 5. Identity and permissions
| | |
| :--- | :--- |
| `HAVE` | the owner: anonymous, then email link; ownership enforced and attack-tested |
| `MISSING` | **end-user accounts** — visitors logging in to a site someone built. The largest single item, and multi-tenant auth, not "add Google login" |
| `MISSING` | roles, per-page and per-block permissions, members of a site |
| `MISSING` | Google sign-in even for the owner |

### 6. Connecting out and in — *the biggest structural hole*
| | |
| :--- | :--- |
| `HAVE` | CSV out |
| `MISSING` | **send a webhook** — the single most useful one. It is how a form reaches Zapier, Make, n8n, Sheets, a CRM, anything |
| `MISSING` | **send an email** on submit |
| `MISSING` | **fetch from an API** and put the result in a block |
| `MISSING` | direct Google Sheets / Excel sync `BLOCKED BY` a server holding credentials |
| `MISSING` | payments |
| `MISSING` | AI block `BLOCKED BY` key custody, deferred by decision |

**All of these need one thing: a private place to run code (Supabase Edge
Functions).** Not six features — one foundation. A webhook is the cheapest
capability that proves it, and it happens to be the one that unlocks Excel,
Sheets, CRMs and automation tools in a single stroke, because those tools all
already speak webhook.

### 7. Feedback and state
| | |
| :--- | :--- |
| `HAVE` | animation presets on value change; a run log for debugging |
| `MISSING` | loading state, success state, error state, toasts |
| `MISSING` | disable a button while something is in flight — double submission is possible today |
| `MISSING` | empty states, confirm-before-delete |

### 8. Publish and operate
| | |
| :--- | :--- |
| `HAVE` | one-click publish, share link, unpublish, deployed hosting, "Made with Creora" |
| `MISSING` | custom domain, analytics, page versions / undo a publish, duplicate a page, templates |

---

## Part 4 — What this says to build, in order

Ranked by **how many blocked things each unblocks**, not by size.

1. **A webhook action.** One action, one Edge Function. Unblocks Excel, Sheets,
   email, CRMs and every automation tool at once, because they all accept
   webhooks. It is also the cheapest possible proof of the server layer that
   AI keys, OAuth secrets and rate limits all need. **Highest leverage on the
   whole list.**
2. **Validation and form states.** Required, format, error message, loading,
   success, disable-while-sending. Nothing that calls itself a form builder can
   skip these, and none of it needs a server.
3. **Images.** Upload, display, gallery — with the compress-in-browser rule from
   BACKLOG §3. Blocks more site types than anything else in Part 2.
4. **Collections + private rows.** Rows stop belonging to a block, gain an owner,
   and gain search / filter / sort. Opens carts, profiles, "my things".
5. **Text and date primitives.** Small, cheap, and needed by nearly every site.
6. **End-user accounts.** The largest, and correctly last — everything above
   makes it more useful, and it makes nothing above possible.

**Then** the organisation problem: categories, search, sensible defaults,
progressive disclosure. Worth real design work — after there is something to
organise. Doing it now would be arranging an empty shelf.
