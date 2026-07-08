# Phase 4 — Workflow Engine Generalization · Implementation Plan (v1)

> **Status: PLAN ONLY — no code written.** For review and approval before implementation.
> Branch: `feature/workflow-engine-v1`. Built to PAS §4 and MDG. Awaiting sign-off.

The existing engine drives one workflow (the PIO approval chain) as a **sequential,
single-approver** chain. Phase 4 generalizes it into a reusable engine every future
module (WO, BOQ, letters, CRM, procurement) approves through — adding parallel and
conditional topologies, SLAs, delegation, escalation, timeouts, and reminders — **without
breaking the PIO chain**.

---

## 1. Objectives

1. **One engine, many workflows.** Any module starts an approval by inserting a
   definition (data) and calling `startWorkflow` — no bespoke approval code (MDG §7).
2. **Richer topologies:** sequential, **parallel (N-of-M quorum)**, and **conditional
   routing** (skip/branch on instance context).
3. **Time-aware:** per-step **SLA**, **timeout** actions, and **auto-reminders**, swept by
   the scheduler (Phase-3.5 auto-pilot).
4. **Delegation & escalation** as first-class, audited actions.
5. **Zero regression:** the PIO chain (Khushpreet → Deepak Ji → Hardesh) behaves
   identically on the new engine.

## 2. Scope

**In scope:** definition versioning; step-groups (parallel) + ordering (sequential);
conditional predicates; SLA/timeout/reminder; delegation (ad-hoc + standing);
escalation ladders; a generic Approval Inbox + Timeline UI; scheduler/notification/
audit/event integration; advisory AI hooks.

**Out of scope (explicitly, to avoid a BPMN trap):** arbitrary cyclic graphs / loops;
sub-workflows / compensation; a drag-and-drop visual designer (possible later phase);
cross-instance dependencies. Topologies are limited to **sequence of groups, each group
a parallel quorum, each group optionally conditional.** This covers every approval the
Brief describes without an unbounded engine.

## 3. Current state (baseline — what we build on)

| Table | Today | Gap for Phase 4 |
|---|---|---|
| `workflow_definitions` | code, name, resource_type, is_active | no version |
| `workflow_steps` | step_no, approver_type (`user`/`access_level`), approver_user_id/level/email/hint | no group, quorum, condition, SLA, timeout, reminder, escalation |
| `workflow_instances` | status, **current_step**, one-live-per-doc | no context, no per-task state, no deadlines |
| `workflow_actions` | approve/reject, acted_by, comments | no delegate/escalate/timeout/auto actions |

Engine (`lib/services/workflows.ts`): `startWorkflow`, `actOnWorkflow` (CAS advance +
exact-approver), `getWorkflowInstance`. Sequential, single approver, CAS concurrency,
one live instance per document.

## 4. Database changes (migration `013_workflow_engine_v1`, additive)

Additive + nullable-with-defaults so the PIO chain is unaffected (ADR-010; forward-only).

**Extend `workflow_definitions`:** `version INT DEFAULT 1`.

**Extend `workflow_steps`:**
- `step_group INT` (default = `step_no`) — steps sharing a group run **in parallel**;
  groups run **in sequence**.
- `quorum INT DEFAULT 1` — approvals needed to complete the group (N-of-M).
- `condition JSONB` (nullable = always-run) — predicate over instance `context` (§Conditional).
- `sla_hours INT`, `timeout_hours INT`,
  `timeout_action VARCHAR CHECK (auto_approve|auto_reject|escalate)`,
  `reminder_hours INT`, `escalation_step_ref` (approver spec for escalation).

**Extend `workflow_instances`:**
- `context JSONB DEFAULT '{}'` — the data conditions evaluate against (amount, dept, flags).
- `current_group INT` (mirrors/replaces `current_step`; keep `current_step` as an alias
  during transition).
- `deadline_at TIMESTAMPTZ` (optional overall deadline).

**New `portal.workflow_tasks`** — the per-approver runtime unit (needed for parallel,
delegation, per-step SLA):
```
id, instance_id FK, step_no, step_group,
assignee_user_id, delegated_to_user_id,
status CHECK (pending|approved|rejected|skipped|delegated|timed_out|escalated),
sla_due_at, reminded_at, acted_by, acted_at, comments,
UNIQUE (instance_id, step_no, assignee_user_id)
```
Indexes: `(assignee_user_id, status)` for the inbox; partial `(sla_due_at) WHERE
status='pending'` for the sweep.

**New `portal.workflow_delegations`** (standing/out-of-office): `delegator_id,
delegate_id, from_date, to_date, workflow_code (nullable=all)`.

**Extend `workflow_actions`:** widen the `action` CHECK to add
`delegate|escalate|timeout|auto_approve|auto_reject|remind`; add `delegated_to`.

Grants to `essentia_app` (db/007 pattern).

## 5. Workflow DSL / state machine

A definition is a **versioned ordered set of groups**; each group is a set of tasks with
a quorum and an optional condition. Represented **relationally** (queryable, consistent
with "structure is data") — not a monolithic JSON blob.

**Instance state machine:** `pending → (advance groups) → approved | rejected | cancelled
| expired`.
**Task state machine:** `pending → approved | rejected | skipped | delegated | timed_out
| escalated`.

**Advance rule:** a group completes when its `quorum` of tasks are `approved` (parallel);
any `rejected` task fails the instance (configurable: reject-fails-fast, default true).
On group completion, advance `current_group` (CAS) and materialize the next group's tasks
(skipping groups whose condition is false).

## 6. Services (`lib/services/workflows.ts`, generalized)

- `startWorkflow(code, resourceType, resourceId, context, startedBy)` — resolves the
  definition version, evaluates the first applicable group, materializes tasks, sets SLAs.
- `actOnWorkflow(taskId, action, actor, comments)` — CAS on the **task**, then recompute
  group completion + advance. Exact-approver (or valid delegate) enforced.
- `delegateTask(taskId, toUser, actor)` / standing-delegation resolution at assignment.
- `evaluateWorkflowTimers()` — the scheduler sweep: SLA breaches → escalate/notify;
  timeouts → `timeout_action`; reminders → notify. Idempotent.
- Pure helpers (unit-tested): `evaluateCondition(context, predicate)`, `computeSlaDueAt`,
  `resolveAssignee` (user | access_level | delegate).
- **Backward-compat:** PIO = 3 groups of 1, quorum 1, no condition/SLA → identical behavior.

## 7. APIs

| Method · Path | Purpose |
|---|---|
| `GET /api/workflows` | My approval inbox (pending tasks across all workflows) |
| `GET /api/workflows/[id]` | Instance + tasks + timeline |
| `POST /api/workflows/[id]/act` | Approve/reject a **task** (extends today's step act) |
| `POST /api/workflows/[id]/delegate` | Delegate a task |
| `GET·POST /api/workflows/definitions` | View / manage definitions (admin) |
| `POST /api/jobs/workflow-timers` | Scheduler-driven SLA/timeout/reminder sweep |

All behind the middleware gate + `requirePermission` on `workflows`; RLS scopes task
visibility to the assignee (L0/L1 broad).

## 8. UI

- **Approval Inbox** (`components/workflow/ApprovalInbox`) — my pending tasks, SLA
  countdown, approve/reject/delegate. Reusable across modules.
- **Workflow Timeline** (`components/workflow/WorkflowTimeline`) — groups, approvers,
  status, timestamps, SLA/escalation markers. Drops into the WIO/PIO Hub and future
  module pages.
- Cold-Coffee palette; loading/empty/error states; deep links from notifications (MDG §6).

## 9. Approval topologies

**Sequential** (default) — one group per step, quorum 1. This is today's behavior.

**Parallel (N-of-M)** — a group with M tasks and `quorum = N`; completes when N approve.
Each vote is a CAS on its task; group completion is a single atomic count check — no
double-count, safe under concurrent approvals (no `FOR UPDATE`, per PGlite constraint).

**Conditional routing** — each group carries an optional `condition` (JSON predicate).
At advance time, groups whose condition is false against `instance.context` are
**skipped** (task status `skipped`, audited). Enables e.g. "amount > ₹10L requires CEO",
"EH discount needs Amit". A restricted predicate DSL only (no code eval) — see risks §22.

## 10. SLA engine

Each task gets `sla_due_at = assigned_at + step.sla_hours` (calendar hours v1; business
hours a future option). The `workflow-timers` scheduler job sweeps
`status='pending' AND sla_due_at < now()`, emits `workflow.sla_breached`, and triggers the
escalation ladder. Indexed partial scan; deduped per task per breach.

## 11. Delegation

- **Ad-hoc:** `delegateTask` reassigns a task's effective approver for that task; recorded
  as a `delegate` action; audited (delegator + delegate).
- **Standing (out-of-office):** `workflow_delegations` rows; at task materialization the
  assignee is resolved through any active delegation window.
- The delegate becomes the **exact-approver** — the identity check accepts them; the
  original assignee is retained for the audit trail.

## 12. Escalations

On SLA breach or timeout-with-`escalate`, the task escalates to `escalation_step_ref`
(a named approver / access level / a ladder). Reuses the AR-ladder pattern (§36) and the
event bus. Event `workflow.escalated` → notification to the escalation target + the
originator.

## 13. Timeout handling

`timeout_hours` + `timeout_action` (`auto_approve` | `auto_reject` | `escalate`). The
sweep detects timed-out pending tasks and applies the action via CAS, records a
`timeout`/`auto_*` action, and publishes the corresponding event. Auto-decisions are
constrained to steps whose definition explicitly opts in (never a silent default).

## 14. Scheduler integration

One new **registered job** `workflow-timers` (interval, e.g. every 15 min) in
`portal.scheduled_jobs`, running `evaluateWorkflowTimers()` as the L1 auto-pilot account.
Idempotent (task-state guards + event dedupe). Dead-letters alert platform admins via the
policy shipped in `012`. No new scheduler mechanism — just a new handler + registry row.

## 15. Notification integration

New domain events (data-driven `event_routes`): `workflow.task_assigned`,
`workflow.reminder`, `workflow.sla_breached`, `workflow.escalated`, `workflow.delegated`,
`workflow.timed_out`, plus the existing `workflow.approved` / `workflow.rejected`. New
templates where needed. **No direct sends** — the engine publishes; the framework
delivers (ADR-004). Recipients via existing strategies (`workflow_step_approver` extended
to task assignee) + `platform_admins` for ops alerts.

## 16. Audit integration

Every task transition and decision (assign, approve, reject, delegate, escalate, timeout,
auto-decision, skip) writes through `writeAudit` (single choke point, immutable). The
approval history is fully reconstructable — who, when, why, and which delegate.

## 17. Event integration

All state changes publish domain events (ADR-004); the workflow engine becomes a first-
class publisher. Consumers: notification engine (alerts), dashboards (approval load,
SLA health), and future analytics. Events are immutable + deduped (PAS §5).

## 18. AI integration (advisory only — ADR-013)

Optional, behind the `lib/ai` abstraction and **never autonomous**:
- **Summarize-for-approver** — a concise brief of the document under review.
- **Anomaly / risk flag** — highlight unusual amounts/terms for the human to weigh.
- **Suggested approver / routing hint** — advisory only; the human still decides.
Model, prompt version, inputs, and output are audited (explainability). **No AI
auto-approval, no irreversible AI action** — every AI touch has a human gate.

## 19. Test strategy (MDG §12)

- **DB harness:** parallel quorum completion; conditional group skip; concurrent-approval
  CAS (no double-advance); SLA due computation; timeout action; delegation exact-approver;
  **PIO-chain regression** (the current 3 checks must still pass unchanged).
- **Unit (vitest):** `evaluateCondition` (predicate DSL), `computeSlaDueAt`,
  `resolveAssignee`/delegation resolution — all pure.
- **E2E (HTTP):** a multi-group parallel + conditional workflow end-to-end; a delegation
  path; an SLA-breach → escalation path (driven by a `workflow-timers` tick).
- **Regression:** full existing suite green (harness 44, unit 25) before and after.

## 20. Migration strategy

- One additive migration `013_workflow_engine_v1` (forward-only, idempotent). Nullable
  columns + defaults reproduce current behavior; no shipped migration edited (ADR-010).
- **Backfill:** materialize `workflow_tasks` for any in-flight `pending` instances. Dev
  has no real data (trivial); the prod backfill (once RDS exists) is a one-shot script
  documented in the migration.
- Register `013` in `db/lib.mjs`; harness must load `001`–`013` clean.

## 21. Rollout strategy

1. Land `013` + generalized engine; **migrate the PIO chain first** to prove
   backward-compat (its harness checks stay green).
2. Add the `workflow-timers` job; verify SLA/timeout/reminder on a test definition.
3. Ship the Approval Inbox + Timeline UI.
4. Optional config flag `workflow.engine_version` for a staged cutover if needed.
5. Green bar (harness/unit/typecheck/lint/build) + E2E + live check, then **merge
   `feature/workflow-engine-v1` → `platform-baseline-v1`** (no-ff, per Step 1 pattern).
6. New modules (WO, BOQ, letters, CRM) adopt the engine as they are built.

## 22. Architectural risks (identified before implementation)

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **PIO-chain regression** — generalizing breaks the live approval | High | Additive schema + behavior-preserving defaults; PIO regression tests gate the merge |
| R2 | **Parallel/quorum concurrency** — double-count / double-advance under simultaneous approvals | High | CAS on task rows + single atomic group-completion count; no `FOR UPDATE` (PGlite) |
| R3 | **Condition predicate safety** — evaluating arbitrary expressions | High | A **restricted JSON predicate DSL** (whitelisted fields + operators, no `eval`, no SQL interpolation) |
| R4 | **Complexity creep toward BPMN** — unbounded engine | Medium | Hard scope: sequence-of-groups + quorum + conditional only; loops/sub-flows explicitly out |
| R5 | **SLA sweep scale** — frequent sweeps over many tasks | Medium | Partial index on `sla_due_at`; bounded batches; dedupe; 15-min cadence |
| R6 | **Delegation × exact-approver** — wrong person approves | Medium | Effective-approver resolution records delegator + delegate; identity check accepts only the resolved approver |
| R7 | **Auto-decisions (timeout)** — silent auto-approve of something sensitive | Medium | Opt-in per step only; audited + evented; never a default; sensitive resources disallow auto_approve by policy |
| R8 | **RLS for the inbox** — approver sees tasks they shouldn't | Medium | Task RLS: assignee sees own; L0/L1 broad; verified under `essentia_app` |
| R9 | **PGlite dev limits** — single connection, no row locks | Low | Continue CAS/single-statement pattern already proven in the platform |

**Recommendation:** proceed in the Rollout order above, gating each step on the PIO
regression staying green. The single most important guardrail is **R1** — migrate and
prove the existing chain before adding any new topology.

---

*Awaiting approval. On sign-off, implementation begins with migration `013` + the
generalized engine (Rollout step 1). No code will be written before then.*
