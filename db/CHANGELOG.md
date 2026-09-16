# Database Schema Changelog

## 049 — 2026-09-16 (Hiring and interviews — S11)

- **New schema `hr`**, nine tables. Candidate data is not employee data and
  must not be reachable from a join written for employee data, so it sits
  beside ee/eh/factory/proc rather than inside `portal`, and can be dropped
  whole.
- `hr.interview_stages` — the pipeline as **rows**, ordered by `seq`. Six
  seeded (applied → HR conversation → department → HOD → founder → offer).
  Nothing in the application hard-codes the order.
- `hr.open_roles` · `hr.candidates` — the seat and the people against it.
  `stage` (where they are) is kept apart from `status` (whether they are still
  moving), so the board can say "rejected after the HOD round" rather than
  losing that to one column.
- `hr.interviews` · `hr.interview_panel` — a round, and everybody sitting in
  it. The panel is a list because "who still owes feedback" is only answerable
  if it is.
- `hr.question_sets` · `hr.questions` — the same questions asked of everybody
  against a seat. A set belongs to a stage, a role, both, or neither; the
  lookup prefers the most specific.
- `hr.scorecards` · `hr.scorecard_answers` — one interviewer, one scorecard per
  round (`UNIQUE (interview_id, user_id)`), and a CHECK that a submitted one
  carries a recommendation. Feedback with a rating and no call decides nothing.
- `hr.candidate_activity` — append-only. `essentia_app` gets `SELECT, INSERT`
  and nothing else; a trail that can be edited is not a trail.
- **RLS on the five tables that carry a person.** Open to L0/L1 and to the HR
  department, and separately to a panel member for the one round they are in —
  which is the case the module exists to serve, since the HOD in the room is
  not HR. Proven in `validate.mjs` from three directions (HR sees the board, a
  panel member sees one round, a stranger sees nothing).
- **`hiring` resource + permissions.** HR runs it from L2 via a department row
  beating the level's global row. There is no global L2/L3 grant, and the
  migration raises an exception at load time if one ever appears.
- Dev fixtures in `900`: an HR account and a panel-only HOD account — without
  them every fixture user sees "Restricted" and the module reads as broken
  rather than fenced. Same trap `029` hit with the Country Head.
- See [`docs/hiring.md`](../docs/hiring.md).

## 012 — 2026-07-08 (Scheduler dead-letter alert policy)

- `portal.event_routes`: `scheduler.job_dead` → `system_alert`, recipient
  strategy `platform_admins`, in-app + email, urgent.
- Config `notifications.admin_alert_levels` (`["L0"]`) and
  `notifications.admin_alert_title_patterns` (COO / CTO / Platform Admin
  substrings) — the recipient set is **data**, so adding a future Operations
  role is a config change, not code.

  **App-layer note:** new `platform_admins` recipient strategy
  (`lib/notifications/engine/recipients.ts`) resolves L0 + job-title matches;
  the scheduler publishes `scheduler.job_dead` on dead-letter (best-effort).

## 011 — 2026-07-08 (Scheduler / Job Framework — auto-pilot)

- `portal.scheduled_jobs`: the job registry — cadence as data
  (`interval` seconds | `daily` HH:MM), enable flag, `max_attempts`, backoff.
- `portal.job_runs`: one row per `(job, scheduled_for)` slot;
  `UNIQUE(job_id, scheduled_for)` is the single-fire lock (two ticks / two app
  instances cannot both claim a slot). Retry re-claims a `failed` slot via
  `ON CONFLICT DO UPDATE` with exponential backoff; dead-letters at `max_attempts`.
- System service account `autopilot@essentia.in` (L1, no credential) — the
  identity the scheduler acts as so cross-department sweeps see every record.
- `scheduler` resource + permissions (L0/L1 full, L2 read); config
  `scheduler.enabled` + `scheduler.catchup_grace_seconds`; grants to `essentia_app`.
- Seeds the three existing job routes (notifications-dispatch, wio-clock,
  keka-sync) as registered jobs. Resolves A-14 / IG-06. See `docs/scheduler.md`.

  **App-layer note:** the scheduler holds no business logic — `lib/services/scheduler.ts`
  maps job names to the same service functions the `/api/jobs/*` routes call, and is
  triggered by `POST /api/jobs/tick` (external cron, `SCHEDULER_TICK_SECRET`).

## 010 — 2026-07-07 (Platform Phase 3 — Notification Framework)

- `portal.events`: immutable domain-event store; partial unique index on
  `dedupe_key` centralises "don't alert twice".
- `portal.notification_deliveries`: per (event × recipient × channel)
  delivery with retry/backoff/dead-letter state; `UNIQUE(event,recipient,
  channel)` for duplicate prevention.
- `portal.notification_preferences`: channels, category mutes, quiet hours,
  digest frequency.
- `portal.event_routes`: event_type → template + recipient strategy +
  channels (data-driven; a new event is a row).
- `portal.notifications` extended: `event_id`, `notification_type`,
  `category`, `acknowledged_at`, `archived_at`, `expires_at`.
- Templates for all notification types; config for channel enablement +
  retry/backoff; grants.

  **App-layer note:** the event bus INSERT uses
  `ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL` to match the
  partial index — a plain `ON CONFLICT (dedupe_key)` errors when the key is
  NULL. `workflows.ts` / `wio.ts` now publish events instead of notifying
  directly.

## 009 — 2026-07-07 (Platform Phase 2 — Keka Integration)

- `portal.sync_runs`: one row per org sync (provider, trigger, status,
  stats, error). Granted to `essentia_app`.
- `portal.workflow_steps.approver_email`: seeded for the PIO chain
  (khushpreet/deepak/hardesh); the sync links these to synced accounts,
  arming the approvals blocked since S4 (A-04/A-20).
- Config: `keka.provider`, `keka.sync_enabled`, and `keka.department_mapping`
  populated (Keka name → Master code). Departments stay the Master's; Keka
  names map onto it and unmapped names are flagged, never created (A-13).

  **App-layer note (not a schema change):** the workflow-approval UPDATE was
  fixed to stop reusing `$2` across two type contexts ("inconsistent types
  deduced for parameter $2"), and switched from `SELECT … FOR UPDATE` to a
  single-statement compare-and-swap. Only surfaced once a real approver
  existed to approve. Covered by a harness check + the Keka E2E.

## 008 — 2026-07-07 (Platform Phase 1 — Auth & Identity)

- `public.users`: `password_hash` (scrypt, local provider), `auth_provider`,
  `mfa_enrolled`/`mfa_secret` (MFA-ready), `failed_logins`/`locked_until`
  (lockout).
- `portal.sessions`: server-side, revocable sessions — SHA-256 token hash
  (raw token never stored), absolute + idle expiry, device/IP, revoke reason.
  Indexed for active-session lookups. Granted to `essentia_app` (db/007
  pattern — new tables need explicit grants).
- `auth.*` config: provider, absolute/idle timeouts, concurrent cap, lockout.
- Dev password seed moved to 900_dev_fixtures (never in a migration).
- Retires the `DEV_USER_ID` env stub in production — see docs/auth.md.

## 007 — 2026-07-06 (S4 verification finding)

- **RLS enforcement did not apply on the live stack**: the app connected as
  a superuser/owner, and PostgreSQL skips row-level security for both — the
  L0-L3 policies existed but never executed (caught by the live L3 API test;
  every harness check had passed because the harness already used a
  restricted role). Fix: dedicated `essentia_app` role (NOLOGIN, table
  grants, insert-only on audit) + `SET LOCAL ROLE essentia_app` inside every
  `withUserContext` transaction, so fencing holds regardless of the
  connection user. Production guidance: the app's login role should also be
  non-owner/non-superuser; the SET LOCAL ROLE is belt-and-braces.

## 004 — 2026-07-06 (Foundation freeze — Monica's rulings)

- **Department Master**: `public.departments` is the single source of truth —
  `is_active`/`sort_order` added, `ee.wio.department_code` now a real FK to
  the master, factory-support departments parented under FACTORY.
- **Factory Master**: stations get `code`/`station_no`/`status`; the 7 named
  stations seeded in 002 are coded CARP…ASSY, and stations 8–9 exist as
  `status='reserved'` rows ("Awaiting Business Confirmation") — adding a real
  station later is an UPDATE, not a schema change.
- **RBAC engine**: `public.role_permissions` (interim boolean matrix from the
  retired `003_seed_roles.sql`) is **dropped**, replaced by
  `permission_actions` (12 actions incl. ai/financial/hr access) ×
  `resource_types` (21) × `public.permissions` (level + optional department +
  resource + action + scope). Deny-by-default; department-specific rows beat
  global rows; the four global security rules are explicit `allowed=FALSE`
  rows with cited notes. Changing policy is an UPDATE, not a deploy.
- **Workflow engine**: `portal.workflow_definitions/steps/instances/actions`;
  the PIO chain (Khushpreet → Deepak Ji → Hardesh, §26) seeded with
  `approver_hint` and NULL `approver_user_id` until the Keka import maps real
  accounts — the engine refuses to advance an unresolved step.
- **Notification framework**: `portal.notification_templates` with 10 seeded
  templates (WIO clock, AR ladder, pulse, anti-busy flags, workflow steps).
- **Config system**: `portal.app_config` — WIO window, AR ladder, pulse
  schedule, Rimadesio/Mumbai block (§27), exit-protocol time, AI provider
  and model, RBAC audit mode.
- **Audit**: partitions extended through 2027-06; UPDATE/DELETE revoked —
  the trail is insert-only.
- **AI**: `portal.ai_prompts` registry (prompts as data; module-owned seeds).

## v1.1 — 2026-07-06

`001_essentia_schema.sql` v1.0 contained three statements PostgreSQL rejects,
so the file could never load end-to-end. Fixed in place; no table shape changed
beyond the removals noted below.

1. **`ee.pio_factory_clock` view** — referenced columns that do not exist on
   `ee.pio` (`boq_approved`, `design_3d_approved`; the real columns are
   `final_boq_signed` / `final_3d_signed`) and carried stray `RENAME COLUMN`
   clauses inside the `WHERE`, which is not valid SQL anywhere. Rewritten
   against the real columns.
2. **`ee.billing_milestones.is_overdue`** — stored generated column built on
   `CURRENT_DATE`; Postgres requires generation expressions to be immutable,
   so the CREATE TABLE fails. Replaced with the `ee.billing_status` view
   (computed live), and the `idx_billing_overdue` partial index replaced with
   `idx_billing_unpaid` on `(due_date) WHERE invoice_raised AND amount_paid < amount`.
3. **`proc.wo_line_items`** — declared two primary keys (`id` and
   `(wo_id, serial_no)`); a table can have only one. The composite is now a
   `UNIQUE` constraint.

Hardening in the same pass:

- All `current_setting('app.…')` calls in RLS policies now pass
  `missing_ok = TRUE` — a connection that never set the GUCs sees zero rows
  instead of every query erroring.
- `public.families`, `ee.billing_milestones`, and `eh.sales` had RLS enabled
  with **no** policy (default-deny — the app role could never read them).
  Explicit L0/L1 policies added; L2/L3 policies land with the auth module.
- All three views (`wio_clock`, `pio_factory_clock`, `billing_status`) now set
  `security_invoker = TRUE` — views otherwise execute with owner privileges,
  which would have silently bypassed the L0-L3 RLS fencing for every query
  routed through them.
- File moved from repo root to `db/` to match the path CLAUDE.md documents.

Still pending:

- A clean `psql -f` run against live PostgreSQL 15 + pgvector as final
  validation (no Postgres instance exists on this machine — first provision
  will confirm).
- Seed files `002_seed_departments.sql` (22 departments) and
  `003_seed_roles.sql` (L0-L3 permission matrix), referenced by the schema
  footer but not yet written.
