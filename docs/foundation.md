# Foundation Architecture

Written for a developer joining in month 6 who has spoken to nobody. The ten
foundational systems (Monica's freeze, 2026-07-06) and how every future
module plugs into them. Database objects live in
[db/004_foundation.sql](../db/004_foundation.sql); decisions and assumptions
in [ASSUMPTIONS_DECISIONS.md](ASSUMPTIONS_DECISIONS.md).

## The rule that governs everything

**Structure is data.** Departments, stations, permissions, approval chains,
notification wording, business thresholds, AI provider — all rows, never
constants. If you find yourself hardcoding a department name, a permission
check, or a threshold, you are building it wrong.

## 1–2. Department Master & Organization Hierarchy

- **Tables:** `public.departments` (24 rows, seeded in `db/002`, each citing
  its brief section; `parent_id` gives the hierarchy; `is_active`,
  `sort_order`).
- **Service:** [lib/services/departments.ts](../frontend/lib/services/departments.ts)
  — `getDepartments()`, `getDepartmentTree()`, `getDepartmentByCode()`.
- **API:** `GET /api/departments` (`?tree=1` for the hierarchy).
- **Enforcement:** `ee.wio.department_code` is a foreign key to the master —
  WIO routing to an unknown department fails at the database.
- Person-level hierarchy comes from `users.reports_to` (filled by the Keka
  import — see A-13).

## Authentication (Platform Phase 1)

Real session management replaced the `DEV_USER_ID` stub — see
[auth.md](auth.md). `getCurrentUser()` now resolves from a server-validated
session cookie (production = Entra OIDC, dev = local password / bootstrap);
level and department still come from `public.users`. Everything below layers
on top of the authenticated session.

## 3–4. RBAC Permission Engine & User/Role Mapping

- **Tables:** `public.permission_actions` (12 actions incl. `ai_access`,
  `financial_access`, `hr_access`) · `public.resource_types` (21) ·
  `public.permissions` (level + optional department + resource + action →
  allowed/scope/notes).
- **Resolution** ([lib/services/permissions.ts](../frontend/lib/services/permissions.ts)):
  deny by default; a department-specific row beats the level's global row;
  `can()` returns `{allowed, scope, source}`, `requirePermission()` throws a
  403 `PermissionError`. **Every decision is logged** to `audit.log`
  (`PERMISSION_ALLOW`/`PERMISSION_DENY`) per the `rbac.audit_mode` config
  (`all` | `denials_and_sensitive` | `sensitive_only`).
- **Mapping:** a user's level and department live on `public.users` — the
  session stub ([lib/auth/session.ts](../frontend/lib/auth/session.ts)) loads
  them from the database; env can only pick *which* user, never *what level*.
- **Two layers, both always on:** this engine governs actions; Postgres RLS
  (via `withUserContext`) governs row visibility. Neither replaces the other.
- **Global security rules** are explicit `allowed = FALSE` rows with cited
  notes (Family Profile below TL/HOD §5; junior financials §36; PIO approval
  §26 — see §8 Workflow). The Rimadesio/Mumbai rule is config (A-12).

## 5. Factory Master

- **Table:** `factory.departments` — 7 active stations (CARP…ASSY,
  `station_no` 1–7) + 2 reserved (`RES8`/`RES9`, "Awaiting Business
  Confirmation"). Adding a station is an UPDATE (ruling #2).
- **Service/API:** [lib/services/factory.ts](../frontend/lib/services/factory.ts) ·
  `GET /api/factory/stations`.

## 6. Audit Logging

- **Table:** `audit.log`, partitioned monthly (through 2027-06 — extend ahead
  of time or automate; an unpartitioned month makes inserts fail),
  UPDATE/DELETE revoked: the trail is insert-only.
- **Service:** [lib/services/audit.ts](../frontend/lib/services/audit.ts) —
  `writeAudit()` never throws into business logic. Writers so far: permission
  decisions, config changes, workflow actions, AI calls.

## 7. Notification Framework

- **Tables:** `portal.notification_templates` (10 seeded: WIO clock, AR
  ladder, pulse, anti-busy flags, workflow steps — `{{var}}` placeholders) +
  `portal.notifications` (per-recipient, 3 tiers).
- **Service:** [lib/services/notifications.ts](../frontend/lib/services/notifications.ts)
  — `notify({templateCode, recipientId, vars})`, `listNotifications`,
  `markRead`, `unreadCount`.
- **API:** `GET /api/notifications` (`?unread=1`),
  `POST /api/notifications/{id}/read`.
- Channels: in-app now; whatsapp/email activate via
  `notifications.enabled_channels` when Twilio/Graph land (A-08).

## 8. Workflow Engine

- **Tables:** `portal.workflow_definitions` / `workflow_steps` (approver =
  named user or access level, `approver_hint` until Keka maps accounts) /
  `workflow_instances` (one pending per document, partial unique index) /
  `workflow_actions` (who, what, when, comments).
- **Service:** [lib/services/workflows.ts](../frontend/lib/services/workflows.ts)
  — `startWorkflow()`, `actOnWorkflow()` (exact-approver gate: an unresolved
  step **refuses to advance** and names the intended approver — nobody
  approves through a gap), `getWorkflowInstance()`. Steps notify their
  approver through the notification framework; every action is audited.
- **Seeded chain:** `pio_approval` = Khushpreet Arora → Deepak Ji → Hardesh
  Chawla (§26). The WIO/PIO Hub calls `startWorkflow(user, "pio_approval",
  "pio", pioId)` after Manika Nanda's Triangle check passes — it never
  implements approvals itself.

## 9. AI Service Abstraction

- **Interface:** [lib/ai/types.ts](../frontend/lib/ai/types.ts) `AiProvider`
  — the application depends on this, never on a vendor SDK (ruling #5).
- **Providers:** `anthropic` (active — official SDK, model from config,
  default `claude-sonnet-4-6`), `azure_openai` and `copilot` registered as
  fail-loud stubs: selecting an unimplemented provider errors, never silently
  reroutes.
- **Entry points:** [lib/ai/index.ts](../frontend/lib/ai/index.ts)
  `aiComplete(user, {purpose, prompt, ...})` — permission-gated
  (`ai_access`), audited with purpose + token counts — and
  `aiCompleteFromPrompt(user, promptCode, vars)` reading
  `portal.ai_prompts` (modular prompts as data; modules own their prompts).
- AI context rule: anything building AI context resolves departments, config,
  and org structure through the master services above — never hardcoded.

## 10. Configuration System

- **Table:** `portal.app_config` (JSONB values, categories, descriptions).
- **Service:** [lib/services/config.ts](../frontend/lib/services/config.ts)
  — `getConfig(key, fallback)` (30s in-process cache), `setConfig()`
  (audited).
- Seeded keys: WIO window/alert day, AR ladder, pulse schedule, Rimadesio
  block, exit-protocol time, profile red threshold, AI provider/model, RBAC
  audit mode, notification channels, Keka department mapping.

## How a module plugs in (WIO/PIO Hub as the worked example)

1. Resolve the acting user: `getCurrentUser()` → RBAC via
   `requirePermission(user, "create", "wio")` → data via `withUserContext`
   (RLS-scoped SQL).
2. Departments for routing come from `getDepartments()`; the WIO insert
   fails at the DB if the code isn't in the master.
3. Thresholds (15-day window, day-12 alert) come from `getConfig()`.
4. Day-12/lapse alerts fire with `notify({templateCode: "wio_day12_alert" …})`.
5. PIO release starts `startWorkflow(user, "pio_approval", "pio", pioId)`;
   the hub renders `getWorkflowInstance()` state and calls `actOnWorkflow()`
   from the approver's screen.
6. Any AI assist (e.g. drafting a delay note) goes through
   `aiCompleteFromPrompt()` with a prompt row the module seeds.
7. Every mutation writes `writeAudit()` (the services above already cover
   permissions/workflow/config/AI).

## Testing

```bash
cd db && npm run validate   # schema + seeds + 15 smoke checks in embedded PG
cd db && npm run dev-db     # local wire-protocol dev database :55432
cd frontend && npm run typecheck && npm run lint && npm run build
# live checks (dev server + dev-db running):
curl http://localhost:3000/api/me
curl http://localhost:3000/api/departments?tree=1
curl http://localhost:3000/api/factory/stations
curl http://localhost:3000/api/notifications
```
