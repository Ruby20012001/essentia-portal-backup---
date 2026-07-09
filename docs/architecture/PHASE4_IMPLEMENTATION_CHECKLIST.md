# Phase 4 — Workflow Engine Implementation Checklist

Working checklist for building the engine to [WES v1.0](WORKFLOW_ENGINE_SPECIFICATION.md).
Tick items as they land. **Concise and actionable** — the "why" lives in the WES; this is
the "did we do it." Every item's acceptance is: it works **and** the green bar holds.

**Baseline to protect (must stay green throughout):** harness **44/0**, unit **25/25**,
typecheck, lint, build; live WIO/PIO Hub, Notifications, Scheduler, Keka unchanged.

Legend: `[ ]` todo · `[x]` done. Each line: **item — done means…**

---

## 1. Database (migration `013`)

- [ ] **Migration 013 created** — `db/013_workflow_engine_v1.sql`; registered in `db/lib.mjs`; harness loads `001`–`013` clean.
- [ ] **Forward-only migration** — additive; no shipped migration edited; idempotent (`IF NOT EXISTS` / `ON CONFLICT`).
- [ ] **Rollback strategy documented** — compensating down-path / restore-point noted in the migration header (ADR-010).
- [ ] **Existing PIO data preserved** — `pio_approval` re-expressed as 3 groups × 1 approver, quorum 1; approver identities intact.
- [ ] **Existing workflow instances migrate safely** — pending instances materialize `workflow_tasks` from `current_step`; row counts verified before/after; nothing dropped until confirmed (dev = re-seed).
- [ ] **Indexes added** — `workflow_tasks(assignee,status)`; partial `(sla_due_at) WHERE pending`; partial `(timeout_at) WHERE pending`; instance one-live guard; `workflow_actions(instance_id,acted_at)`.
- [ ] **Constraints verified** — status CHECKs; `UNIQUE(instance_id,group_no,assignee)`; `UNIQUE(definition_code,group_no)`; one-live-instance partial unique; FKs to golden thread/users.
- [ ] **RLS reviewed** — `workflow_tasks` fenced under `essentia_app` (assignee sees own; L0/L1 broad); grants added; verified via a harness restricted-role check.
- [ ] **`workflow_steps` disposition** — retired (or documented deferral) only after group model confirmed populated.

## 2. Engine (`lib/services/workflows.ts`, generalized)

- [ ] **Workflow groups implemented** — definition resolves ordered groups; group meta (quorum/condition/SLA/timeout) honored.
- [ ] **Group approvers implemented** — `workflow_group_approvers` resolve to assignees (`user | access_level | role | dynamic`).
- [ ] **Workflow tasks implemented** — group activation materializes one task per approver (through active delegations).
- [ ] **CAS concurrency maintained** — every state change is single-statement compare-and-swap; **no `FOR UPDATE`** (WE-ADR-003).
- [ ] **Exact approver validation maintained** — only the resolved effective approver (or admin) may act; wrong → 403; unresolved → 409.
- [ ] **Parallel approvals implemented** — quorum completion; first-approval skips siblings; atomic count; reject policy (`fail_fast`/`continue`).
- [ ] **Sequential approvals preserved** — advance via CAS on `current_group`; PIO chain identical.
- [ ] **Conditional routing implemented** — restricted JSON predicate evaluator (`evaluateCondition`), validated at save; false groups `skipped`; **no eval/code/SQL**.
- [ ] **Delegation implemented** — ad-hoc + standing (`workflow_delegations`); cycle-safe resolution; both identities audited.
- [ ] **SLA timers implemented** — `sla_due_at`/`warn_at`/`timeout_at` set at assignment from timestamps (calendar hours v1).

## 3. Scheduler

- [ ] **Workflow timers registered** — `workflow-timers` job row in `portal.scheduled_jobs`; handler `evaluateWorkflowTimers()` runs as the L1 auto-pilot account.
- [ ] **Retry policy verified** — inherits scheduler max_attempts + backoff; harness/live proof.
- [ ] **Dead-letter verified** — exhausted sweep dead-letters → `scheduler.job_dead` → `platform_admins` (policy `012`).
- [ ] **Locking verified** — single-fire via `UNIQUE(job_id,scheduled_for)`; no double-sweep under two ticks.
- [ ] **Idempotency verified** — a re-run neither double-escalates nor double-decides (task-state guards + event dedupe).

## 4. Events

- [ ] **All workflow events published** — started, group_activated, task_created, task_reminded, sla_warning, sla_breached, task_delegated, task_completed, escalated, timed_out, approved, rejected, cancelled, expired.
- [ ] **Event naming verified** — `domain.action`, lowercase; new routes in `portal.event_routes`; legacy `workflow.step_*` still valid during transition.
- [ ] **Payload versioning verified** — minimal payloads (IDs + entityRef); additive-only; breaking change → new event name.
- [ ] **Dedupe keys verified** — every re-publishable event carries a `dedupeKey` (per WES §11 table); harness proves no duplicate side effects.

## 5. Notifications

- [ ] **Approval notifications** — `task_created` → assignee (`workflow_task_assignee` strategy), `approval_request` template.
- [ ] **Escalation notifications** — `sla_breached`/`escalated` → assignee + escalation target, urgent.
- [ ] **Reminder notifications** — `task_reminded` on cadence while pending.
- [ ] **Timeout notifications** — `timed_out` → starter + (if escalate) target.
- [ ] **Completion notifications** — `approved`/`rejected` → starter.
- [ ] **Preference filtering verified** — channel opt-ins + category mutes honored; **urgent may bypass quiet hours**; in-app floor; no direct sends (ADR-004).

## 6. Security

- [ ] **Permission checks** — `requirePermission` on `workflows` for read/approve/reject/delegate/manage; deny-by-default.
- [ ] **RLS enforcement** — task/instance visibility fenced under `essentia_app`; verified per level.
- [ ] **Audit logging** — every action (assign/approve/reject/delegate/escalate/timeout/auto/skip/cancel) via `writeAudit`; insert-only.
- [ ] **Delegation security** — only assignee/admin delegate; delegate active; window enforced; both identities audited.
- [ ] **No privilege escalation** — system account performs only opt-in auto/timeout actions, clearly attributed; no human impersonation; auto-decisions disallowed on sensitive resources unless opted in.

## 7. AI

- [ ] **Advisory only** — summarize / recommend / highlight anomalies / estimate SLA-breach risk; behind `lib/ai`.
- [ ] **No state mutation** — AI never approves/rejects/delegates/alters SLA or quorum; AI failure never blocks a workflow.
- [ ] **Prompt versioning** — prompts from the versioned library; no inline prompt strings.
- [ ] **Audit** — model + prompt version + inputs + output recorded (explainability).

## 8. Testing (MDG §12)

- [ ] **Unit** — `evaluateCondition` (grammar/forbidden-op/absent-field/bounds), SLA/warn/timeout arithmetic, delegation resolution.
- [ ] **Integration** — group activation/skip, quorum completion, advance CAS, task/instance invariants.
- [ ] **Workflow** — full multi-group parallel + conditional instance end-to-end.
- [ ] **Parallel approval** — concurrent approvals: one wins, siblings skipped, no double-advance.
- [ ] **Quorum** — N-of-M completes exactly at N; reject policies.
- [ ] **Delegation** — ad-hoc + standing; delegate acts, both audited; cycle safety.
- [ ] **Scheduler** — `workflow-timers` warning/breach/reminder/timeout; idempotent under retry; single-fire.
- [ ] **Events** — routing + dedupe for all workflow events.
- [ ] **Notifications** — each trigger delivers/renders; preference + quiet-hours filtering.
- [ ] **Regression (PIO)** — the existing PIO harness checks pass **unchanged**; full suite green.
- [ ] **Performance** — inbox + act within WES §15 targets on a seeded set; sweep throughput.

## 9. Rollout Order (MUST follow exactly)

Each step gates the next: **do not proceed until the prior step is green** (harness + unit + typecheck + lint + build).

1. [ ] **Migration 013** — schema + PIO re-expressed as groups; harness loads `001`–`013`.
2. [ ] **Engine refactor** — groups/approvers/tasks + CAS; `startWorkflow`/`actOnWorkflow` on the task model.
3. [ ] **PIO regression** — the existing PIO chain behaves identically; existing checks green. **Hard gate.**
4. [ ] **Parallel approvals** — quorum, reject policy, sibling-skip.
5. [ ] **Conditional routing** — predicate evaluator + save-time validation + skip.
6. [ ] **SLA engine** — timers set from timestamps; warn/breach/reminder state.
7. [ ] **Scheduler integration** — `workflow-timers` job; sweep applies timers/timeouts.
8. [ ] **Delegation** — ad-hoc + standing resolution.
9. [ ] **Notifications** — all workflow events routed + templated.
10. [ ] **AI advisory hooks** — summarize/flag/estimate (advisory only).
11. [ ] **Final regression** — full green bar + E2E + performance; WIO/Notifications/Scheduler/Keka unaffected.

## 10. Success Criteria (Definition of Done)

Implementation is complete **only when all** hold:

- [ ] Existing **PIO workflow behaves identically**.
- [ ] Existing tests remain **green** (harness 44, unit 25 — plus new tests added).
- [ ] **New tests pass** (parallel, quorum, conditional, SLA, delegation, scheduler, events, notifications).
- [ ] **No regression in WIO.**
- [ ] **No regression in Notifications.**
- [ ] **No regression in Scheduler.**
- [ ] **No regression in Keka.**
- [ ] **Performance targets from WES §15 met.**

On all boxes ticked: green bar + E2E + live check, then merge `feature/workflow-engine-v1`
→ `platform-baseline-v1` (`--no-ff`).

---

*No code yet. On approval, begin at Rollout step 1 — migration `013`.*
