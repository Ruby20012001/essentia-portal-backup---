# WIO/PIO Hub (S4)

For a developer who joins in month 6. The hub is the order spine's first
segment: work initiation (WIO, Brief §30) through production initiation
(PIO, Brief §29) into the §26 approval chain.

## What it does

Every department's work starts as a WIO with a 15-day conversion clock. A
WIO converts to a PIO only when its three-item checklist (Approved BOQ,
Approved 3D, Approved SLD) is complete. A PIO reaches the factory only
after the Triangle of Agreement (final BOQ + final 3D + client-signed GFC +
shared BOM) and the three-signature chain Khushpreet → Deepak Ji → Hardesh.
Every refusal is loud and exact — the blocking reason is shown verbatim.

## Where things live

| Layer | Files |
|---|---|
| Services | [frontend/lib/services/wio.ts](../frontend/lib/services/wio.ts) (lifecycle, history, escalation sweep) · [pio.ts](../frontend/lib/services/pio.ts) (Triangle, approval hand-off) · [projects.ts](../frontend/lib/services/projects.ts) |
| APIs | `GET/POST /api/wio` (`?view=history&q=` for search) · `PATCH /api/wio/{id}` · `POST /api/wio/{id}/convert` · `GET /api/pio` · `PATCH /api/pio/{id}` · `POST /api/pio/{id}/request-approval` · `POST /api/workflows/{id}/act` · `POST /api/jobs/wio-clock` · `GET /api/audit` (L0/L1) |
| UI | [app/(portal)/wio-pio/page.tsx](../frontend/app/(portal)/wio-pio/page.tsx) + [components/wio/](../frontend/components/wio/) (hub client, tables, create panel) |
| Data | Tables from db/001 (`ee.wio`, `ee.pio`, clock views); module config in [db/005](../db/005_module_wio_pio.sql); event templates + audit role in [db/006](../db/006_s4_hardening.sql) |

## Business rules enforced (with brief references)

1. **§30 checklist gate** — convert refuses until all three approvals;
   message names the missing items.
2. **§29 Triangle gate** — approval request refuses until all four items.
3. **§26 chain as data** — `pio_approval` workflow; an approver not yet
   mapped to an account (pre-Keka) blocks the step and names the person.
4. **Department Master routing** — `department_code` is an FK; codes come
   from config `wio.departments`, names from the master. Nothing hardcoded.
5. **Cancellation preserves history** — the row leaves the clock but stays
   in `?view=history` with timestamps, approvals, and audit intact;
   cancelled records are immutable (409 on edit).
6. **Clock escalation (§30)** — day-12 alert and lapse notifications to the
   project TL, deduped per day (`/api/jobs/wio-clock`; cadence moves to the
   auto-pilot scheduler, see A-14).
7. **Everything audited** — create/update/convert/cancel/workflow actions
   write insert-only audit entries with user + role + old/new values.

## How to test

```bash
cd db && npm run validate          # 21 schema/RLS/engine checks
cd frontend && npm run test        # unit tests
cd frontend && npm run typecheck && npm run lint && npm run build
# Full lifecycle E2E (needs a PRISTINE isolated stack; see tests/e2e):
cd db && DEV_DB_PORT=55433 npm run dev-db &
cd frontend && DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55433/postgres \
  PGPOOL_MAX=1 DEV_USER_ID=00000000-0000-4000-8000-000000000001 npx next dev -p 3100 &
E2E_BASE=http://localhost:3100 node frontend/tests/e2e/wio-lifecycle.e2e.mjs
```

## Edge cases handled

Double-convert and parallel converts (row lock → one PIO, one 409);
duplicate approval requests (partial unique index); malformed UUIDs (400
before SQL); RLS-invisible projects read as 404; converted/cancelled WIOs
immutable; sweep dedupes per day; notification failures never fail the
business operation.
