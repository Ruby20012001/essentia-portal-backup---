# Database

PostgreSQL 15+ with pgvector. Production runs on AWS RDS; the golden thread
is `project_code` (ED/YY-YY/NNN) linking every document.

## Files

| File | Purpose |
|---|---|
| `001_essentia_schema.sql` | Full schema — 7 schemas, 28 entity tables, RLS fencing, doc-number generators. v1.1 (see CHANGELOG.md) |
| `002_seed_departments.sql` | 22 departments (generated from Brief §39 — awaiting Ruby's sign-off) |
| `003_seed_roles.sql` | L0-L3 role-permission matrix (same provenance) |
| `900_dev_fixtures.sql` | **DEV ONLY.** Deterministic sample rows for local screens. Never production. |
| `validate.mjs` | Proof harness — loads everything into embedded Postgres (PGlite) and runs smoke checks. `npm run validate` |
| `dev-db.mjs` | Local dev database over the real Postgres wire protocol. `npm run dev-db` → `postgres://postgres:postgres@127.0.0.1:55432/postgres` (set `PGPOOL_MAX=1`) |
| `lib.mjs` | Shared PGlite loader used by both scripts |

## Provisioning real PostgreSQL

```bash
psql -U postgres -c "CREATE DATABASE essentia_portal"
psql -U postgres -d essentia_portal -f 001_essentia_schema.sql
psql -U postgres -d essentia_portal -f 002_seed_departments.sql
psql -U postgres -d essentia_portal -f 003_seed_roles.sql
# never run 900_dev_fixtures.sql outside a developer machine
```

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
