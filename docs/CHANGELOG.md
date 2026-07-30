# CHANGELOG

> Meaningful shipped milestones, newest first. Micro-changes are deliberately omitted —
> `git log` is the complete record. Every entry lands on `platform-baseline-v1`
> (feature branches merged `--no-ff`, kept as history).
>
> Unshipped work: [`TODO.md`](../TODO.md) · Permanent memory: [`PROJECT_MEMORY.md`](PROJECT_MEMORY.md)

---

## 2026-07-30 — S6 · essentia home, Experience Centre + discount control gate

Completes the Phase-1 Core screens (S2–S6).

### Added
- **S6 Experience Centre** `/eh` — the Country Head's floor: revenue against
  target, today's trading, the opening checklist, the monthly target tracker,
  and the discount control gate. Replaces the placeholder.
- **The discount gate (Velocity Gate 5)** — a Client Advisor may not communicate
  a discount until the Country Head signs it off. Pending queue, one-click
  approval, and a banner naming any advisor who went early.
- `lib/services/eh.ts` — read model + `approveDiscount`, a guarded
  compare-and-swap so two heads cannot both claim one approval.
- `POST /api/eh/discounts/[id]/approve`.

### Changed
- The approval threshold is **per centre, held in the database**
  (`eh.experience_centres.discount_threshold_pct`), not a constant in code —
  the business retunes a centre with an UPDATE (ADR-EP-01). Seeded 10% at
  Gurugram and Delhi, 15% at Mumbai, precisely so the difference is visible.
- The monthly target tracker lists only centres whose sales the viewer can
  actually read. An unfiltered roll-up printed a real target beside a ₹0 that
  meant "invisible to you", not "sold nothing" (ADR-HS-01).

### Fixed
- **The gate's own actor could not work the gate.** L2 held read/create/edit on
  `eh_sales` but not `approve`, so a Country Head could see the queue and never
  clear it — Velocity Gate 5 with no way to pass it. Granted `approve` and
  `financial_access` at `own_dept`, the same shape db/004 already uses for
  `communication_spine.approve` and `billing.financial_access`. `pio.approve`
  stays denied at L2 — a different rule (§26), and a harness check now pins both.
- **RLS returned zero rows to the screen's own persona.** `eh.sales` was fenced
  to L0/L1, so an L2 Country Head read nothing on their own dashboard — the same
  trap db/001 documents for `families_project_team`. Added ownership-scoped
  policies for `eh.sales` and for the families who bought at that centre.

### Database
- `029_eh_experience_centre.sql` — `discount_threshold_pct`, two RLS policies,
  the L2 grants, and two indexes. Additive and idempotent; no gate columns
  added, because db/001 already carried the whole contract.
- The breach flag is deliberately **not** constrained to FALSE: a CHECK would
  make a violation unrecordable, and the portal's job is to surface it.
- Fixtures seed three centres, a Country Head, two Client Advisors and six
  sales — including two logged breaches and one below-threshold sale.

### Tests
- +10 unit tests (`eh-discount-gate.test.ts`) — every refusal and its exact
  wording, the compare-and-swap, the audit payload, and that approving never
  clears the early-communication flag. Suite **155 → 165**.
- +5 harness checks. Harness **105 → 110**.

### Notes
- Driven live end to end: approving a breached 22% discount moved it to settled
  while it kept reading "Communicated early" — history is not rewritten.
- Checked at 320/768/1440: no page-level horizontal scroll; tables scroll in
  their own containers.
- **Gate 5 is enforced but not yet closable.** Only Gurugram has a
  `country_head_id`; Delhi and Mumbai have none, so no L2 can approve their
  discounts today. Assigning those two heads is a data task, not a code one.

---

## 2026-07-28 — Work restoration, GitHub backup, memory consolidation

### Added
- `docs/PROJECT_MEMORY.md` — the permanent, single-source project memory
  (9 sections: overview, status, architecture, history, current work, decisions,
  known issues, recovery, next steps).
- `docs/CHANGELOG.md` — this file.

### Changed
- Git remote corrected from `essentia-portal-` to `essentia-portal-backup---`
  after GitHub reported the repository had been renamed. Pushes no longer depend
  on GitHub's rename redirect.
- Root memory files reduced to pointer stubs so a single source of truth remains.

### Fixed
- **Layer 3 disaster recovery, which was empty.** GitHub previously held only the
  13 stub commits on `main`; all 85 commits of actual development existed on one
  machine. All 98 commits and 33 branch refs are now pushed and tip-verified.
- Restored the full build onto a clean branch by fast-forward (no history rewritten).

### Database
- None.

### Tests
- Full green baseline **observed, not inherited**: DB harness **105 PASS / 0 FAIL**,
  `tsc --noEmit` exit 0, unit **155/155** across 10 files, lint clean.

### Documentation
- Recorded the canonical-location decision (Desktop, not OneDrive) with rationale.
- Recorded the committed dev-fixture-password issue as known tech debt.
- Recorded the reconciled group figures and the standing brand-vocabulary rule
  (group brief wins on brand; 39-section brief wins on process detail).

### Notes
- The stated canonical path `OneDrive - ADREM (INDIA) PVT LTD\essentia portal` was
  found **empty** — the project had never lived there.
- No CI/CD exists (`.github/workflows` absent), so pushes are neither tested nor
  deployed automatically.

---

## 2026-07-23 — Phase-1 Core screens

### Added
- **VisionCAM (S3)** `/visioncam` — site-photo log and the billing gate: a
  VisionCAM-triggered milestone cannot invoice until its photo is captured and
  QC-passed. Billing amounts fenced behind `read:billing`. Capture remains the
  mobile app. `c573b48`
- **CRM TL Dashboard greeting (S2)** — "Good morning, {name}. {date} · N active
  projects" on the signal-first dashboard. `9734283`
- **Design Room (S5)** `/design-room` — the 14-stage Drawing Ladder
  (CP→SLD→FI→TP→GFC→AB) over `ee.design_stages`, with progress metrics and a
  project switcher. `2619d7a`

### Database
- Design-stage and VisionCAM fixtures seeded into `900_dev_fixtures`.

### Tests
- Harness checks added for the Drawing Ladder and the photo-gated billing milestone.

### Notes
- Advances **Velocity Gate #1** (VisionCAM billing); the gate is not yet closed —
  it must be live on *every* active site.

---

## 2026-07-22 — Modules on the engine

### Added
- **WIO / GFC approval on the workflow engine** — the drawing sign-off chain now
  runs on the Phase-4 engine via `wio_approval`, `requestWioApproval`, and a
  "Send for GFC approval" action; flows through My Approvals like any workflow.
  Live-verified end to end. `fec6f74`
- **Project Hub** `/projects` + `/projects/[id]` — the central project record:
  health, phase, team, commercials, phase timeline, billing, linked WIO/PIO.
  RLS-scoped; financials fenced behind `read:billing`. `807b5df`
- **Reference specs** — `docs/reference/` holds the RUBY package's 18-screen build
  sequence. Repo `CLAUDE.md` and `db/001` remain authoritative.

### Changed
- **Brand/brief reconciliation** — docs and UI labels aligned to the group brief
  ("luxury" banned; "production facility", not "factory"). `c0a9f0e`

### Database
- `028_wio_approval.sql` — seeds the active 3-group GFC sign-off chain.

---

## 2026-07-22 — Phase 4 frontend complete

### Added
- **S5 Workflow Builder** `/workflow-builder/[code]` + `/new` — visual editor for a
  definition's approval chain: groups (add/edit/remove/reorder), quorum, reject
  policy, conditions DSL, SLA/warn/timeout/escalation, approvers by
  user/level/role/dynamic. Live validation; Save draft / Activate / Duplicate / Archive.
- **S9 Notifications Center** `/notifications` — full-page inbox with status tabs,
  category, search, read / mark-all-read / archive / acknowledge, deep links.
- **S8 SLA Monitor** `/sla-monitor` — approaching / breached / escalated / timed-out
  counts, 14-day trend, in-flight items ranked by SLA risk.
- **S7 Active Delegations** `/workflow-delegations` — admin register with filters,
  status badges, detail drawer (audit + notification history), revoke.
- Backend (approved, read+write): `workflow-builder.ts`, pure
  `workflow-builder-shared.ts` `validateDefinitionStructure`, and definition APIs.

### Changed
- Definition editing gated to inactive definitions with **no running instances**
  (duplicate → edit → activate → archive), so a live chain can't be rewritten mid-flight.

### Database
- No schema change — the builder writes only to existing columns.

### Tests
- +12 unit tests, +3 harness checks.

---

## 2026-07-21 — Phase 4 frontend, first screens

### Added
- **S1 Workflow Dashboard** `/workflows` — every instance in flight as cards.
- **S2 Workflow Detail** `/workflows/[id]` — timeline, parallel/quorum cards,
  conditional-skip visualisation, delegation chain, SLA badges, read-only AI
  advisory, Audit tab. Added `getWorkflowAudit()` — read-only 3-source aggregation.
- **S6 Workflow Definitions** `/workflow-definitions` — list + archive / restore / duplicate.
- Read-only models: `listSettledWorkflows`, `listAllDelegations`, `workflow-sla-monitor.ts`.

### Fixed
- **Responsive shell** — `Sidebar hidden md:flex`, `MobileNav` drawer below 768px,
  shared `NavGroups`. Unblocks 320px for every screen. `ec9aa7d`

---

## 2026-07-20 — Phase 4 engine: coverage and audit fixes

### Fixed
- **Escalation now transfers ownership** — marks the original task
  `escalated`/`timed_out` *and* materialises a task for the target, who previously
  was notified then 403'd. `efd0963`
- **SLA warn/breach fire exactly once**, stamped rather than re-audited every tick.
- Timeout failures counted and audited `WORKFLOW_TIMEOUT_FAILED`, never swallowed.
- Unresolved `{{title}}` and `{{resourceRef}}` placeholders in notifications —
  both were invisible to code-only review and required a live drive to catch.
- Delegated decisions stamp the original approver, so attribution is never lost.

### Tests
- Notification recipient routing (22 tests) + advisory safety contract (ADR-013).
- Delegation engine and SLA timer unit coverage. Suite → 143 tests / 9 files.

---

## 2026-07-19 — Velocity Gates

### Added
- **#7 Succession Pack** — configuration-driven via `portal.succession_pack_sections`
  rows + a `RESOLVERS` registry, so HR edits contents without code changes. `18e363a`
- **#4 Exit Protocol** — six removal actions at 11:59pm, with honest
  `not_wired`/`partial` for un-built integrations. Board at `/exit-protocol`. `2e59cd7`
- **#2 Weekly Pulse** — Friday auto-draft, idempotent. Board at `/communication`. `4d2a895`
- **#6 Founder Morning Brief** — the 7 numbers (Brief §37) + 06:30 snapshot job.
  Screen at `/founder-brief`, fenced to L0–L1. `4297c76`

### Database
- `021_founder_brief_snapshot` · `022_weekly_pulse_job` · `023_exit_protocol` ·
  `024_succession_pack` · `025_delegation_expiry` · `026_sla_fire_once` ·
  `027_workflow_definition_admin`

### Notes
- Exit Protocol deliberately reports only 2 of 6 removals as real (ADR-HS-01).
  The remaining 4 require Graph, WhatsApp and telephony wiring.

---

## Earlier

Premium dark theme ratified as default (tokens in `frontend/tailwind.config.ts`,
2026-07-13, supersedes Cold Coffee). Platform foundation, RBAC, auth, scheduler
(db/011–012), notification framework (db/010), and Phase 4 workflow engine Steps 1–10
(db/013–020). See `git log` and [`docs/architecture/`](architecture/).
