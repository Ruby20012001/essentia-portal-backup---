# TODO

> Living backlog. Newest priorities on top. When something ships, move it to
> [`docs/CHANGELOG.md`](docs/CHANGELOG.md) with its commit ref. Deep tech-debt register:
> [`docs/architecture/TECH_DEBT.md`](docs/architecture/TECH_DEBT.md); roadmap:
> [`docs/architecture/ROADMAP.md`](docs/architecture/ROADMAP.md).

## ✅ Phase 4 frontend — COMPLETE (2026-07-22)
All 10 workflow UI screens shipped and verified. This arc closed S7 Active
Delegations, S8 SLA Monitor, S9 Notifications Center, and S5 Workflow Builder
(the last, with its approved read+write backend). See [`CHANGELOG.md`](CHANGELOG.md).
Backend stays frozen again except where a future screen genuinely needs a read model.

## ✅ Also done (2026-07-22)
- **Project Hub** (`/projects`) — the central project record. `807b5df`.
- **WIO / GFC approval on the engine** — `wio_approval` chain live. `fec6f74`.
- **Brand reconciliation** to the group brief. `c0a9f0e`.

## ✅ Phase-1 Core screens done (2026-07-23)
- **Design Room (S5)** `/design-room` — 14-stage Drawing Ladder. `2619d7a`.
- **CRM TL Dashboard (S2)** greeting. `9734283`.
- **VisionCAM (S3)** `/visioncam` — photo log + billing gate (Gate 1). `c573b48`.

## ✅ Phase-1 Core screens COMPLETE (2026-07-30)
- **S6 EH · Experience Centre** `/eh` — Country Head floor + the discount control
  gate (db/029). Fixed two blockers found while building: L2 held no `approve` on
  `eh_sales` (the gate's own actor couldn't pass it) and `eh.sales` RLS returned
  zero rows to an L2 Country Head — their own screen.

## 🟡 Next candidates — 18-screen build sequence
Roadmap: [`docs/reference/Portal_UI_18_Screens_BuildSequence.html`](docs/reference/Portal_UI_18_Screens_BuildSequence.html).
- **Phase 2 (Weeks 6–10, integrations):** S7 BD Pipeline (HubSpot), S8 COO, S9 Procurement (TranZact), S10 Factory HOD, S11 HR/Keka, S13 API Health, S14 Vendor.
- VisionCAM **capture** (React Native, offline-first) — the mobile half of S3; the web log/gate is done.
- Re-check every new screen at 320 / 768 / 1024 / 1440 for horizontal scroll (standing rule).

## ⚠️ Open brand conflict to resolve
The **39-section brief** still says *factory / luxury*; the **group brief** bans them.
Rule adopted: group brief wins on brand/vocabulary, 39-section wins on process/§-detail.
See [`docs/reference/README.md`](docs/reference/README.md) + [`docs/BRIEF_DISCREPANCIES.md`](docs/BRIEF_DISCREPANCIES.md).

## 🟢 Velocity Gates still open (Brief §35)
- **#1 VisionCAM billing** live on every active site (photo required before any billing milestone).
*(#5 EH discount control gate — **CLOSED 2026-07-30.** All three centres have a
Country Head, a threshold and a live discount queue; a harness check asserts the
closing condition so it cannot reopen silently.)*
- **#8 Communication Spine** — Welcome Letter within 4 hrs of first instalment
  (TL must scroll to the bottom before the send button activates).

## 🔵 Integration wiring (turns honest `not_wired` into real removals — Gate #4 completion)
- Microsoft Graph (Teams removal, full SSO revoke, mail auto-responder).
- WhatsApp Cloud API (WhatsApp removal).
- Telephony (call forwarding).
These are recorded `not_wired` today by design; wiring them is real work.

## ⚪ Standing hygiene
- Keep [`docs/PROJECT_MEMORY.md`](docs/PROJECT_MEMORY.md) and [`docs/CHANGELOG.md`](docs/CHANGELOG.md) current at every checkpoint (they replaced the six root memory docs on 2026-07-28).
- New migration ⇒ add to `db/lib.mjs` `DEFAULT_FILES` **and** a `db/validate.mjs` check.
- New `publishEvent` ⇒ supply every `{{var}}` its db/010 template uses (+ a regression test).
- Never global-`sed` over `db/validate.mjs` (short id fragments recur; corrupts unrelated checks).
