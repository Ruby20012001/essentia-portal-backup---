# ARCHITECTURE

> The shape of the system and the load-bearing patterns. This is the map; the
> territory in full is [`docs/architecture/`](docs/architecture/) — this file
> points there rather than repeating it.

## Deeper docs (authoritative, don't duplicate here)
| Topic | File |
|---|---|
| Platform spec | [`docs/architecture/PLATFORM_ARCHITECTURE_SPECIFICATION.md`](docs/architecture/PLATFORM_ARCHITECTURE_SPECIFICATION.md) |
| Diagrams | [`docs/architecture/DIAGRAMS.md`](docs/architecture/DIAGRAMS.md) |
| Workflow engine | [`docs/architecture/WORKFLOW_ENGINE_SPECIFICATION.md`](docs/architecture/WORKFLOW_ENGINE_SPECIFICATION.md), [`workflows.md`](docs/architecture/workflows.md) |
| RBAC | [`docs/architecture/rbac.md`](docs/architecture/rbac.md) |
| Events & notifications | [`docs/architecture/events-notifications.md`](docs/architecture/events-notifications.md), [`docs/notifications.md`](docs/notifications.md) |
| Scheduler | [`docs/scheduler.md`](docs/scheduler.md) |
| Database | [`docs/architecture/database.md`](docs/architecture/database.md) |
| API catalogue | [`docs/architecture/api-catalogue.md`](docs/architecture/api-catalogue.md) |
| Tech debt / readiness / roadmap | [`TECH_DEBT.md`](docs/architecture/TECH_DEBT.md) · [`PRODUCTION_READINESS.md`](docs/architecture/PRODUCTION_READINESS.md) · [`ROADMAP.md`](docs/architecture/ROADMAP.md) |

## Layers
```
app/(portal)/*         Server components + route handlers (Next.js App Router)
  page.tsx             Gate with can(user, action, resource) → call a service → render
  api/*/route.ts       Thin: parse → requirePermission → service → JSON
components/*            Presentational; portal design system only (tokens, no inline hex)
lib/services/*         ALL business logic + SQL lives here (the read/write surface)
lib/db                 query() / withUserContext() over PGlite (dev) / Postgres (prod)
lib/auth               getCurrentUser, session
db/*.sql               Additive, numbered migrations; listed in db/lib.mjs DEFAULT_FILES
db/validate.mjs        In-process PGlite harness (96 checks) — the schema/SQL contract
```

## Database
PostgreSQL 15 + pgvector; **7 schemas** (`public`, `ee`, `eh`, `factory`, `proc`,
`portal`, `audit`). Migrations are **additive and numbered** (`001`…`027`, plus
`900_dev_fixtures`) and must be added to `DEFAULT_FILES` in `db/lib.mjs`. RLS on
sensitive tables via `withUserContext()` (sets the `essentia_app` role + user GUCs).
**The golden thread:** `project_code` (`ED/YY-YY/NNN`) links every document; all
document numbers are sequence-generated (formats fixed in `CLAUDE.md`).

Dev DB is **PGlite over the wire** (`db/dev-db.mjs`, `127.0.0.1:55432`),
**single-connection** (`PGPOOL_MAX=1`). It is fragile ("A-15"): a second raw `pg`
connection opened while `next dev` runs wedges it (port listens but ECONNRESET).
Recovery: restart `dev-db.mjs`. Prefer reading state through the app's own HTTP
APIs (e.g. `/api/audit`, `/api/workflows/[id]`) rather than a second connection.

## Workflow engine (Phase 4)
`Definition → Groups → Tasks → Actions`. Key mechanics:
- **Effective approver** = `COALESCE(delegated_to_user_id, assignee_user_id)`.
- **Concurrency** = compare-and-swap (`UPDATE … WHERE status='pending' RETURNING`);
  losers see the state moved on.
- **Quorum** per group (N-of-M); **conditional routing** via a small DSL
  (`{field, op, value}` + `and/or/not`) rendered for humans by `describeCondition()`.
- **SLA timers**: warn / breach fire **exactly once** (stamped `sla_warned_at` /
  `sla_breached_at`, db/026); escalation **transfers** (marks the original
  `escalated`/`timed_out` and materialises a task for the target so they can act);
  timeouts auto-approve/reject via `actOnWorkflow`; failures are counted + audited
  (`WORKFLOW_TIMEOUT_FAILED`), never swallowed.
- Services: `workflows.ts` (act), `workflow-delegations.ts`, `workflow-timers.ts`,
  `workflow-oversight.ts`, `workflow-detail.ts` + `workflow-audit.ts` (read models),
  `workflow-sla-monitor.ts`, `workflow-definitions.ts`, `workflow-advisory.ts`.

## Cross-cutting patterns (the load-bearing ones)
1. **Configuration-driven, not hard-coded** (Monica's standing direction). Generate
   from template rows so the business changes contents without code. Reference impl:
   Succession Pack — `portal.succession_pack_sections` rows are the template, code
   holds only a small `source_kind` RESOLVER REGISTRY. Same shape as notification
   recipient strategies and scheduler HANDLERS. See [`DECISIONS.md`](DECISIONS.md) ADR-EP-01.
2. **Publish events, don't notify directly.** Business code calls `publishEvent(...)`;
   the notification framework decides recipients/channels/templates. When adding an
   event, **supply every `{{var}}` its template interpolates** (db/010) — a missing
   var ships a raw placeholder to a real user. This has bitten twice; unit tests now guard it.
3. **AI is strictly advisory (ADR-013).** It never approves/rejects/delegates/mutates
   — no INSERT/UPDATE/DELETE. It degrades honestly (reports `ANTHROPIC_API_KEY is not
   set`); it never fabricates a live integration.
4. **RBAC** L0 (founders) → L3 (staff). `requirePermission` / `can(user, action,
   resource)` returns a scope: `all` (L0/L1), `own_dept` (L2), `own_records` (L3).
   Pages gate before rendering; screens that read `audit.log` are leadership-only.
5. **Honest state.** An unperformed action is recorded `not_wired`/`partial`, never
   reported as done (Brief §38). The Exit Protocol board counts "removals not done".
6. **Scheduler** = a HANDLERS registry (name→handler) over `scheduled_jobs`
   (interval or daily `HH:MM`), single-fire via `UNIQUE(job_id, scheduled_for)`,
   driven by an external tick.

## Frontend / brand
Premium dark theme, **tokens are the single source of truth** in
`frontend/tailwind.config.ts` — style with semantic classes (`bg-canvas`, `bg-card`,
`text-secondary`, `border-line`…), **never inline hex**. **Lato only** (300/400/700).
The shell is responsive: `Sidebar` is `hidden md:flex`, `MobileNav` is a drawer below
768px, and both consume the shared `NavGroups` so they can't drift. Re-check
320/768/1024/1440 for horizontal scroll on every new screen.
