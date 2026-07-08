# Engineering Runbook

Operational guide for setting up, running, testing, debugging, deploying, and
recovering the Essentia Portal. Pair with [SYSTEM_OVERVIEW.md](SYSTEM_OVERVIEW.md)
(what the system is) — this is *how to operate it*.

> **Environment note.** Today the platform runs against an in-memory dev database
> (PGlite over the Postgres wire protocol). Steps that need real cloud services
> (RDS, S3, Entra, Keka) are marked **[prod]** and are not yet provisioned.

---

## 1. First-time setup

Prerequisites: **Node 20+**, npm, git. (PostgreSQL 15 + pgvector only for **[prod]**.)

```bash
git clone <repo> && cd essentia-portal
git checkout platform-baseline-v1        # the approved baseline

# install both workspaces
cd db && npm install && cd ..
cd frontend && npm install && cd ..

# create the local env file from the template
cp frontend/.env.example frontend/.env.local   # then edit (see §2)
```

## 2. Environment variables

Copy `frontend/.env.example` → `frontend/.env.local`. **Never commit real values**
(`.env.local` is git-ignored). Contract:

| Variable | Purpose | Needed for |
|---|---|---|
| `DATABASE_URL` | Postgres connection | always |
| `PGPOOL_MAX` | pool size — **set `1` for the PGlite dev DB** (single-connection) | dev |
| `DEV_USER_ID` | dev session stub (only claims a user ID; level/dept come from DB) | dev |
| `AUTH_ALLOW_DEV_LOGIN` | enables `/api/auth/dev-login` + permissive gate — **MUST be unset/false in prod** | dev |
| `NODE_ENV` | `development` / `production` | always |
| `ANTHROPIC_API_KEY` | AI (Communication Spine, Knowledge Library, signals) | AI features |
| `ENTRA_TENANT_ID` / `_CLIENT_ID` / `_CLIENT_SECRET` | staff SSO | **[prod]** auth |
| `TWILIO_ACCOUNT_SID` / `_AUTH_TOKEN` | external-user OTP | **[prod]** |
| `KEKA_BASE_URL` / `KEKA_API_KEY` | live org sync (then set config `keka.provider=http`) | **[prod]** |
| `AWS_REGION` / `S3_BUCKET_VISIONCAM` | VisionCAM photo storage | **[prod]** |

**Secrets never enter the repo.** In production these come from a secrets manager
(AWS Secrets Manager / SSM), not `.env` files.

## 3. Database setup

### Option A — local dev DB (no Postgres install)
```bash
cd db
npm run dev-db      # PGlite over the wire protocol on 127.0.0.1:55432
# DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/postgres
# PGPOOL_MAX=1
```
The dev server loads `001`–`010` and (for local screens) `900_dev_fixtures.sql`.

### Option B — real PostgreSQL **[prod / staging]**
Run migrations **in this exact order** (⚠️ there is **no `003`** — it is a numbering
gap; roles/permissions live in `004`. Never run `900` outside a developer machine):
```bash
psql -d essentia_portal -f db/001_essentia_schema.sql
psql -d essentia_portal -f db/002_seed_departments.sql
psql -d essentia_portal -f db/004_foundation.sql          # RBAC + workflow + config + audit + factory
psql -d essentia_portal -f db/005_module_wio_pio.sql
psql -d essentia_portal -f db/006_s4_hardening.sql
psql -d essentia_portal -f db/007_app_role.sql            # essentia_app non-owner role (RLS)
psql -d essentia_portal -f db/008_auth_identity.sql
psql -d essentia_portal -f db/009_keka_integration.sql
psql -d essentia_portal -f db/010_notification_framework.sql
```
Requires the `vector` extension (RDS: enable `pgvector`); `uuid-ossp`/`pgcrypto` are
core contrib. After provisioning, grant and configure the `essentia_app` role per
`007` so the app connects as a non-owner (RLS is skipped for owners/superusers).

> `db/README.md` mirrors this sequence. There is no `003` — it is a numbering gap;
> roles/permissions are seeded in `004_foundation.sql`.

## 4. Running locally

Two terminals:
```bash
# terminal 1 — database
cd db && npm run dev-db

# terminal 2 — app  (uses .env.local)
cd frontend && npm run dev        # http://localhost:3000
```
Dev login: the fixture CRM TL is `dev.crmtl@essentia.in` / `essentia-dev-2026`
(L2, CRM_EE) — valid only when `AUTH_ALLOW_DEV_LOGIN=true`.

> In this workspace, prefer the preview server (`.claude/launch.json` defines the
> `frontend` config on port 3000) over a raw shell for verification.

## 5. Running tests

```bash
# schema harness — in-process PGlite, 36 checks (no server needed)
cd db && npm run validate           # expect: 36 PASS / 0 FAIL

# unit tests — vitest (error mapping, notification render, UI render)
cd frontend && npm run test         # expect: 19 passed

# typecheck & lint
cd frontend && npm run typecheck && npm run lint

# E2E — HTTP-only against an isolated PRODUCTION-MODE stack
#   1. start a prod build with AUTH_ALLOW_DEV_LOGIN unset on a spare port
#   2. point the script at it and run:
E2E_BASE=http://localhost:3100 node frontend/tests/e2e/auth.e2e.mjs
#   (also: wio-lifecycle, keka-sync, notifications — each on its own fresh stack)
```
E2Es are HTTP-only by design: the PGlite dev DB is single-connection, so tests never
open a second DB client (A-15). Deterministic timeout/clock logic is covered in the
harness instead.

## 6. Debugging

- **App/server logs** — the preview `preview_logs` / `preview_console_logs` tools, or
  the `next dev` terminal. Application logging is intentionally minimal; the two
  `console.error` points (`lib/services/audit.ts`, `lib/notifications/events/bus.ts`)
  are fail-safe side-effect logs.
- **DB state** — connect a `psql` client to the dev DB **only if** `npm run dev-db`
  is not already holding the single connection; otherwise inspect via the app.
- **RLS behaviour** — all data access must go through `withUserContext(user, fn)` in
  `lib/db.ts`; a query that bypasses it will not have `app.user_id` set and rows will
  be fenced out. That is the symptom of "queries return nothing."
- **Auth/session** — cookie is `essentia_session`; middleware gate returns 401 for API
  and 307→`/login` for pages when unauthenticated.

## 7. Common issues

| Symptom | Cause | Fix |
|---|---|---|
| DB calls hang / pool exhausted in dev | PGlite is single-connection | set `PGPOOL_MAX=1`; don't open a second client |
| Queries return no rows unexpectedly | RLS active, no user context | go through `withUserContext`; check `app.user_id` GUC |
| RLS "not enforcing" | app connected as owner/superuser | connect as `essentia_app` (migration `007`) |
| `pgcrypto` error on the dev harness | PGlite lacks pgcrypto | harness stubs that one line; schema never calls it |
| Edge/middleware build error | Node `crypto`/`pg` pulled into Edge | keep Edge imports to `lib/auth/constants.ts` only |
| `dev-login` 404 / gate too strict | `AUTH_ALLOW_DEV_LOGIN` not `true` | set it in `.env.local` (dev only) |
| Provisioning fails on `003` | `003_seed_roles.sql` doesn't exist | use the §3 order (skip `003`) |
| npm audit flags `next` | 14.2.x advisories (TD-03) | assess exposure; plan the major upgrade |

## 8. Deployment checklist **[prod]**

Not yet stood up — this is the gate list, not a runbook of live steps. Full detail
and scores: [PRODUCTION_READINESS.md](docs/architecture/PRODUCTION_READINESS.md).

- [ ] Real PostgreSQL 15 + pgvector (RDS); migrations `001`–`010` applied; `essentia_app` role configured
- [ ] Secrets in a manager (not `.env`); `AUTH_ALLOW_DEV_LOGIN` unset; `NODE_ENV=production`
- [ ] TLS termination; rate limiting backed by Redis (in-memory today, TD-07)
- [ ] CI/CD: typecheck + lint + harness + vitest + build on PR; deploy on merge (TD-05)
- [ ] Automated backups + PITR; **tested** restore runbook
- [ ] Health endpoints + uptime monitoring; structured logging; error reporting (TD-06)
- [ ] Entra token validation implemented; `auth.provider=entra` (TD-04)
- [ ] Next.js advisories remediated (TD-03); dependency + load testing done
- [ ] Scheduler wired for the job routes (wio-clock, keka-sync, notifications dispatch)

## 9. Recovery procedures

**Code / git**
- The baseline is on `platform-baseline-v1`, tagged `v0.1-platform-foundation` (local).
  To restore a clean baseline working tree: `git checkout v0.1-platform-foundation`.
- Roll back an in-progress change: work on a feature branch; `git reset --hard <baseline>`
  discards local commits (they remain reachable from the tag/branch).
- `main` sits at the original scaffold (`afb7bd8` = `origin/main`); the platform lives
  only on the baseline branch until a release is cut.

**Database [prod]**
- Restore from the latest RDS automated snapshot or PITR to a timestamp; re-point
  `DATABASE_URL`; re-run the `essentia_app` grants if restoring to a fresh instance.
- Migrations are idempotent and ordered; re-applying `001`–`010` on a clean database
  reproduces the schema exactly (verified by the harness).
- **Backups/DR are the largest current gap** (TECH_DEBT TD-02) — no real DB is
  provisioned yet, so there is nothing to back up. Provisioning is Stage 0 of the roadmap.

**Integrations**
- Each external edge (Entra, Keka, Teams, email) is a fail-loud provider slot: if
  credentials are missing or wrong, the call fails loudly rather than silently
  degrading. Revert to the fixture/local provider (config flip) to keep dev running.
