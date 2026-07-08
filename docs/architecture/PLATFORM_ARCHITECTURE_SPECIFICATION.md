# Platform Architecture Specification (PAS v1.0)

> **Status:** Ratified against baseline `v0.1-platform-foundation` · 2026-07-08.
> **Nature:** This is the **engineering contract**. Every future module (VisionCAM, BOQ,
> Procurement, Factory, CRM Intelligence, Executive Dashboards, and all others) **MUST**
> conform to it. It codifies patterns already proven in the foundation into binding
> standards. Changes to this document require an architecture review (see §12).
>
> **Language:** MUST / MUST NOT / SHOULD / MAY are used in the RFC-2119 sense — MUST is
> non-negotiable; SHOULD is a strong default requiring justification to deviate.

**Contents:** [1 Vision](#1-platform-vision) · [2 Layers](#2-layered-architecture) ·
[3 Module Contract](#3-module-contract) · [4 Workflow](#4-workflow-standards) ·
[5 Events](#5-event-standards) · [6 Scheduler](#6-scheduler-standards) ·
[7 Notifications](#7-notification-standards) · [8 AI](#8-ai-standards) ·
[9 Coding](#9-coding-standards) · [10 Production](#10-production-standards) ·
[11 Module Checklist](#11-future-module-checklist) · [12 ADRs](#12-architecture-decision-records)

---

## 1. Platform Vision

### Core principles
1. **The North Star governs.** *Every client returns.* A change that does not make this
   more true has no place in the platform. When principles conflict, this wins.
2. **Structure is data, not code.** Departments, permissions, thresholds, event routes,
   and approval chains are rows — extending the business is configuration, not a deploy.
3. **Two enforcement layers, always.** Every data path is gated in the service (RBAC)
   and again in the database (RLS). Defense in depth is not optional.
4. **Nothing external is faked.** Every integration is a provider abstraction with a live
   implementation and a credential-gated slot that fails loud — never a silent stub.
5. **Everything is audited.** Every mutation is attributable, immutable, and replayable.

### Business objectives
The platform runs one operating model across three businesses (EE design-build, EH
retail, NH8 factory; 490 staff, 22 departments). It exists to (a) run the order spine
(WIO → PIO → WO → delivery) without leakage, (b) enforce the non-negotiable gates, and
(c) surface the founders' numbers without anyone being asked for them (Brief §37).

### Platform philosophy
Build the **foundation once**, correctly, then attach business capabilities that inherit
security, audit, events, and workflow **for free**. A module that re-implements any
cross-cutting concern (auth, audit, permissions, notification delivery) is wrong by
construction. The foundation is a set of choke points; modules pass through them.

---

## 2. Layered Architecture

Dependencies point **downward only**. A layer MUST NOT import from a layer above it.

```
UI  ──▶  API  ──▶  Domain Services  ──▶  { Workflow · Event Bus · Scheduler · Notification · AI }  ──▶  Database
```

| Layer | Responsibility | MUST depend on | MUST NOT depend on |
|---|---|---|---|
| **UI** (`app/**`, `components/**`) | Render, capture input, deep-link. No business rules. | API routes (via fetch) | Domain services directly; `pg`; secrets |
| **API** (`app/api/**`, `middleware.ts`) | AuthN gate, request/response shape, error mapping. Thin. | Domain services, `lib/api` | Other routes; raw SQL |
| **Domain Services** (`lib/services/**`) | All business logic and the RBAC gate. The only place rules live. | Workflow, Events, DB accessor, cross-cutting libs | `app/**` (upward); direct channel sends |
| **Workflow Engine** (`lib/services/workflows.ts` + tables) | Approval chains, CAS advance, exact-approver. | DB accessor, audit | Notification channels directly |
| **Event Bus** (`lib/notifications/events/**`) | Immutable event log, routing, dedup. | DB accessor | Domain services (upward) |
| **Scheduler** (auto-pilot — *to be built to §6*) | Time-driven invocation of job routes; locking. | Job routes (HTTP) | Business logic (it triggers, never computes) |
| **Notification Engine** (`lib/notifications/engine/**`, `channels/**`) | Recipients, preferences, delivery state machine, retry/DLQ. | DB accessor, channel providers | Domain services (upward) |
| **AI Layer** (`lib/ai/**`) | Provider abstraction, prompts, guardrails. | External SDK only | DB, services (it is a pure capability) |
| **Database** (`db/**`, accessed via `lib/db.ts`) | Persistence, RLS, generated columns, doc numbers. | — | Application code |

**Hard rules (verified in the baseline):**
- `lib/**` MUST NOT import `app/**` (grep-enforced; zero violations today).
- All DB access MUST go through `lib/db.ts` (`withUserContext` / `withTransaction` /
  `query`). No module opens its own client. RLS GUCs are only set on this path.
- No module calls a notification channel directly. Modules `publishEvent()`; the engine
  decides delivery (§5, §7).
- Route handlers MUST NOT contain business logic — they call one service function and map
  errors via `lib/api/errors.ts`.

---

## 3. Module Contract

Every module is **incomplete** until all ten artifacts exist. This is the definition of
a module — not a wishlist.

| # | Artifact | Requirement |
|---|---|---|
| 1 | **Database migration** | A new numbered migration (forward-only, idempotent, never edits a shipped file). Adds tables/columns in the correct schema with FKs to the golden thread. |
| 2 | **Services** (`lib/services/<module>.ts`) | All business logic. Every mutation guarded: `requirePermission` → `withUserContext` → `writeAudit`. No logic in routes. |
| 3 | **API** (`app/api/<module>/**`) | Thin route handlers behind the middleware gate; validated input (zod); errors via the shared mapper. |
| 4 | **UI** (`app/(portal)/<module>`, `components/<module>`) | Cold-Coffee palette, correct vocabulary (§9), empty/loading/error states. Deep-linkable. |
| 5 | **Tests** | Harness checks for DB invariants/gates; vitest for units; an HTTP E2E for the primary flow. Risk-weighted (gates, money, identity get the deepest coverage). |
| 6 | **Documentation** | `docs/<module>.md` deep-dive + updates to affected architecture docs and the traceability matrix. |
| 7 | **Events** | Domain events published via `publishEvent()` for every state change others care about (§5). Never direct sends. |
| 8 | **Notifications** | `event_routes` rows mapping the module's events to recipients/channels (§7). No bespoke notification code. |
| 9 | **Audit** | Every mutation writes through `writeAudit` (§5 audit rules). No exceptions for "minor" writes. |
| 10 | **Permissions** | `role_permission` rows for the module's resource(s), deny-by-default; RLS policy if it introduces user-scoped tables. |

A module that ships without any one of these is a contract violation and MUST NOT be
merged. The mandatory gate list is §11.

---

## 4. Workflow Standards

Any module needing approvals MUST use the generic workflow engine
(`definitions → steps → instances → actions`). Bespoke approval code is forbidden.

- **States (canonical):** `pending → (advancing) → approved | rejected | cancelled`.
  An instance also carries `current_step`. Terminal states are immutable.
- **Advance concurrency (MUST):** step advance is a **compare-and-swap**
  (`UPDATE … WHERE status='pending' AND current_step=$n`). A racing second decision
  matches zero rows and returns **409**. `FOR UPDATE` locking is NOT used for advance.
- **Exact-approver (MUST):** each step belongs to a named person resolved from Keka
  (`approver_email`). Wrong approver → **403**; unresolved approver → **409** that names
  who is required. Approval authority is identity, never merely access level.
- **SLA handling:** each step MAY declare an SLA duration; the scheduler (§6) evaluates
  breaches and emits `workflow.sla_breached`. SLA timers are data on the step, not code.
- **Escalations:** on SLA breach or explicit trigger, the engine escalates per a defined
  ladder (e.g. AR §36: 45d→TL, 60d→Deepak Ji, 90d→founders) via events, not hardcoded.
- **Delegation:** an approver MAY delegate a step to another identity for a bounded
  window; delegation is recorded as a workflow action and audited; the delegate becomes
  the exact-approver for that step.
- **Parallel approvals:** a step MAY require N-of-M approvers; the step completes when the
  quorum is met. Each vote is a CAS action; no double-count.
- **Sequential approvals:** the default. Step k+1 becomes actionable only after step k
  completes; the event for k+1 fires on advance.
- **Timeouts:** a step MAY auto-reject or auto-escalate on timeout (scheduler-driven);
  the behaviour is declared per definition, never improvised.
- **Retry behaviour:** workflow *decisions* are not retried (they are user actions);
  *side effects* of a decision (events, notifications) inherit the delivery retry (§7).

---

## 5. Event Standards

The event log (`portal.events`) is immutable and the single integration seam between
modules.

- **Naming (MUST):** `domain.action`, lowercase, dot-separated, past-tense action —
  e.g. `wio.created`, `wio.converted`, `pio.approval_requested`, `workflow.step_pending`,
  `ar.overdue`. New domains extend the set; never overload an existing name.
- **Categories:** one of `workflow · approval · user · project · department · system ·
  ai · integration`.
- **Payload rules:** payloads are JSON, **minimal and self-describing** — carry IDs and
  the `entity_ref` (human number, e.g. the PIO number), not whole rows. No secrets, no
  PII beyond what recipients are entitled to. Consumers MUST tolerate unknown fields.
- **Versioning:** payloads are additive-compatible; a breaking change introduces a new
  event name (`domain.action_v2`), never mutates the old shape.
- **Idempotency (MUST):** publishing is idempotent — a duplicate `dedupe_key` returns the
  existing event and performs no side effect. Consumers MUST be safe to process an event
  more than once.
- **Deduplication (MUST):** enforced by the partial unique index on
  `events(dedupe_key) WHERE dedupe_key IS NOT NULL`. Time-bucketed keys (e.g. one clock
  alert per WIO per day) are the standard pattern for periodic events.
- **Audit requirements:** the event log *is* part of the audit story — events are
  insert-only and attributable (`actor_id`, `correlation_id`). Retry/attempt state lives
  on the *delivery*, never on the immutable event.

---

## 6. Scheduler Standards

*(The scheduler/auto-pilot is not yet built. This section is the contract it MUST meet.
No time-driven feature may ship until a scheduler conforming to this exists — see
[INFRA_GAP_ANALYSIS.md](INFRA_GAP_ANALYSIS.md) IG-06.)*

- **Job lifecycle:** `scheduled → running → succeeded | failed`, each transition recorded
  in a run log with start/end, trigger, and outcome. Jobs are **invocations of existing
  HTTP job routes** (`/api/jobs/*`) — the scheduler triggers; it MUST NOT hold business
  logic.
- **Cron:** cadence is declared as data (cron expression / interval per job), not code.
  Changing a schedule is configuration.
- **Locking (MUST):** each tick acquires a lock (advisory lock / leased row) so **exactly
  one** instance fires a given job per scheduled time. No double-firing under horizontal
  scale.
- **Distributed execution:** the scheduler MUST be safe with N app instances — leader
  election or a shared lock store; never "whichever instance woke up."
- **Retry:** a failed job retries with bounded exponential backoff up to a max, then is
  parked as failed and alerted. Idempotency of the underlying job route (jobs re-run
  safely) is a precondition.
- **Failure handling:** a failed job MUST NOT wedge the schedule — subsequent ticks
  proceed; the failure is logged, alerted, and visible.
- **Monitoring:** every job exposes last-run time, duration, and status; a missed tick
  (job overdue) raises an alert. The scheduler itself has a health signal (§10).

Jobs governed by this contract include today's `wio-clock`, `keka-sync`,
`notifications/dispatch`, and future Morning Brief, VRN revocation, Weekly Pulse,
digests, and SLA sweeps.

---

## 7. Notification Standards

- **Channel independence (MUST):** business code publishes events; it never knows or
  names a channel. Adding WhatsApp does not touch a single service.
- **Templates:** every notification type has a template producing per-channel renderings
  (in-app text, Teams Adaptive Card, branded email HTML) from event vars. Templates are
  unit-tested even when the channel is credential-gated.
- **User preferences:** per user — channel opt-ins, category mutes (system category
  always delivers), digest frequency. Honoured by the engine, not by callers.
- **Quiet hours:** interruptive channels are deferred during a user's quiet hours; urgent
  priority bypasses; in-app is always allowed unless the category is muted.
- **Retry:** exponential backoff (`base · 2^attempt`, capped) up to `max_attempts`.
- **Dead-letter (MUST):** exhausted retries transition to `dead` and write a
  `NOTIFICATION_DEAD_LETTER` audit record. Failures are never silently dropped.
- **Delivery guarantees:** **at-least-once** per (event × recipient × channel), enforced
  by `UNIQUE(event_id, recipient_id, channel)` plus idempotent channel sends. In-app is
  the always-available floor; interruptive channels are best-effort with DLQ visibility.

---

## 8. AI Standards

- **Provider abstraction (MUST):** all inference goes through `lib/ai` (one interface).
  The Anthropic provider is live; Azure OpenAI / Copilot are credential-gated slots.
  Model choice is configuration; no module calls a vendor SDK directly.
- **Copilot integration:** Microsoft Copilot / Azure OpenAI plug in as providers behind
  the same interface; enabling them is a config flip, not a code change in any module.
- **Knowledge sources:** retrieval uses the pgvector Knowledge Library; sources MUST be
  attributable (a generated answer cites which documents/records it used).
- **Prompt templates:** prompts live in a versioned, modular library — not inline string
  concatenation. A prompt change is reviewable and diffable.
- **Guardrails (MUST):** AI output is advisory input to a human or a bounded action.
  It MUST NOT trigger irreversible or outward-facing actions autonomously (no auto-sent
  client communications, no auto-approvals, no financial commitments).
- **Explainability:** AI-influenced decisions record the model, prompt version, inputs,
  and output in the audit trail so any suggestion can be reconstructed.
- **Human approval points (MUST):** anything client-facing or money-moving has an
  explicit human gate. Canonical example: the Communication Spine requires the TL to
  scroll to the bottom of a letter before the send control activates (a permanent gate,
  see §12 / ADR-011).

---

## 9. Coding Standards

- **Folder structure:** as in [SYSTEM_OVERVIEW.md §6](../../SYSTEM_OVERVIEW.md). Business
  logic in `lib/services`; cross-cutting in `lib/{auth,notifications,integrations,ai,api,
  security}`; UI in `app`/`components`. New modules mirror this exactly.
- **Naming conventions:** files kebab/lowerCamel per existing neighbours; event types
  `domain.action`; document numbers only via the DB generators (never hand-built);
  resources/actions in the permission engine are stable slugs.
- **Error handling:** throw typed domain errors; map to HTTP in the single choke point
  `lib/api/errors.ts`. Never leak internals or stack traces to clients. 4xx for caller
  fault, 409 for concurrency/gate conflicts, 5xx only for genuine faults.
- **Logging:** no ad-hoc `console.log`. Side-effect failures that must not block the user
  (audit, event publish) log via the sanctioned fail-safe points; structured logging
  (levels + correlation IDs) is the platform standard once IG-09 lands. Zero
  `@ts-ignore` / `eslint-disable` (current state: zero — keep it).
- **Testing:** three tiers — DB harness (invariants/gates, deterministic), vitest
  (units), HTTP E2E (flows on an isolated prod-mode stack). Risk-weighted coverage;
  gates, money, and identity get the most.
- **Migration policy (MUST):** migrations are **forward-only, ordered, idempotent**, and
  **immutable once shipped** — never edit a released migration; add a new one. Numbers
  are never reused (`003` stays a gap). Dev-only data lives in `900_*` and never runs in
  production.
- **Git policy:** branch off the current baseline tag — never build on `main`.
  Conventional-commit messages, logically grouped (no mega-commits), each ending with the
  `Co-Authored-By` trailer. **Secrets never enter git** (enforced by `.gitignore`).
  Commit/push only on explicit instruction.
- **Documentation requirements:** every module ships its deep-dive and updates the
  traceability matrix; every non-obvious decision is recorded (assumption → A-series;
  permanent architectural decision → ADR §12).

---

## 10. Production Standards

Full audit and prioritized plan: [INFRA_GAP_ANALYSIS.md](INFRA_GAP_ANALYSIS.md) and
[PRODUCTION_READINESS.md](PRODUCTION_READINESS.md). Binding minimums for go-live:

| Area | Standard |
|---|---|
| **Monitoring** | Uptime + error-rate/latency alerting on the health endpoints |
| **Health checks** | Liveness (`/api/health`) and readiness (DB reachable, migrations current) |
| **Metrics** | Request metrics + tracing (OpenTelemetry/APM) + error reporting |
| **Logging** | Structured, levelled, correlation-ID'd, aggregated |
| **Backups** | RDS automated backups + PITR; a **tested** restore runbook |
| **Secrets** | Secrets manager (not `.env`); rotation policy; `AUTH_ALLOW_DEV_LOGIN` unset in prod |
| **Scaling** | Stateless app; no in-memory shared state (rate limiter/queue externalized) before multi-instance |
| **Security** | RLS+RBAC enforced under the non-owner role; TLS; strict security headers (CSP/HSTS/X-Frame/nosniff); parameterized SQL; dependency remediation |

The 8 Velocity Gates (Brief §35) are the business go-live checklist and sit on top of
these technical minimums.

---

## 11. Future Module Checklist

**Definition of Done.** A module is complete only when **every** box is checked. Reviewers
MUST refuse a module that cannot check all of them.

**Data & security**
- [ ] New forward-only, idempotent migration; FKs to the golden thread; correct schema
- [ ] `role_permission` rows (deny-by-default) for every new resource/action
- [ ] RLS policy on any user-scoped table; verified under the `essentia_app` role
- [ ] All DB access via `lib/db.ts` (`withUserContext`); no bespoke client

**Logic & API**
- [ ] Business logic only in `lib/services`; routes are thin
- [ ] Every mutation: `requirePermission` → `withUserContext` → `writeAudit`
- [ ] Input validated (zod); errors via `lib/api/errors.ts`; correct status codes
- [ ] Any approval uses the generic workflow engine (CAS + exact-approver)

**Events, notifications, audit**
- [ ] Domain events published via `publishEvent()` (named `domain.action`, deduped)
- [ ] `event_routes` rows map events → recipients/channels; no direct sends
- [ ] Every state change others care about is auditable and attributable

**UI**
- [ ] Cold-Coffee palette; Cormorant/Lato; approved vocabulary (no banned words)
- [ ] Empty / loading / error states; deep-linkable; responsive

**Tests & docs**
- [ ] DB-harness checks for invariants/gates; vitest units; one HTTP E2E for the main flow
- [ ] Green: harness, unit, typecheck, lint, build
- [ ] `docs/<module>.md` + traceability-matrix row + affected diagrams updated
- [ ] Assumptions logged (A-series); any permanent decision proposed as an ADR

**Blocking-rule fidelity**
- [ ] Every permanent constraint touching the module is enforced with the exact required
      behaviour and message (e.g. No PIO → no factory work; Triangle before PIO; 20%
      coordination charge non-deletable; VisionCAM photo before billing)

---

## 12. Architecture Decision Records (ADR)

Permanent decisions. **None may be changed without an architecture review** and a
superseding ADR. Operational assumptions (revisable) live in
[ASSUMPTIONS_DECISIONS.md](../ASSUMPTIONS_DECISIONS.md) (A-01…A-23); these are the load-
bearing invariants.

| ADR | Decision | Rationale / enforcement |
|---|---|---|
| **ADR-001** | **Structure is data.** Departments, permissions, thresholds, routes, and approval chains are table rows. | Business change without deploy; no hardcoded org facts. |
| **ADR-002** | **Two enforcement layers.** RBAC in the service *and* RLS in the DB, always. | Defense in depth; neither layer trusted alone. |
| **ADR-003** | **RLS runs under a non-owner role** (`essentia_app`) via per-transaction GUCs. | Postgres skips RLS for owners/superusers; the app must not be one. |
| **ADR-004** | **Modules publish events; they never send notifications directly.** | One delivery pipeline; channel independence; auditability. |
| **ADR-005** | **Workflow advance is compare-and-swap with exact-approver identity.** | Correct under concurrency; approval is identity, not level. |
| **ADR-006** | **Every external edge is a provider abstraction that fails loud** when uncredentialed. | No silent fakes; live vs. slot is a config flip. |
| **ADR-007** | **The golden thread is `project_code` (`ED/YY-YY/NNN`).** Document numbers are DB-generated in fixed formats. | One join key links every document; numbers never hand-built. |
| **ADR-008** | **Audit is a single choke point, insert-only and immutable.** | Every mutation attributable and replayable. |
| **ADR-009** | **Fail-loud for missing credentials; fail-safe for side effects.** Audit/event failures log, never block the user action. | Deliberate, per-case reliability posture. |
| **ADR-010** | **Migrations are forward-only, idempotent, and immutable once shipped;** numbers are never reused. | Reproducible schema; safe re-apply; `003` stays a gap. |
| **ADR-011** | **Permanent business constraints are inviolable:** No PIO → no factory work; No BOM+PIO → no material released; Triangle of Agreement before every PIO; 20% coordination charge non-deletable by anyone; VisionCAM photo required before any billing milestone; TL must scroll the full letter before send; exit protocol fires all removal actions at 11:59pm. | Brief §26–35; these are the business's spine. |
| **ADR-012** | **Approved vocabulary is enforced:** never "studio", "handover", "complaint", "deliverable" — use essentia/vertical, Day of Recognition, concern/feedback, milestone. Brand: Cold-Coffee palette, Cormorant/Lato, logo-as-image. | Founder voice; consistency in every generated artifact. |
| **ADR-013** | **AI never takes irreversible or outward-facing action autonomously;** human approval gates all client-facing/money-moving output. | Trust, safety, explainability (§8). |
| **ADR-014** | **The layering is one-directional:** `lib/**` never imports `app/**`; all DB access flows through `lib/db.ts`. | Testable, framework-agnostic domain layer. |

---

*This specification is the contract. When in doubt, a module conforms to PAS v1.0 or it
does not merge. Companion references: [SYSTEM_OVERVIEW.md](../../SYSTEM_OVERVIEW.md),
[DIAGRAMS.md](DIAGRAMS.md), [workflows.md](workflows.md),
[events-notifications.md](events-notifications.md), [rbac.md](rbac.md),
[INFRA_GAP_ANALYSIS.md](INFRA_GAP_ANALYSIS.md).*
