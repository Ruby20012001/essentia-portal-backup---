# Production Readiness Report

**Assessed at the platform freeze (2026-07-07).** Scores are 0–100 against
enterprise production standards, with honest rationale. The headline: the
**application layer is production-grade in design and correctness; the
operational/infrastructure layer is not yet stood up** — by design, this
environment has no cloud services. Readiness is therefore bimodal.

## Scorecard

| Category | Score | Rationale |
|---|---:|---|
| **Maintainability** | **90** | 0 TODO/`any`/`console.log`/`@ts-ignore`/`eslint-disable`; strict TS; provider abstractions; data-driven config; 8 subsystem docs; single error-mapping + audit choke points. Largest file 581 lines. |
| **Security (design)** | **68** | RLS + RBAC dual-layer, `SET LOCAL ROLE` non-owner enforcement, SHA-256 session tokens, scrypt passwords + lockout, login throttling, deny-by-default, fail-loud provider slots, immutable audit, no secrets in code. **Deductions**: Next.js 14.2.35 advisories (high, TD-03); MFA architected but not enforced; Entra token validation pending; SSL/secrets-manager not wired. |
| **Scalability** | **66** | Stateless request path, event-driven decoupling, config-driven, RLS multi-level. **Deductions**: in-memory rate limiter (single-instance, TD-07); in-process event dispatch (no durable queue, TD-08); horizontal scale unvalidated. |
| **Performance** | **62** | Clean, parameterized queries; 144 indexes incl. partials; light payloads; dev p95 ~35ms. **Deductions**: no load testing (TD-12); no caching layer; connection-pool sizing untuned for prod; single-connection dev DB masks concurrency. |
| **Logging** | **55** | Audit trail is excellent (insert-only, partitioned, role-stamped, per-action). **Deductions**: application logging is `console.error` only — no structured/leveled logger, no correlation IDs in logs. |
| **Observability** | **40** | Rich audit + `api_health_*`/`sync_runs`/`autopilot_log` tables exist as substrate. **Deductions**: no metrics, no tracing, no dashboards, no APM; the health tables have no pinger. |
| **Deployment readiness** | **35** | Production build passes; clean env-var contract (`.env.example`); launch config present. **Deductions**: **all platform code uncommitted** (TD-01); no CI/CD (TD-05); no Dockerfile/IaC; no staging/prod environments. |
| **Monitoring** | **30** | No uptime/alerting wired (stack names CloudWatch + UptimeRobot; not implemented). |
| **Backup strategy** | **20** | None — dev DB is in-memory. Needs RDS automated snapshots + PITR once provisioned. |
| **Disaster recovery** | **20** | No real database, no backups, no restore runbook. The single largest gap. |

**Overall (unweighted mean): ~49/100** — but this conflates two very
different layers. **Application readiness ≈ 78**; **infrastructure/operations
readiness ≈ 30**. The path to production is almost entirely *operational
stand-up* (provision, commit, CI/CD, monitoring, backups), not application
rework.

## Production checklist

Legend: ✅ done · 🟡 partial/dev-only · ⬜ not started.

**Environment & secrets**
- ✅ Documented env-var contract (`.env.example`) with per-integration keys
- 🟡 Dev bootstrap flags gated off in production (`AUTH_ALLOW_DEV_LOGIN`)
- ⬜ Secrets manager (AWS Secrets Manager / SSM) — currently env files
- ⬜ Rotation policy for DB creds, API keys, session/webhook signing keys

**Network & transport**
- ⬜ TLS/SSL termination (cookies already `secure` in production)
- 🟡 Rate limiting (login live; **in-memory, single-instance** — needs Redis)
- ⬜ WAF / DDoS posture (note Next.js DoS advisories, TD-03)

**Data**
- ⬜ Real PostgreSQL 15 + pgvector (RDS) — **blocks everything below**
- ⬜ Automated backups + PITR; tested restore runbook
- ✅ Schema migrations ordered & idempotent; proven to load (36 harness checks)
- ✅ RLS fencing enforced via non-owner role
- ⬜ Audit-partition automation (partitions manual through 2027-06)

**Delivery**
- ✅ Production build green; typecheck + lint clean
- ⬜ Version control of the platform code (**uncommitted**, TD-01)
- ⬜ CI/CD (GitHub Actions per stack); staging + production environments
- ⬜ Containerization / IaC

**Reliability & ops**
- ⬜ Health-check endpoints + uptime monitoring
- ⬜ Structured logging + log aggregation
- ⬜ Metrics + tracing (APM) + alerting
- ⬜ Error reporting (Sentry-class)
- 🟡 Scheduler for job routes (clock sweep, keka-sync, dispatch) — endpoints exist; **cadence owner (auto-pilot) not built**, A-14
- ⬜ Load & soak testing (TD-12)

**Security testing**
- ✅ AuthZ verified across L0–L3 (live, per level)
- ✅ Blocking-rule + injection-safe (parameterized) + UUID validation
- ⬜ Dependency remediation (Next.js advisories, TD-03)
- ⬜ Pen test / SAST-DAST in CI

## What is genuinely production-grade today

Correctness and architecture: the golden-thread data model, the L0–L3 dual
enforcement, the auth/session lifecycle, the workflow CAS + exact-approver
chain, the event-driven notification framework with retry/DLQ, and the
provider abstractions for every external system — all verified by 36 harness
checks, 19 unit tests, and 72 E2E assertions, green at the freeze.
