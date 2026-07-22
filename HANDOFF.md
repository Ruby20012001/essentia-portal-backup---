# HANDOFF — resume here

> **Purpose:** let the next session (or the next Claude) pick up cold, with zero
> re-derivation. Regenerate this file whenever state changes materially and
> **always before context runs out.** Read [`CLAUDE.md`](CLAUDE.md) →
> [`PROJECT.md`](PROJECT.md) → this file, in that order.
>
> **Last updated:** 2026-07-22 · **Branch:** `platform-baseline-v1` ·
> **HEAD:** `8e11fc5` (Merge S2 Workflow Detail)

---

## 1. What's happening right now
Frontend-first phase of Phase 4 (workflow UI, 10 screens, one at a time). Done:
S1 Dashboard, S2 Detail, S6 Definitions (S3/S4 pre-existed). **The active task is
S7 Active Delegations, and it is PAUSED awaiting a decision from Monica.** No S7
code has been written yet — the backend was verified and the gaps were reported,
per the standing rule "if an API or field is genuinely missing, stop immediately
and report the exact gap before implementing."

## 2. THE decision that unblocks work (S7)
The S7 spec (admin-only monitoring + revocation: summary cards, 9-col table, status
badges, filters, detail drawer, revoke) is **mostly** supported by existing backend.
Verified present: `listAllDelegations()`, standing + task delegation, revoke API
`POST /api/workflows/delegations/[id]/revoke`, `resolveDelegateChain`,
`WORKFLOW_DELEGATION_*` audit (keyed `resource_id = delegationId`), and
`workflow.delegation_*` notification events (keyed `entity_id = delegationId`).

**Reported gaps (need Monica's call):**
| # | Gap | Data exists? | Proposed exposure |
|---|-----|--------------|-------------------|
| 1 | **Created By** column | yes (`created_by`) | resolve the name in `listAllDelegations()` |
| 2 | **Department** filter | yes (`users.department_id`) | expose dept in `listAllDelegations()` |
| 3 | **Detail drawer** (4 sections) | yes (audit.log by delegationId · tasks by delegate · pending approvals · notifications via events `entity_id`) | add read-only `getDelegationDetail(id)` |
| 4 | **"Last Updated"** column | no `updated_at` column | derive `COALESCE(revoked_at, expired_at, created_at)` — confirm |
| 5 | **"Open workflow"** action | a *standing* delegation has no single instance | agree an interpretation |

**Two paths — Monica picks one:**
- **(A) Full screen** — approve the read-only exposures (1–3), confirm derivation (4)
  and the interpretation (5). Then build the complete S7.
- **(B) Supported core only** — stay strictly "existing services only": ship cards +
  table (minus Created By) + 6 of 7 filters + revoke now; leave out the drawer,
  Created By, Department filter.

➡️ **Next action when the session resumes:** if Monica has answered, build S7 down
that path (feature branch `feat/active-delegations`, verify, merge `--no-ff`). If
not, ask which path and wait. **Do not invent endpoints; do not add migrations,
scheduler jobs, workflow logic, notification logic or new events for S7.**

## 3. After S7 (same order)
S8 SLA Monitor (`workflow-sla-monitor.ts`, already built) → S9 Notifications Center
→ **S5 visual Workflow Builder, last** (`workflow-definitions.ts`, already built).
See [`TODO.md`](TODO.md).

## 4. How to run + verify
```
node db/dev-db.mjs           # PGlite wire :55432 — start FIRST, keep running
cd frontend && npm run dev   # Next.js :3000
```
Green baseline right now: **DB harness 96** (`node db/validate.mjs`), **types clean**
(`npx tsc --noEmit`), **unit 143 / 9 files** (`npm run test`), **lint clean**.
Dev logins (pw `essentia-dev-2026`): `dev.founder@` L0 · `dev.coo@` L1 ·
`dev.crmtl@` L2 · `dev.site@` L3 (all `@essentia.in`).

## 5. Gotchas that have cost real time (don't relearn these)
- **Dev DB is single-connection PGlite ("A-15").** A second raw `pg` connection
  while `next dev` runs wedges it (listens, but ECONNRESET). Read state through the
  app's HTTP APIs (`/api/audit`, `/api/workflows/[id]`); recover by restarting `dev-db.mjs`.
- **Never** `next build` while `next dev` runs (clobbers `.next`). **Never**
  global-`sed` over `db/validate.mjs` (short id fragments recur → corrupts unrelated checks).
- **Tailwind config edits need a preview restart** to reprocess tokens (HMR won't).
- **Notification `{{vars}}`:** a new `publishEvent` must supply every var its db/010
  template uses, or a raw placeholder ships to a user. Verify in a **live drive**, not
  just code review — the two placeholder bugs were invisible to code-only audits.
- **Verify before "building" a Phase-4 step** — they're all already implemented; the
  real work is usually a test gap + audit (which keep finding real defects).
- audit.log's column is **`actor_role`**, not `role`.

## 6. Working agreement (how Monica/Ruby want this built)
One disciplined step at a time, hard stops, live verification over assertions.
Config-driven over hard-coded (ADR-EP-01). Honest state over green dashboards
(ADR-HS-01). AI strictly advisory (ADR-013). Let the brief drive; don't over-ask —
when the brief already answers a choice, proceed. Merge `--no-ff` into
`platform-baseline-v1`. Commit trailer:
`Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## 7. Resume prompt (paste to a fresh session)
> Read CLAUDE.md, PROJECT.md and HANDOFF.md. We're in the Phase-4 frontend phase.
> S1/S2/S6 are done. S7 Active Delegations is paused on my decision between path A
> (approve read-only exposures — created_by name, department, `getDelegationDetail`,
> the "Last Updated" derivation, the "Open workflow" interpretation — and build the
> full screen) and path B (ship the supported core only). I choose ____. Proceed on
> a `feat/active-delegations` branch, verify (harness/tsc/test/lint + a live drive),
> then merge `--no-ff`. Don't invent endpoints or add migrations/events for S7.
