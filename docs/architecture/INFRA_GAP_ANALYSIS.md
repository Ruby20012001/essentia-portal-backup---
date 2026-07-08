# Production Infrastructure Gap Analysis

A **deployment-focused** audit (distinct from the architectural review): can this
platform be operated in production, and what must be stood up first? Every item is
assessed against its current, measured state at `v0.1-platform-foundation`. No code was
changed — no production blocker required an immediate fix (the gaps are infrastructure to
provision, not defects to patch).

**Bottom line:** the application is deploy-*ready* in shape (stateless request path,
clean env contract, ordered migrations) but deploy-*blocked* in substance — there is no
database, no secrets store, no backups, and no deployment target yet.

---

## Scoreboard (all 16 areas)

| # | Area | Current state | Severity |
|--|--|--|:--:|
| IG-01 | **PostgreSQL (PGlite → RDS)** | in-memory PGlite dev only | 🔴 Critical |
| IG-02 | **Secrets management** | `.env` files; dev bootstrap flag present | 🔴 Critical |
| IG-03 | **Backup & recovery** | none (no persistent DB) | 🔴 Critical |
| IG-04 | **Deployment strategy** | no Dockerfile / IaC / host / TLS | 🔴 Critical |
| IG-05 | **CI/CD** | manual build/test | 🟠 High |
| IG-06 | **Scheduler / job runner** | 3 job routes, **no cadence owner** | 🟠 High |
| IG-07 | **Security headers** | `next.config.mjs` empty — none set | 🟠 High |
| IG-08 | **Health endpoints** | none (UI page + tables only, no `/api/health`) | 🟠 High |
| IG-09 | **Logging** | 2 `console.error`; no structured/aggregated logs | 🟠 High |
| IG-10 | **Environment configuration** | `.env.example` contract; no per-env / boot validation | 🟡 Medium |
| IG-11 | **Rate limiting** | in-memory, **login-only** | 🟡 Medium |
| IG-12 | **Monitoring** | none | 🟡 Medium |
| IG-13 | **Metrics / APM** | none | 🟡 Medium |
| IG-14 | **Queue infrastructure** | in-process event dispatch | 🟡 Medium |
| IG-16 | **Horizontal scalability** | stateless app; shared-state blockers remain | 🟡 Medium |
| IG-15 | **File / object storage** | S3 placeholders; only VisionCAM needs it | 🟢 Low |

---

## Critical — production is not possible without these

### IG-01 · Production PostgreSQL (RDS + pgvector)
**Now:** everything runs on the in-memory PGlite dev server (single-connection).
**Gap:** no persistence, no concurrency, nothing to back up.
**Do:** provision PostgreSQL 15 + pgvector on RDS; apply migrations `001, 002, 004–010`
(never `900`); configure the `essentia_app` non-owner role (`007`) so RLS is enforced;
wire `DATABASE_URL` + a tuned `PGPOOL_MAX`. **Effort M.** Blocks IG-03, IG-16, and every
dashboard's real numbers.

### IG-02 · Secrets management & prod hardening
**Now:** secrets read from `.env`; `AUTH_ALLOW_DEV_LOGIN` bootstrap exists.
**Gap:** env files are not a production secret store; the dev-login gate must be off.
**Do:** move DB creds, `ANTHROPIC_API_KEY`, Entra/Keka/Twilio secrets, and session/
webhook signing keys into AWS Secrets Manager / SSM with a rotation policy; ensure
`AUTH_ALLOW_DEV_LOGIN` is unset and `NODE_ENV=production`; add boot-time assertion that
prod never starts with the dev flag on. **Effort M.** Security blocker.

### IG-03 · Backup & recovery
**Now:** none.
**Gap:** no snapshots, no PITR, no tested restore — the single largest reliability gap.
**Do:** enable RDS automated backups + PITR; document and **test** a restore runbook
(restore to a scratch instance, re-apply `essentia_app` grants, re-point `DATABASE_URL`).
**Effort S–M** once IG-01 lands. Depends on IG-01.

### IG-04 · Deployment strategy
**Now:** production build passes; no container, IaC, host, or TLS.
**Gap:** nothing to deploy *to*, and no repeatable way to deploy.
**Do:** containerize (Next.js `output: 'standalone'` + Dockerfile) or choose a managed
host; define staging + production environments as IaC; terminate TLS at the edge (cookies
are already `secure` in prod). **Effort M.** Pairs with IG-05.

## High — required for a safe, operable production

### IG-05 · CI/CD pipeline
**Do:** GitHub Actions — `typecheck + lint + db harness + vitest + build` on every PR;
deploy staging on merge, production on `main` (per stack). Add the E2E suite against an
ephemeral prod-mode stack. **Effort M.** Depends on IG-04 for deploy targets.

### IG-06 · Scheduler / background job runner
**Now:** `wio-clock`, `keka-sync`, and `notifications/dispatch` exist as HTTP job routes
with **no scheduler invoking them** (A-14).
**Gap:** every time-driven capability is only half-built — SLA timers, escalations,
reminder emails, daily digest, Founder Morning Brief, VRN revocation, Weekly Pulse,
background sync. This gates **Velocity Gates 2, 4, 6, 7**.
**Do:** build the auto-pilot module — a durable scheduler (cron worker / EventBridge /
a queue-backed runner) that invokes the job routes on cadence, with locking so only one
instance fires each tick, plus a run log. **Effort M–L. Highest-leverage High item** —
recommend before Phase 4 (per the agreed sequence).

### IG-07 · Security headers
**Now:** `next.config.mjs` is empty — no CSP, HSTS, X-Frame-Options, X-Content-Type-
Options, Referrer-Policy, or Permissions-Policy.
**Do:** add a `headers()` block (or middleware) setting a strict CSP, `HSTS`,
`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and a
minimal `Permissions-Policy`. **Effort S.** Pure config; recommend implementing early in
Phase 5 (API hardening).

### IG-08 · Health endpoints
**Now:** an `api-health` **UI page** and `api_health_*` tables exist as substrate, but
there is **no `/api/health` HTTP endpoint**.
**Do:** add liveness (`/api/health` — process up) and readiness (`/api/health/ready` —
DB reachable, migrations current) endpoints for the load balancer and uptime monitor.
**Effort S.**

### IG-09 · Logging
**Now:** two intentional `console.error` fail-safe points; no structured logging.
**Do:** introduce a structured logger (pino-class) with levels and correlation IDs
(thread a request ID from middleware through services); ship to a log aggregator.
**Effort M.** Foundation for IG-12/IG-13.

## Medium — needed at scale / for maturity

| # | Area | Recommendation | Effort |
|--|--|--|--|
| IG-10 | Environment configuration | Per-env config (staging/prod), validate required vars at boot (fail fast), document overrides | S |
| IG-11 | Rate limiting | Back with Redis; extend beyond login to auth-adjacent + job/webhook routes | S–M |
| IG-12 | Monitoring | Uptime pinger (UptimeRobot) on IG-08 endpoints; alerting on error-rate/latency | S |
| IG-13 | Metrics / APM | Request metrics + tracing (OpenTelemetry/APM); error reporting (Sentry-class) | M |
| IG-14 | Queue infrastructure | Move interruptive-channel delivery to a durable queue/worker (keep in-app in-process) | L |
| IG-16 | Horizontal scalability | Once IG-11/IG-14 land (no in-memory shared state), validate multi-instance + load test | M |

## Low

| # | Area | Recommendation | Effort |
|--|--|--|--|
| IG-15 | File / object storage | Provision S3 + credentials when VisionCAM starts; not a general deploy blocker | S |

---

## Prioritized implementation plan

**Wave 1 — make production possible (Critical).** IG-01 Postgres → IG-02 secrets/
hardening → IG-03 backups → IG-04 deploy target + TLS. Do IG-01 first; the rest attach to it.

**Wave 2 — make it safe & operable (High).** IG-05 CI/CD and IG-04 land together; then
**IG-06 scheduler** (highest leverage — unblocks the most features and Velocity Gates),
IG-07 security headers (quick win), IG-08 health endpoints, IG-09 structured logging.

**Wave 3 — make it scale & observable (Medium).** IG-10 env config, IG-11 Redis rate
limiting, IG-12 monitoring, IG-13 metrics/APM, IG-14 durable queue, then IG-16 scale
validation + load test.

**Wave 4 — as features demand (Low).** IG-15 S3 when VisionCAM begins.

### Sequencing note vs. Phase 4
The agreed order puts **the scheduler (IG-06) before Phase 4**. It slots into Wave 2 and
does not require Wave 1 to be fully complete — it can be built against the dev DB and
hardened once IG-01 lands. Waves 1–2 and Phase 4 (pure code) can proceed in parallel
tracks; the only hard prerequisite chain is IG-01 → {IG-03, IG-16}.

*Cross-references: [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) (scores),
[TECH_DEBT.md](TECH_DEBT.md) (TD-02/05/06/07/08), [PHASE_READINESS.md](PHASE_READINESS.md)
(module gating), [ROADMAP.md](ROADMAP.md) (stages).*
