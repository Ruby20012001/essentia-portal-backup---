# DECISIONS — Architecture Decision Log

> Load-bearing decisions and *why*, so a future session doesn't re-litigate them.
> Newest first. Immovable brand/business constraints live in [`CLAUDE.md`](CLAUDE.md);
> longer-form rationale in [`docs/ASSUMPTIONS_DECISIONS.md`](docs/ASSUMPTIONS_DECISIONS.md).

---

### ADR-013 — AI is strictly advisory
The workflow AI **never** approves, rejects, delegates, or mutates state (no
INSERT/UPDATE/DELETE). It only computes advice (e.g. SLA risk) and, when the API
key is absent, says so honestly. Never fabricate a live integration.
**Guarded by** `workflow-advisory.test.ts` (asserts no writes; degrades without blocking).

### ADR-EP-01 — Configuration-driven, not hard-coded (standing direction, Monica, 2026-07-17)
Anything HR/ops will want to tweak is generated from **template rows**, not code.
Code holds only a small resolver registry keyed by a `source_kind`/strategy name.
**Reference impl:** Succession Pack (`portal.succession_pack_sections` +
`RESOLVERS`). Same shape reused for notification recipients and scheduler HANDLERS.
Apply this pattern to future features by default.

### ADR-EV-01 — Publish events; never notify directly
Business logic calls `publishEvent(...)`; the notification framework owns
recipients, channels and templates. **Corollary:** when you add an event, supply
every `{{var}}` its db/010 template interpolates — a missing var ships a raw
placeholder to a real user. (Bit us twice: `{{resourceRef}}`, `{{title}}`.)

### ADR-HS-01 — Honest state over green dashboards (Brief §38)
An action that cannot actually run is recorded `not_wired` / `partial`, never
reported done. Exit Protocol counts "removals not done"; only 2 of 6 removals are
real today (approval-authority revoke + partial SSO). Wiring Graph / WhatsApp /
telephony is genuine remaining work, not a bug to paper over.

### ADR-WF-01 — Escalation transfers, it doesn't just notify
On SLA breach the engine marks the original task `escalated`/`timed_out` **and
materialises a task for the escalation target** (with no deadlines), so the target
can actually act. Previously they were notified then 403'd. (Step 7 audit fix.)

### ADR-WF-02 — SLA warn/breach fire exactly once
Stamped via `sla_warned_at` / `sla_breached_at` (db/026) instead of writing a
breach audit row on every 5-minute tick. Timeout failures are counted
(`timeoutFailures`) and audited `WORKFLOW_TIMEOUT_FAILED`, never silently swallowed.

### ADR-WF-03 — Definitions: archive, never hard-delete
`archiveDefinition` sets `is_active=FALSE`; `startWorkflow` requires `is_active`, so
archiving stops **new** instances while running ones continue. Nothing is hard-deleted
(`workflow_groups` cascade would sever running history). To revise a live chain:
**duplicate → edit the copy → archive the original**. Duplicates are created INACTIVE.

### ADR-WF-04 — Delegated decisions keep the original approver on record
When someone acts on behalf of another (`actingAssigneeId !== user.id`), the audit
`newValues` records `{ onBehalfOf: true, originalApprover }`. Attribution is never lost.

### ADR-FE-01 — Dark theme is the default; tokens are the only source of colour
Premium dark theme, ratified 2026-07-13 (supersedes Cold Coffee). All colour
lives in `frontend/tailwind.config.ts` (legacy token names retained but remapped to
dark equivalents). Style with semantic classes; **no inline hex anywhere**. Lato only.

### ADR-FE-02 — Read-only detail; acting stays on My Approvals
The Workflow Detail screen (S2) is read-only — it shows the timeline, delegation
chain, SLA and a **read-only** AI advisory (no action buttons). Decisions are taken
only on My Approvals (S3). Detail is visible to leadership (`read:workflows` scope
`all`) or to a **participant** on that instance; the cross-event Audit tab reads
`audit.log`, so it is leadership-only.

### ADR-RM-01 — Read models aggregate existing sources; they never copy into new tables
`getWorkflowAudit()` unifies three existing sources (workflow_actions + audit.log +
events/notification_deliveries) for one instance. The notification→instance link is
the one that already exists: workflow events carry `payload.instanceId`, so a
delivery joins back through its event. No new table, no new business logic.

### ADR-DB-01 — Additive numbered migrations; PGlite single-connection for dev
Never edit a shipped migration; add the next number and register it in
`db/lib.mjs`. Dev DB is single-connection PGlite over the wire — don't open a second
raw `pg` connection while `next dev` runs (it wedges). Read state through app HTTP APIs.

### ADR-PROC-01 — Verify before "building" a Phase-4 step
All 10 workflow steps were already implemented; twice a "build Step N" request was
really a test-gap + compliance-audit task, and both audits found real defects.
**Default: verify what exists first, then close the gap.**
