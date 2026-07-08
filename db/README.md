# Database

PostgreSQL 15+ with pgvector. Production runs on AWS RDS; the golden thread
is `project_code` (ED/YY-YY/NNN) linking every document.

## Files

Migrations are ordered and idempotent. **There is no `003`** — it is an intentional
numbering gap; the L0–L3 role-permission matrix lives in `004_foundation.sql`.
`001` establishes the 7 schemas and the initial 28 entity tables; `004`–`010` add the
platform tables (RBAC, workflow, auth, Keka, notifications) for **62 tables** total.

| File | Purpose |
|---|---|
| `001_essentia_schema.sql` | Base schema — 7 schemas, 28 entity tables, RLS fencing, doc-number generators. v1.1 (see CHANGELOG.md) |
| `002_seed_departments.sql` | 22 departments (generated from Brief §39 — awaiting Ruby's sign-off) |
| `004_foundation.sql` | RBAC engine + workflow engine + config + audit + factory, incl. the L0–L3 role-permission matrix |
| `005_module_wio_pio.sql` | WIO/PIO module (tables, gates, clocks) |
| `006_s4_hardening.sql` | WIO/PIO hardening — constraints, immutability, RLS |
| `007_app_role.sql` | `essentia_app` non-owner role (so RLS is not skipped for the app connection) |
| `008_auth_identity.sql` | Auth & identity — users, sessions, providers |
| `009_keka_integration.sql` | Keka org sync — `sync_runs`, hierarchy, approver mapping |
| `010_notification_framework.sql` | Event bus + notification framework — events, routes, deliveries, preferences |
| `900_dev_fixtures.sql` | **DEV ONLY.** Deterministic sample rows for local screens. Never production. |
| `validate.mjs` | Proof harness — loads everything into embedded Postgres (PGlite) and runs smoke checks. `npm run validate` |
| `dev-db.mjs` | Local dev database over the real Postgres wire protocol. `npm run dev-db` → `postgres://postgres:postgres@127.0.0.1:55432/postgres` (set `PGPOOL_MAX=1`) |
| `lib.mjs` | Shared PGlite loader used by both scripts |

## Provisioning real PostgreSQL

Apply migrations **in this exact order** (no `003`; never run `900` outside a
developer machine):

```bash
psql -U postgres -c "CREATE DATABASE essentia_portal"
psql -U postgres -d essentia_portal -f 001_essentia_schema.sql
psql -U postgres -d essentia_portal -f 002_seed_departments.sql
psql -U postgres -d essentia_portal -f 004_foundation.sql          # RBAC + workflow + config + audit + factory
psql -U postgres -d essentia_portal -f 005_module_wio_pio.sql
psql -U postgres -d essentia_portal -f 006_s4_hardening.sql
psql -U postgres -d essentia_portal -f 007_app_role.sql            # essentia_app non-owner role (RLS)
psql -U postgres -d essentia_portal -f 008_auth_identity.sql
psql -U postgres -d essentia_portal -f 009_keka_integration.sql
psql -U postgres -d essentia_portal -f 010_notification_framework.sql
# never run 900_dev_fixtures.sql outside a developer machine
```

After provisioning, configure the `essentia_app` role from `007` and connect the
app as that non-owner role — Postgres skips RLS for owners/superusers.

Requires the `vector` extension binary (RDS: enable `pgvector`).
`uuid-ossp` and `pgcrypto` are core contrib. (PGlite lacks pgcrypto; the
harness stubs that one line — the schema never calls pgcrypto functions.)

## The RLS contract (L0-L3 fencing)

Policies read two GUCs set per transaction by the app:

- `app.user_id` — UUID of the acting user
- `app.user_access_level` — `L0` | `L1` | `L2` | `L3`

`frontend/lib/db.ts` → `withUserContext(user, fn)` is the only sanctioned
path: it wraps the work in a transaction and applies both GUCs with
`set_config(..., TRUE)` (transaction-scoped — cannot leak across pooled
connections). Views are `security_invoker`, so fencing holds through them.
A connection that never set the GUCs sees zero rows on fenced tables.
