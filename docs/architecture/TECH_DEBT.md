# Technical Debt Register

Prioritized at the platform freeze (2026-07-07). Effort: S ≤½ session ·
M ≈ 1 session · L ≈ 2–3 sessions · XL = multi-session/external. Most items
are **operational stand-up or credential-gated integration**, not application
rework — a direct consequence of building in a no-cloud environment.

## Critical

| ID | Issue | Impact | Recommendation | Effort | Depends on |
|---|---|---|---|---|---|
| **TD-01** | Entire platform (Phases 1–3, S2, S4, migrations 004–010, all `lib/`, all routes) is **uncommitted** — git holds only the original 13-commit scaffold. | No version history, no collaboration, no rollback, total loss risk if the working tree is lost. | Commit the working tree in coherent units now; add `.gitignore` for `node_modules`/`.next`/`.env.local`; push to remote. | S | — |
| **TD-02** | **No real database** — everything runs on the in-memory PGlite dev server. | No persistence, no backups, no DR; blocks every operational item below. | Provision PostgreSQL 15 + pgvector (RDS); run `001`–`010` (never `900`); wire `DATABASE_URL` via secrets manager. | M | Cloud access |
| **TD-03** | **Next.js 14.2.35 security advisories** (1 high, 1 moderate): DoS/cache-poisoning/XSS/SSRF classes; fix requires the Next 16 major. | Some advisories touch features the portal may not use (image optimizer, i18n, WS upgrades) — real exposure is lower than the raw count but must be assessed. | Assess exposure by feature usage; plan the Next 15→16 migration (App Router + React 19); patch to the latest 14.x meanwhile. | L | — |

## High

| ID | Issue | Impact | Recommendation | Effort | Depends on |
|---|---|---|---|---|---|
| **TD-04** | **Entra token validation not implemented** (A-16) — the OIDC redirect + session minting are complete; JWKS signature verification + claims mapping are not. | Real staff SSO cannot go live; production runs on the local password provider until done. | Implement `completeCallback` against a real tenant; set Entra env; flip `auth.provider` to `entra`. | M | Entra tenant |
| **TD-05** | **No CI/CD** — build/test/lint are run manually. | No automated gate; regressions can reach `main`; no auto-deploy. | GitHub Actions: typecheck + lint + `db` harness + vitest + build on PR; deploy staging on merge, prod on `main` (per stack). | M | TD-01 |
| **TD-06** | **No observability/monitoring** — no metrics, tracing, health pinger, or alerting; app logging is `console.error` only. | Blind in production; incidents undetected. | Structured logger (pino) + correlation IDs; health endpoint + UptimeRobot; metrics/APM; error reporting (Sentry-class). This is Platform Phase 7. | L | — |
| **TD-07** | **In-memory rate limiter** (`lib/security/rate-limit.ts`) is single-instance. | Throttling breaks under horizontal scale (each instance limits independently). | Back with Redis (or a shared store) before multi-instance deploy. | S | Redis |
| **TD-08** | **In-process event dispatch** — `publishEvent` fans out synchronously in the request; the retry job needs an external scheduler. | Publish-time latency couples to delivery; a crash between publish and dispatch relies on the retry job, which has no scheduler yet (A-14). | Keep in-process for in-app; move interruptive-channel delivery to a durable queue/worker; give the job routes a scheduler (auto-pilot module). | L | Queue infra |

## Medium

| ID | Issue | Impact | Recommendation | Effort |
|---|---|---|---|---|
| **TD-09** | Email SMTP transport not wired (A-21) — HTML built + tested, not sent. | Email channel dead-letters. | Add nodemailer reading `SMTP_URL` + `email.from_address`. | S |
| **TD-10** | API is unversioned (`/api/*`). | Breaking changes will hit the future mobile (VisionCAM) / partner clients. | Freeze current surface as implicit `v1`; introduce `/api/v2` only on breaking changes. | S |
| **TD-11** | Dashboard priority signals query modules directly, not the event store. | Duplicated read logic; not event-sourced as the brief envisions. | Migrate widgets to consume the event/notification feed. | M |
| **TD-12** | No load/soak testing. | Performance at 490-staff / 58-project scale unproven. | k6/Artillery against a seeded real DB; tune pool + add caching where hot. | M |
| **TD-13** | Per-delivery audit rows (A-23) are high-volume. | Audit-partition growth at scale. | Gate behind a config flag like `rbac.audit_mode`. | S |
| **TD-14** | L2/L3 permission rows are conservative defaults (A-06). | Not yet the signed-off role matrix (§38). | Ruby's row-by-row review of `db/004` permissions. | S (review) |
| **TD-15** | Audit partitions are manual (through 2027-06). | Inserts fail once an unpartitioned month arrives. | Automate partition creation (pg_partman or a scheduled job). | S |

## Low

| ID | Issue | Impact | Recommendation | Effort |
|---|---|---|---|---|
| **TD-16** | WhatsApp/SMS/Push are prepared slots (A-22). | Those channels unavailable. | Implement per gateway (Twilio, FCM/APNs) when provisioned. | M each |
| **TD-17** | Digest frequency stored but no digest builder. | Daily/weekly roll-ups not produced. | Scheduled consumer under the auto-pilot module. | M |
| **TD-18** | Approval notification title shows the raw `resourceId` UUID (`pio <uuid>`). | Cosmetic — deep link still works. | Carry the PIO number as `entityRef` into the template vars. | S |
| **TD-19** | `wio.ts` is the largest module (581 lines). | Minor readability. | Split read/query helpers from mutations if it grows further. | S |
| **TD-20** | Factory stations 8–9 reserved (A-03), EH targets empty (A-10), Mumbai lead unset (A-11). | Awaiting business confirmation. | Update rows when business confirms — no code change. | S each |

## Not debt (deliberate, documented)

Dev-only fixtures & password seed (A-15/17); single-connection PGlite
fragility (dev only); fail-loud provider slots (Entra/Keka/Teams/Email/etc.);
the scroll-to-send gate kept over the brief (BRIEF_DISCREPANCIES item 8). See
[../ASSUMPTIONS_DECISIONS.md](../ASSUMPTIONS_DECISIONS.md) (A-01…A-23).
