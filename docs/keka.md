# Keka Integration (Platform Phase 2)

Org sync: after a run, employees, reporting hierarchy, designations, and
active status come from Keka; the **department taxonomy stays the Master's**
(Keka names are mapped onto it, never created outside it — A-13). Live Keka is
a credential-gated provider slot; a fixture provider (the brief's real people)
backs development.

## The model

- **Provider abstraction** ([types.ts](../frontend/lib/integrations/keka/types.ts)) — the sync depends on `KekaProvider`, chosen by config `keka.provider`.
  - `fixture` ([providers/fixture.ts](../frontend/lib/integrations/keka/providers/fixture.ts)) — 20 real people from the brief ([fixture-data.ts](../frontend/lib/integrations/keka/fixture-data.ts)), incl. the PIO approvers, one unmapped department ("Pottery") and one inactive leaver. The working dev source.
  - `http` ([providers/http.ts](../frontend/lib/integrations/keka/providers/http.ts)) — live Keka; **fails loud** without `KEKA_BASE_URL`/`KEKA_API_KEY`. Field mapping (Keka payload → our types) lands with API access + a sample response (A-19).
- **Sync engine** ([sync.ts](../frontend/lib/integrations/keka/sync.ts)) — `runKekaSync(user, trigger)`:
  1. Map each Keka department name → Master code (config `keka.department_mapping`); unmapped names are reported, the person is synced without a department, and **no department is created outside the Master**.
  2. Upsert users by email — `full_name`, `display_name`, `job_title` (designation), `department_id`, `is_active`, `keka_employee_id` always track Keka. `access_level` is set on INSERT only (from the fixture hint; A-18), so in-portal elevation survives a re-sync.
  3. Resolve reporting hierarchy (`managerKekaId` → `reports_to`).
  4. **Arm the PIO approval chain**: link seeded approver emails on `workflow_steps` to the synced accounts (Khushpreet → Deepak Ji → Hardesh) — this unblocks the approvals that were deliberately blocked since S4 (A-04).
  5. Write a `portal.sync_runs` row with stats; per-run audit to `audit.log` (`KEKA_SYNC`).

## API

`POST /api/integrations/keka/sync` (manual) · `GET /api/integrations/keka/status`
(recent runs + stats) · `POST /api/jobs/keka-sync` (scheduled; honors
`keka.sync_enabled`). All gated at `hr_access` on `users` → **L0/L1 only**.

## Config

`keka.provider` (`fixture`|`http`) · `keka.sync_enabled` · `keka.department_mapping`
(Keka name → Master code).

## Verify

```bash
cd db && npm run validate    # sync_runs, approver_email, mapping, resolution, CAS advance
# Full sync + PIO-chain-unblock E2E (dev mode):
cd db && DEV_DB_PORT=55433 npm run dev-db &
cd frontend && DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55433/postgres \
  PGPOOL_MAX=1 AUTH_ALLOW_DEV_LOGIN=true DEV_USER_ID=00000000-0000-4000-8000-000000000001 \
  npx next dev -p 3100 &
E2E_BASE=http://localhost:3100 node frontend/tests/e2e/keka-sync.e2e.mjs
```
The E2E proves the payoff: after a sync, Khushpreet approves PIO step 1 →
advances to Deepak Ji → Hardesh, with step-ownership enforced.

## Known gaps

- **Live Keka field mapping** (A-19) — the HTTP provider is a fail-loud slot;
  needs API access + a sample payload to implement `fetchEmployees/Departments`.
- **Access-level assignment** (A-18) — Keka has no L0-L3 concept. Dev uses the
  fixture's hint; live sync needs a designation→level mapping (or in-portal
  assignment). Sync never downgrades an in-portal-elevated user on re-sync.
- **Scheduling** (A-14) — the scheduled endpoint exists; cadence moves to the
  auto-pilot module.
