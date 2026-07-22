# CHANGELOG

> Notable, shipped increments — newest first. Each is on `platform-baseline-v1`
> (feature branches merged `--no-ff`, kept as history). Format loosely follows
> Keep a Changelog. In-flight/unshipped work lives in [`TODO.md`](TODO.md).

## Frontend-first phase (Phase 4 UI) — 2026-07-20 →

- **S5 Workflow Builder** — `/workflow-builder/[code]` + `/new`: the visual editor
  for a definition's approval chain — groups (add/edit/remove/reorder), quorum,
  reject policy, conditions (DSL, `amount > ₹5 Cr`), SLA/warn/timeout/escalation,
  and approvers by user/level/role/dynamic. Live validation; Save draft / Activate /
  Duplicate / Archive. **Backend added (approved, read+write):** `workflow-builder.ts`
  — `getWorkflowDefinitionDetail`, `createDefinition`, `updateDefinitionMeta`,
  `saveDefinitionStructure` (atomic replace, one txn), `activateDefinition`; pure
  `workflow-builder-shared.ts` `validateDefinitionStructure`; API routes
  `POST /definitions`, `GET|PATCH /[code]`, `PUT /[code]/structure`, `POST /[code]/activate`.
  Editing gated to inactive definitions with **no running instances** (duplicate →
  edit → activate → archive). **No schema change** (existing columns only); +12 unit
  tests, +3 harness checks. `/workflow-definitions` gains a "New workflow" button.
- **S9 Notifications Center** — `/notifications`: full-page inbox over the existing
  store — status tabs (all/unread/read/archived), category, search, read /
  mark-all-read / archive / acknowledge, deep links; header bell gains "View all".
  No backend change.
- **S8 SLA Monitor** — `/sla-monitor`: approaching / breached / escalated / timed-out
  counts, a 14-day warning/breach trend, and the in-flight items ranked by SLA risk.
  Consumes `workflow-sla-monitor.ts` + `listApprovalsOverview` + `itemSlaRisk`. No backend change.
- **S7 Active Delegations** — `/workflow-delegations`: admin register of standing
  delegations — summary cards, filters, search, 9-col table, status badges, detail
  drawer (audit + notification history), revoke. Read-only exposures only: extended
  `listAllDelegations` (created-by, department, derived status/last-updated, pending
  instance) + `getDelegationDetail`; `GET /api/workflows/delegations/[id]`. +2 harness checks.
- **S2 Workflow Detail** — `/workflows/[id]`: header, vertical timeline (state
  markers), parallel cards + quorum indicator, conditional-skip viz, delegation
  chain, SLA badges, read-only AI advisory (no action buttons), Audit tab. Added
  `getWorkflowAudit()` (`workflow-audit.ts`) — read-only 3-source aggregation
  (workflow_actions + audit.log + events/deliveries), linked via `payload.instanceId`.
  Leadership-or-participant gate; Audit tab leadership-only. `8e11fc5` / `efa2fce`.
- **S6 Workflow Definitions** — `/workflow-definitions`: list + archive / restore /
  duplicate, with definition CRUD service (`workflow-definitions.ts`) and APIs.
  Archive is the only removal (running work untouched); duplicates created INACTIVE.
  `21c112f` / `c2f5de7`.
- **Read-only models (blocker a)** — `listSettledWorkflows`, `listAllDelegations`,
  `workflow-sla-monitor.ts` (counts + zero-filled trend); completed S1. `cc1b5ab` / `2799b19`.
- **Responsive shell (blocker b)** — `Sidebar hidden md:flex`, `MobileNav` drawer
  below 768px, shared `NavGroups`; 320px unblocked for every screen. `5ce540e` / `ec9aa7d`.
- **S1 Workflow Dashboard** — `/workflows`: every instance in flight as cards
  (what · which document · where stuck · who owes · SLA). Read-only. `e99dd50` / `5d150ff`.

## Phase 4 Workflow Engine — test coverage + audit fixes

- **Steps 8–10 coverage** — notification recipient routing (22 tests, incl.
  delegate-aware `workflow_task_assignee`) + advisory safety contract (ADR-013).
  Unit suite → 143 across 9 files. `fbfcc66` / `8964770`.
- **Step 7 audit fixes** — escalation now **transfers** (marks original
  escalated/timed_out + materialises target task); SLA warn/breach **fire once**
  (db/026 stamps); timeout failures counted + `WORKFLOW_TIMEOUT_FAILED`. `1d8715b` / `efd0963`.
- **Step 7 SLA timer unit coverage** + fix unresolved `{{title}}` placeholder in
  timer notifications. `35c6c5e` / `95a243c`.
- **Delegation expiry sweep** — scheduler-driven `expireStandingDelegations`
  (db/025) + e2e assertion fix (audit #2, #3). `8efad9a` / `d937624`.
- **Delegated-decision attribution** — stamp original approver
  (`{onBehalfOf, originalApprover}`) on delegated decisions (WES §9 clause D). `598d4e5` / `b550a8b`.
- **Step 6 delegation unit coverage** (Phase 4 gap). `8a70758` / `7a92cae`.
- Fixed `{{resourceRef}}` placeholder in delegation notifications (with the expiry work).

## Velocity Gates

- **#7 Succession pack** — configuration-driven (`portal.succession_pack_sections`
  rows + `RESOLVERS` registry); HR edits contents without code changes (db/024). `c3065d0` / `18e363a`.
- **#4 Exit protocol** — six removal actions at 11:59pm; honest `not_wired`/`partial`
  for un-built integrations; board at `/exit-protocol` (db/023). `84a3fdd` / `2e59cd7`.
- **#2 Weekly Pulse** — Friday auto-draft, idempotent; board at `/communication` (db/022). `b633839` / `4d2a895`.
- **#6 Founder Morning Brief** — the 7 numbers (Brief §37) + 06:30 snapshot job
  (db/021); screen at `/founder-brief`. `3f93e56` / `4297c76`.

## Earlier
Premium dark theme made default (tokens in `frontend/tailwind.config.ts`,
ratified 2026-07-13). Platform foundation, scheduler (db/011–012), notification
framework (db/010), and Phase 4 workflow engine Steps 1–10 (db/013–020). See
`git log` and [`docs/architecture/`](docs/architecture/) for the full history.
