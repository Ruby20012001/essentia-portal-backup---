# Essentia Group Portal — System Overview

> **Read this first.** This is the single entry point for any developer, architect,
> AI agent, or project manager joining the platform. It explains what the system is,
> why it exists, how it is built, and where it stands. Deep dives live in
> [`docs/architecture/`](docs/architecture/); this document ties them together.
>
> **Status:** Release Candidate **RC-1** · baseline tag `v0.1-platform-foundation` ·
> branch `platform-baseline-v1`.

---

## 1. Project vision

**Every client returns.** That is the North Star. Every system, screen, and feature
is judged by whether it makes a returning client more likely. The portal exists to
free the founders from operational firefighting and to make excellence repeatable
across 850+ internal users and 58+ concurrent projects.

## 2. Business purpose

essentia group runs three businesses on one operating model:

| Vertical | What it is | Scale |
|---|---|---|
| **essentia environments (EE)** | Full-service design-and-build | 58+ active projects · 18–24 month lifecycle |
| **essentia home (EH)** | Retail + staging + in-house manufacturing | Experience Centres: Gurugram, Delhi, Mumbai (building to 24) |
| **NH8 production facility** | Proprietary manufacturing | 1,50,000 sqft · 9 production departments |

**850+ internal users · 6 user communities · 46 modules.** The portal is the connective tissue: it runs the
order spine (WIO → PIO → Work Orders → delivery), enforces the non-negotiable gates,
and gives founders the numbers without asking for them.

## 3. Platform capabilities (what exists today)

- **Versioned PostgreSQL data layer** — 62 tables across 7 schemas, the golden-thread
  project code linking every document, auto-generated document numbers.
- **Authentication & sessions** — scrypt passwords, SHA-256 session tokens, httpOnly
  cookies, Edge middleware gate; pluggable providers (local dev + Entra ID slot).
- **Configurable RBAC** — deny-by-default permission engine (12 actions × 21 resources
  × access levels L0–L3) plus Row-Level Security as a second enforcement layer.
- **WIO/PIO workflow module** — the §29/§30 order spine with the Triangle-of-Agreement
  and three-item gates that the system refuses to bypass.
- **Generic workflow engine** — data-driven approval chains with compare-and-swap
  concurrency and exact-approver identity (drives the PIO chain today).
- **Event bus + notification framework** — `publishEvent()` → routing → per-recipient,
  per-channel deliveries with retry, back-off, and dead-lettering.
- **Keka HRMS integration** — org/user/hierarchy sync and approver-chain resolution
  (fixture provider live; live-Keka slot credential-gated).
- **CRM TL dashboard** — metric cards, priority-signal band, RAG project-risk table,
  WIO clock — the first operational surface.

## 4. Module status

| Module | Status | Notes |
|---|---|---|
| Database & migrations (001–010) | ✅ Built | Loads clean; 36-check harness green |
| RBAC engine | ✅ Built | L0–L3, configurable, deny-by-default |
| Authentication & sessions | ✅ Built (dev) | Entra provider pending real tenant (A-16) |
| WIO/PIO Hub | ✅ Built | §29/§30 gates enforced |
| Workflow engine | ✅ Built | Generic; PIO chain wired |
| Event bus | ✅ Built | In-process dispatch + retry job |
| Notification framework | ✅ Built | In-app live; Teams/email code-complete, gated |
| Keka integration | ✅ Built (fixture) | Live provider credential-gated (A-19) |
| CRM TL dashboard | ✅ Built | Other role dashboards are scaffolds |
| AI service | 🟡 Partial | Abstraction + Anthropic provider; prompt library pending |
| VisionCAM · BOQ · Procurement · Factory · CRM Intelligence · Exec dashboards | ⬜ Planned | Foundation supports them without rework |

## 5. Current maturity

**RC-1.** The **application layer is production-grade in design and correctness**
(readiness ≈ 78); the **infrastructure layer is not yet stood up** (≈ 30) — by
design, this environment has no cloud services. Overall readiness ≈ 49/100. The
path to production is operational stand-up (real DB, CI/CD, monitoring, backups),
not application rework. See [PRODUCTION_READINESS.md](docs/architecture/PRODUCTION_READINESS.md).

## 6. Folder structure

```
essentia-portal/
├── SYSTEM_OVERVIEW.md        ← you are here
├── RUNBOOK.md                ← setup / operate / recover
├── DEPENDENCY_MAP.md         ← internal module graph
├── CLAUDE.md                 ← project brain (brand, rules, constraints)
├── db/                       ← data layer (source of truth)
│   ├── 001_essentia_schema.sql … 010_notification_framework.sql
│   ├── 900_dev_fixtures.sql   (dev-only — never in prod)
│   ├── lib.mjs · dev-db.mjs   (PGlite dev server over wire protocol)
│   ├── validate.mjs           (36-check schema harness)
│   ├── CHANGELOG.md · README.md
├── frontend/                 ← Next.js 14 app (App Router)
│   ├── app/
│   │   ├── (portal)/          role pages (dashboard, wio-pio, factory, …)
│   │   ├── api/               32 route handlers
│   │   ├── login/  layout.tsx  globals.css
│   ├── lib/                   ← all server logic (54 files)
│   │   ├── services/          domain (wio, pio, workflows, permissions, …)
│   │   ├── auth/              providers, sessions, password, cookie
│   │   ├── notifications/     events/ · engine/ · channels/
│   │   ├── integrations/keka/ providers/ · sync
│   │   ├── ai/                providers/ (anthropic, azure-openai, copilot)
│   │   ├── api/  security/  db.ts  format.ts
│   ├── components/            18 React components (shell, dashboard, wio, …)
│   ├── middleware.ts          Edge session gate
│   ├── tests/                 unit/ (vitest) · e2e/ (HTTP scripts)
└── docs/
    ├── architecture/          system, db, api, rbac, workflows, events,
    │                          readiness, tech-debt, roadmap, diagrams, +RC-1
    ├── foundation · auth · keka · notifications · wio-pio (deep dives)
    ├── ASSUMPTIONS_DECISIONS.md (A-01…A-23) · BRIEF_DISCREPANCIES.md
    └── Portal_Complete_Brief.html (the 39-section source brief)
```

## 7. Technology stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 14 (App Router), React 18, TypeScript (strict), Tailwind |
| Backend | Next.js route handlers + `lib/` service modules |
| Database | PostgreSQL 15 + pgvector (dev: PGlite over the wire protocol) |
| Auth | Microsoft Entra ID SSO (staff) + Twilio OTP (external); scrypt + SHA-256 sessions |
| AI | Anthropic `claude` via SDK (abstraction supports Azure OpenAI / Copilot) |
| Validation | Zod (8 modules) |
| Runtime deps | `next`, `react`, `react-dom`, `pg`, `zod`, `@anthropic-ai/sdk` — **6, all used** |
| Tests | vitest (unit), Node HTTP scripts (E2E), PGlite harness (schema) |

## 8. Development workflow

1. **Read the relevant brief section** (`docs/Portal_Complete_Brief.html`, 39 sections) and the subsystem doc.
2. **Branch off the baseline** — never build on `main` directly.
3. **Build** against the two enforcement layers: RBAC gate in the service + RLS in the DB.
4. **Emit domain events** (`publishEvent`) — never send notifications directly.
5. **Verify** — `db/validate.mjs` harness, vitest unit, and HTTP E2E on an isolated stack.
6. **Document** the assumption/decision if you made one (A-series in `ASSUMPTIONS_DECISIONS.md`).

Full commands in [RUNBOOK.md](RUNBOOK.md).

## 9. Architecture principles

1. **Structure is data, not code.** Departments, permissions, config thresholds, event
   routes, and approval chains live in tables — adding a department or tuning a gate is
   a row, not a deploy.
2. **Provider abstractions at every external edge.** Auth, AI, Keka, and notification
   channels each have an interface with a live dev implementation and a credential-gated
   production slot that fails loud rather than pretending.
3. **Two enforcement layers.** Every data path is gated once in the service (RBAC) and
   again in the database (RLS via a non-owner role) — defense in depth.
4. **Fail-loud vs fail-safe, chosen deliberately.** Missing credentials fail loud;
   audit/event side-effects fail safe (log, never block the user action).
5. **Everything is audited.** Mutations funnel through one `writeAudit` choke point into
   an insert-only, partitioned trail.

## 10. Coding standards

- **Strict TypeScript**, zero `any`, zero `@ts-ignore`, zero `eslint-disable` (verified).
- **Parameterized SQL only** — no string interpolation into queries.
- **One error-mapping choke point** (`lib/api/errors.ts`) → consistent HTTP codes.
- **Permissions checked in the service**, not the route, so every caller is covered.
- **No direct notification sends** — modules publish events; the engine decides delivery.
- **Application logging** is intentionally minimal (2 fail-safe `console.error` points);
  structured logging is a planned platform capability, not ad-hoc `console.log`.

## 11. AI architecture

A provider abstraction (`lib/ai/`) exposes one interface. The **Anthropic** provider is
implemented and live; **Azure OpenAI** and **Copilot** are credential-gated slots. This
keeps model choice a configuration decision and lets the Knowledge Library, Communication
Spine, and Priority Signals share one call path. Streaming and the modular prompt library
are the remaining work (Platform Phase 6).

## 12. Workflow architecture

A generic engine (`definitions → steps → instances → actions`) drives approval chains.
Two properties make it safe under concurrency:
- **Compare-and-swap** advance (`UPDATE … WHERE status='pending' AND current_step=$n`) —
  a racing second decision matches zero rows and is refused (409). No `FOR UPDATE`.
- **Exact-approver identity** — each step belongs to a named person resolved from Keka;
  the wrong approver gets 403, an unresolved approver gets a 409 that names who is needed.

The PIO approval chain (Khushpreet → Deepak Ji → Hardesh) runs on it today; WOs, BOQ,
letters, and CRM will reuse it. See [workflows.md](docs/architecture/workflows.md).

## 13. Event architecture

`Business action → publishEvent() → portal.events (immutable) → event_routes lookup →
recipient strategy → preferences filter → notification_deliveries`. Events are immutable
and de-duplicated (partial unique index on `dedupe_key`); retry state lives on the
delivery, not the event. Publishers today: `wio.ts`, `workflows.ts`. The single
subscriber is the notification engine — a fan-in point every future module reuses.
See [events-notifications.md](docs/architecture/events-notifications.md).

## 14. Notification architecture

The engine resolves recipients, applies per-user preferences (channel opt-ins, category
mutes, quiet hours, digest), and writes one delivery per (event × recipient × channel).
Delivery is a state machine: `pending → sent | failed → (backoff) → pending | dead`.
Channels are pluggable — **in-app is live**; **Teams and email are code-complete and
credential-gated**; WhatsApp/SMS/Push are prepared slots. Every attempt is audited;
exhausted retries dead-letter.

## 15. Database overview

7 schemas (`public, ee, eh, factory, proc, portal, audit`), 62 tables, 144 indexes,
111 foreign keys, 3 views, RLS on 4 tables. The **golden thread** is `project_code`
(`ED/YY-YY/NNN`), which links every document; document numbers (WIO, PIO, WO, VRN, PO,
etc.) are auto-generated by sequence functions in fixed formats. Migrations `001–010`
are ordered and idempotent (`003` is an intentional numbering gap). See
[database.md](docs/architecture/database.md).

## 16. Authentication overview

scrypt-hashed passwords, SHA-256-hashed session tokens stored server-side, httpOnly +
`secure` (in prod) cookies, and an Edge middleware gate that keeps Node crypto/`pg` out
of the Edge bundle (session-cookie constant extracted to `lib/auth/constants.ts`).
Providers are pluggable: **local-password** (dev) is live; **Entra ID** OIDC redirect and
session minting are complete, with JWKS signature validation the remaining piece (A-16).
See [auth.md](docs/architecture/../auth.md).

## 17. RBAC overview

Deny-by-default. A configurable engine evaluates **12 actions × 21 resources × access
levels L0–L3**; permissions are table rows, so the matrix is tuned without a deploy.
This is the *first* enforcement layer; **RLS** is the second, scoping rows by
`app.user_id` / `app.user_access_level` GUCs under a non-owner role (`essentia_app`) so
Postgres cannot skip the policy. Approval authority (who can approve a PIO step) is a
distinct, identity-based check. See [rbac.md](docs/architecture/rbac.md).

## 18. Keka integration

Org sync upserts users, hierarchy, and designations, maps departments onto the
Department Master, and resolves the PIO approver chain from `approver_email`. A **fixture
provider** runs today; the **HTTP provider** is a credential-gated slot (A-19). Sync runs
are recorded (`sync_runs`) with failure handling and are re-runnable. See
[keka.md](docs/architecture/../keka.md).

## 19. Known limitations

- **No real database yet** — dev runs on in-memory PGlite (blocks persistence/backups/DR).
- **Next.js 14.2.x security advisories** — assess exposure; plan the major upgrade.
- **Entra token validation pending** — production runs on the local provider until done.
- **No CI/CD, no monitoring/observability** — build/test are manual; logging is minimal.
- **In-memory rate limiter** and **in-process event dispatch** — need Redis / a durable
  queue before horizontal scale.
- Email SMTP transport, digest builder, WhatsApp/SMS/Push, and non-CRM role dashboards
  are prepared but not wired. Full register: [TECH_DEBT.md](docs/architecture/TECH_DEBT.md).

## 20. Roadmap

**Stage 0 (hygiene):** commit ✅ → provision Postgres → CI/CD → Next.js security.
**Stage 1 (platform):** Phase 4 Workflow generalization → Phase 5 API hardening →
Phase 6 AI completion → Phase 7 observability.
**Stage 2 (integrations):** Entra, live Keka, Teams/SMTP/Twilio, S3 — as credentials arrive.
**Stage 3 (business modules):** VisionCAM → BOQ → Procurement → Factory → CRM Intelligence
→ Exec dashboards.
**Stage 4:** the 8 Velocity Gates (Brief §35) before go-live.
Full sequence and dependency map: [ROADMAP.md](docs/architecture/ROADMAP.md).

---

*Companion documents: [RUNBOOK.md](RUNBOOK.md) · [DEPENDENCY_MAP.md](DEPENDENCY_MAP.md) ·
[architecture diagrams](docs/architecture/DIAGRAMS.md) ·
[platform health](docs/architecture/PLATFORM_HEALTH.md) ·
[traceability matrix](docs/architecture/TRACEABILITY_MATRIX.md) ·
[phase readiness](docs/architecture/PHASE_READINESS.md).*
