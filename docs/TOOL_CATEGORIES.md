# The three layers, and every tool sorted into them

The organising structure for Creora's tools — the thing that eventually becomes
the Photoshop / Blender style menu. Named by the owner, 11 Aug:

> *"the active tools which are the front ones like the button... then the
> data-driven one which holds the backend work like the counts of videos a user
> uploaded, or Google Maps live data... then backend-driven tools that run on the
> dev side, the dashboard — which part works, and where I tweak settings like in
> AWS."*

This is the same instinct as the "3 layer" idea from July, and it is a good one.
It is not three products; it is **who each tool is for**:

| layer | for | when it runs |
| :--- | :--- | :--- |
| **1. Interface** | the visitor | when they touch it |
| **2. Data** | the page | continuously, from a server |
| **3. Operations** | the builder | while building and watching |

Everything below is sorted by that question, and marked with what exists today.

---

## Layer 1 — Interface · what a visitor touches

### Show things
| | |
| :--- | :--- |
| `HAVE` | Text label · Number display · Formula display |
| `HAVE` | Shape, with a role — the "make my own button" path |
| `HAVE` | Table view · List · History chart |
| `MISSING` | **Image** · video · icon · divider · spacer |
| `MISSING` | **Map** — the display half of "Google Maps live data" |
| `MISSING` | Tabs · modal · accordion — showing a lot without a lot on screen |

### Collect things
| | |
| :--- | :--- |
| `HAVE` | Text input · Toggle |
| `MISSING` | **Dropdown · checkbox · radio · number field · long text** |
| `MISSING` | **Date and time picker** |
| `MISSING` | **File and image upload** |
| `MISSING` | **Validation** — required, format, min/max, and the error message |

### Interact
| | |
| :--- | :--- |
| `HAVE` | Button · click · change · show / hide |
| `HAVE` | Go to another page (Link role, Button navigation) |
| `HAVE` | Animate on change — pulse, flash, rise, shake |
| `HAVE` | **Count up and down** — the cart-quantity case, working today |
| `MISSING` | Hover and focus states · drag · keyboard shortcuts |
| `MISSING` | Loading · success · error states, and disable-while-sending |

---

## Layer 2 — Data · what feeds the page, from a server

This is the layer the owner means by "server driven, like Amazon". A visitor
never configures it; they only see its results.

### Hold data
| | |
| :--- | :--- |
| `HAVE` | A table with real rows, shared across every visitor, live-updating |
| `MISSING` | **Collections** — data that belongs to the page, not to one block |
| `MISSING` | **Per-visitor data** — "my cart", "my uploads". Currently everything is shared, which is why a cart cannot exist |
| `MISSING` | Relations between tables · unique values · computed columns |

### Ask questions of data
| | |
| :--- | :--- |
| `HAVE` | How many rows — the count |
| `MISSING` | **Sum · average · highest · lowest** over a column |
| `MISSING` | **Count where…** — "how many videos *this* person uploaded" is a count with a condition, and that is the owner's exact example |
| `MISSING` | **Search · filter · sort · paginate** — a table of 500 rows is unusable without them |
| `MISSING` | **For each row** — no loop exists, so a list of anything cannot be laid out |

### Bring data in
| | |
| :--- | :--- |
| `HAVE` | **Live Data** — any public API, pick the field by clicking it, refresh on load or on a timer |
| `MISSING` | APIs needing a secret key `BLOCKED BY` the server layer |
| `MISSING` | Import a CSV in |
| `MISSING` | Caching, so 1,000 visitors are not 1,000 API calls |

### Send data out
| | |
| :--- | :--- |
| `HAVE` | **Webhook** — Zapier, Make, n8n, and through them Sheets, Excel, email, CRMs |
| `HAVE` | Download as CSV |
| `MISSING` | Send an email directly |
| `MISSING` | Payments |

---

## Layer 3 — Operations · the builder's dashboard

**The most absent layer, and the owner is right that it matters.** This is the
"AWS console" idea: a place to see what is working, what is not, and to change
how things run — separate from the page itself.

| | |
| :--- | :--- |
| `HAVE` | **Runs** — every trigger that fired, what it changed, what it skipped and why |
| `HAVE` | Publish / unpublish, with the share link |
| `HAVE` | Account, and which identity owns what |
| `MISSING` | **A status view** — every page, published or draft, when it last changed, how many rows it holds |
| `MISSING` | **Health** — is that API still answering? did those webhooks arrive? when did one last fail? |
| `MISSING` | **Usage** — rows, storage, bandwidth against the free-tier limits, before hitting them rather than after |
| `MISSING` | **Visitors** — how many people opened a published page |
| `MISSING` | Settings in one place: domain, sign-in methods, notifications |
| `MISSING` | Versions and rollback — undo a publish |

Note the shape: Layer 3 is mostly **seeing**, not doing. That is what makes a
platform feel trustworthy rather than mysterious, and it is exactly what
Cloudflare's dashboard is: not 100 features, but 100 things made *visible*.

---

## What this says about ordering

The categories are not equally blocked, and one item unblocks a whole row:

1. **Validation + form states** (Layer 1). Cheap, no server, and no form is
   usable without it.
2. **Aggregates and count-where** (Layer 2). "How many videos did this person
   upload" is a count with a condition — small, and it is the owner's own example.
3. **Images** (Layer 1). Blocks more site types than anything else.
4. **Collections + per-visitor data** (Layer 2). Opens carts, profiles, "my
   things" — an entire category of website that cannot exist today.
5. **For each row** (Layer 2). Until this exists, no list of anything can be laid
   out, which quietly blocks blogs, directories, galleries and search results.
6. **A status dashboard** (Layer 3). Build it when there is enough running to be
   worth watching — but do not leave it until it is needed urgently.

**And the naming for the eventual menu**, so it is decided once: *Interface ·
Data · Operations*. Every new tool should be placeable in exactly one of them.
If a tool does not obviously belong to one, that is a signal it is really two
tools.
