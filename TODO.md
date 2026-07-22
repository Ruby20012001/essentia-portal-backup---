# TODO

> Living backlog. Newest priorities on top. When something ships, move it to
> [`CHANGELOG.md`](CHANGELOG.md) with its commit ref. Deep tech-debt register:
> [`docs/architecture/TECH_DEBT.md`](docs/architecture/TECH_DEBT.md); roadmap:
> [`docs/architecture/ROADMAP.md`](docs/architecture/ROADMAP.md).

## 🔴 In progress / blocked

### S7 Active Delegations — PAUSED, awaiting Monica's decision
Backend verified; the fully-supported core is buildable now (6 summary cards,
table minus 2 cols, 6 of 7 filters, revoke). Reported gaps need a call before
building the *complete* screen — details in [`HANDOFF.md`](HANDOFF.md):
- **Created By** column — `created_by` exists but `listAllDelegations()` doesn't resolve the name.
- **Department** filter — `users.department_id` exists but isn't exposed.
- **Detail drawer** (4 sections) — data exists (audit.log by delegationId, tasks by
  delegate, pending approvals, notification history via events `entity_id`), no read service yet.
- **"Last Updated"** — no `updated_at` column; proposed derivation `COALESCE(revoked_at, expired_at, created_at)`.
- **"Open workflow"** — a *standing* delegation has no single instance; needs an agreed interpretation.

**Two paths offered:** (A) approve the read-only exposures (extend
`listAllDelegations` for created_by/department + add `getDelegationDetail(id)`) and
build the complete screen; or (B) stay "existing services only" and ship the
supported core now, leaving the drawer, Created By and Department filter out.
**Do not build S7 until Monica picks A or B.**

## 🟡 Next (frontend-first phase, in order)
- **S8 SLA Monitor** — consume `workflow-sla-monitor.ts` (already built: counts + zero-filled trend).
- **S9 Notifications Center** — over `portal.notifications` / `notification_deliveries`.
- **S5 Workflow Builder (LAST)** — the visual definition editor; consumes
  `workflow-definitions.ts` (already built). Biggest + riskiest, deliberately last.
- Re-check every new screen at 320 / 768 / 1024 / 1440 for horizontal scroll.

## 🟢 Velocity Gates still open (Brief §35)
- **#1 VisionCAM billing** live on every active site (photo required before any billing milestone).
- **#5 EH discount control gate** across all 3 Experience Centres.
- **#8 Communication Spine** — Welcome Letter within 4 hrs of first instalment
  (TL must scroll to the bottom before the send button activates).

## 🔵 Integration wiring (turns honest `not_wired` into real removals — Gate #4 completion)
- Microsoft Graph (Teams removal, full SSO revoke, mail auto-responder).
- WhatsApp Cloud API (WhatsApp removal).
- Telephony (call forwarding).
These are recorded `not_wired` today by design; wiring them is real work.

## ⚪ Standing hygiene
- Keep the six memory docs current each session; regenerate [`HANDOFF.md`](HANDOFF.md) before context runs out.
- New migration ⇒ add to `db/lib.mjs` `DEFAULT_FILES` **and** a `db/validate.mjs` check.
- New `publishEvent` ⇒ supply every `{{var}}` its db/010 template uses (+ a regression test).
- Never global-`sed` over `db/validate.mjs` (short id fragments recur; corrupts unrelated checks).
