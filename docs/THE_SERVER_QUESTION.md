# Is server management software free, and could we be the IDE for servers?

**Researched 4 Sep 2026. This document exists so the question is never re-opened from
memory.** Every number below has a source. Where something could not be verified, it says so.

---

## The question that was asked

> "IBM manages servers and ships them, but people must have dedicated software to run and
> manage those servers, and I think those software are free and cost nothing — but if that
> is true we fail. If that is false, can't we become the IDE for servers?"

Both halves of the reasoning are wrong, and the correction does not help us. That is the
finding.

---

## 1. No, it is not free. Here is what it costs.

| What | Price (USD) | Where |
|---|---|---|
| Dell iDRAC9 Enterprise (16G) | **$706.52** | Dell.com direct |
| Dell iDRAC9 Enterprise (factory SKU) | **$266.00** perpetual | SHI |
| Dell OpenManage Advanced / Advanced Plus | **$449 / $599** perpetual | Dell licensing guide |
| HPE iLO Advanced | **$222–$260** per server | HPE Store |
| HPE OneView (3yr, per server) | **$1,046.16** | Connection |
| Lenovo XClarity Pro (3yr, per server) | **~$260** | CDW |
| Supermicro DCMS | **$180** per node | Supermicro Store |

Customers resent it. A ServeTheHome commenter, Jan 2026: *"the enshittification of iLO ...
has been decades in the making."* PeerSpot buyers report OneView at "$500 per server" and
"$3,000". **At least three public GitHub repositories exist solely to generate Supermicro
licence keys.** The frustration is real and documented.

## 2. And it does not matter, for four reasons.

**a. The paid part is the part we cannot build.** What the licence unlocks is the
*interactive* surface — remote KVM console, virtual media, directory auth. The *API*
surface a fleet tool needs (inventory, power, sensors, health, via DMTF Redfish) is free
on every vendor. We would be giving away the free half and unable to sell the paid half.

**b. Redfish is portable only where it does not matter.** Inventory, power and sensors are
genuinely cross-vendor. Firmware update, BIOS config, virtual media and RAID are vendor-
specific in practice — HPE's `Oem.Hpe` update service has no standard equivalent, and
OpenStack Ironic ships a separate `idrac` hardware type because iDRAC needed non-standard
calls. Every real feature needs a per-vendor adapter, written and maintained by us.

**c. The price floor is zero at exactly our reachable volume.** Zabbix is free forever with
no node limit. Checkmk is free to ~100 hosts. LibreNMS is free. Datadog is free to 5 hosts,
Netdata to 5 nodes. **Every tool gives away precisely the volume a small business needs.**
The paid tiers begin where procurement begins.

**d. The market is smaller than one company.** DCIM is ~$3.7B globally (two report-selling
firms agree on the base and then diverge 2× on the forecast, which is its own warning).
Datadog alone guides to **$4.45B for FY2026**. The whole category we would enter is smaller
than the adjacent company we would not be competing with.

## 3. "The IDE for servers" is a graveyard, and one of the graves is this exact product.

**VisualOps (MadeiraCloud, ~2013–14)** was a visual DevOps tool: drag-and-drop components,
a browser IDE, an agent on each instance, and **continuous state-drift detection and
correction**. That is the product being imagined, built twelve years ago. The blog stops in
May 2014. No post-mortem — it simply stopped.

Then the rest:

- **Vertiv Trellis** — a multi-billion-dollar hardware vendor's DCIM. Killed Aperture, the
  product it replaced, then died itself; support ended 2023.
- **Puppet** — ~$190M raised, incl. a distress-signalling debt round; sold to Perforce for
  an **undisclosed** sum; source effectively closed in 2024; community forked it.
- **Chef → Progress $220M. SaltStack → VMware, undisclosed. Cloudify → Dell, ~$100M.
  HashiCorp → IBM $6.4B.** Five independents, five exits, zero survivors.
- HashiCorp needed **$583M revenue and ~900 six-figure enterprise accounts** to get there.
- **Dead outright:** ScaleXtreme (→Citrix, absorbed), Server Density (→StackPath, which
  liquidated in 2024), Coolan (acqui-hired, product killed), Equinix Metal (sunset 2026).

## 4. Cloudflare and Supabase do not do this — and that is not an opening.

**Cloudflare: no.** Workers, Durable Objects and Containers run only on Cloudflare's own
network. The sole customer-premises product is the Magic WAN Connector, an SD-WAN on-ramp.
There is no product for hardware in your rack.

**Supabase: partly.** Self-hosting runs anywhere, but self-hosted Studio supports a single
project, and managed backups, PITR, branching, advanced metrics and the platform API are
all absent. You own provisioning, hardening, HA and monitoring.

Both are IDEs for **their own** managed services. The gap is real. The graveyard above is
the reason it is still open.

---

## 5. The finding that actually matters: when does a node graph win?

Every domain where node graphs won — Unreal Blueprints, Blender geometry nodes, Houdini,
TouchDesigner, Grasshopper, shader graphs, Node-RED, LabVIEW — shares two properties:

1. **The subject is already spatial or signal-like.** Fred Brooks, *No Silver Bullet*
   (1986): software resists visual representation because its structures are "several
   general directed graphs superimposed ... usually not even planar." Where the domain
   *is* geometry or signal, the graph is a true picture of the thing.
2. **Pure dataflow: few types, many transforms, few in use at once.**

And there is a hard ceiling. **The Deutsch limit** — *"you can't have more than 50 visual
primitives on the screen at the same time. How are you going to write an operating
system?"* Even the wins degrade: LabVIEW users report the merge tool "rarely can even
load VIs"; Unreal teams routinely convert Blueprints back to C++.

**Infrastructure rules are the losing case.** They are control flow, state, concurrency and
failure semantics — Brooks's non-planar superimposed graphs — not dataflow over pictures.

### But there is one counterexample, and it is the design brief

**Home Assistant.** A real GUI trigger/condition/action editor, no code required, in
**2 million homes** as of April 2025. Non-programmers *will* build rules when the domain is
legible to them.

Two conditions came with that win, and both are binding on us:

- It won in the **device** domain, not the server domain.
- **Its visual editor is a bidirectional view over YAML, not a replacement for it.** Users
  drop to text for anything templated. This is the only known design that survives the
  Deutsch limit, and it is also the only one where diff and merge keep working.

### And the gap nobody has closed

Portainer ships GUI threshold rules — condition, duration, severity — and then **stops at
notify**: Slack, email, webhook. No automated remediation. Across Coolify, Dokploy,
CapRover, Proxmox, Cockpit, Webmin, Unraid, TrueNAS, CasaOS, Umbrel: the GUI shows state
and runs one-off actions; every conditional rule is pushed back into a shell script.

> **Nobody has closed condition → action in a graphical interface. Everyone stops at
> condition → notify.**

---

## 6. The cause of death, stated once

Across Parse, the entire PaaS graveyard, Yahoo Pipes, Google App Maker and Coolify:

> **The audience that wants a graphical interface has too little money, and the audience
> with money writes code.**

Parse died precisely here — cheap pricing drew low-spend small developers while large ones
built their own. Coolify is profitable at **~$13k/month net, one person** — a good income,
and structurally not a company, because it never tried to be one. n8n reached **$100M ARR**
— but over 80% of its workflows are AI agent orchestration for enterprises, not infra rules
for non-programmers.

---

## What this changes in `WHAT_WE_ARE_MAKING.md`

**Step 4 — "point the same engine at servers instead of databases" — is withdrawn.** Not
deferred. Withdrawn. It is a documented graveyard, the free tier of the incumbents covers
our entire reachable volume, the paid features need per-vendor adapters we cannot maintain,
and the one company that built our exact product died in 2014.

**Two findings are kept and promoted to constraints:**

1. **Condition → action, not condition → notify.** That gap is real and unclosed. It is as
   true of "who may read this table" as it is of "restart at 80% memory". We are already
   on the correct side of it — a policy that is *enforced* and *kept checked* is an action,
   not an alert.
2. **The graph must be a bidirectional view over text, never a replacement for it.** This
   is Home Assistant's design and the Deutsch limit is why. A node system that cannot be
   read as text cannot be diffed, merged, or reviewed — and will hit its ceiling at about
   fifty nodes, which is smaller than one real application.

**Sources.** Dell OpenManage licensing guide; Dell iDRAC licence types and Redfish
licensing; HPE iLO Advanced store listing and OneView QuickSpecs; Lenovo Press LP0880;
IBM Systems Director withdrawal notice; Supermicro DCMS store; DMTF Redfish; OpenStack
Ironic Redfish driver docs; ServeTheHome (Jan 2026); PeerSpot OneView pricing threads;
TechCrunch on Freshworks/Device42 ($230M), Perforce/Puppet, Progress/Chef ($220M),
IBM/HashiCorp ($6.4B), Dell/Cloudify; Uptime Institute on Trellis; Sacra on n8n; Grafana
and Datadog investor releases; Home Assistant State of the Open Home 2025; Portainer
alerting docs; Wikipedia/Deutsch limit; Brooks, *No Silver Bullet* (1986); Dalke (2003).
