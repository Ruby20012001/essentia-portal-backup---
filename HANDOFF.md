# HANDOFF — resume here

> **Purpose:** let the next session (or the next Claude) pick up cold, with zero
> re-derivation. Regenerate this file whenever state changes materially and
> **always before context runs out.** Read [`CLAUDE.md`](CLAUDE.md) →
> [`PROJECT.md`](PROJECT.md) → this file, in that order.
>
> **Last updated:** 2026-07-22 · **Branch:** `platform-baseline-v1` ·
> **HEAD:** tip of `platform-baseline-v1` (Phase 4 frontend complete — S7/S8/S9/S5)

---

## 1. What's happening right now
**PAUSED, awaiting Monica's pick of the next screen.** Nothing is mid-flight.
Phase 4 is COMPLETE (engine Steps 1–10 + all 10 workflow UI screens). Since then,
also shipped: **Project Hub** (`807b5df`), **WIO/GFC approval on the engine**
(`fec6f74`), **brand reconciliation** (`c0a9f0e`), **`docs/reference/`** (RUBY
package), and — 2026-07-23 — the **Phase-1 Core screens Design Room (S5, `2619d7a`),
CRM TL Dashboard greeting (S2, `9734283`), VisionCAM (S3, `c573b48`)**. Green
baseline: **harness 105/0, unit 155/155, tsc/lint/build clean.**

**Next candidates** (18-screen sequence, in [`docs/reference/`](docs/reference/)):
**S6 EH · Experience Centre** (last Phase-1 Core), then Phase-2 integrations
(S7 BD/HubSpot, S9 Procurement/TranZact, …), and the VisionCAM mobile capture app.
See [`TODO.md`](TODO.md).

## 2. The workflow screens (where each lives)
| Screen | Route | Backend it uses |
|--------|-------|-----------------|
| S1 Dashboard | `/workflows` | `listApprovalsOverview` |
| S2 Detail | `/workflows/[id]` | `getWorkflowDetail` + `getWorkflowAudit` |
| S3 My Approvals · S4 Delegate dialog | `/approvals` | `listMyApprovals`, `delegateTask` |
| S5 Workflow Builder | `/workflow-builder/[code]` · `/new` | `workflow-builder.ts` (detail/create/meta/structure/activate) |
| S6 Definitions | `/workflow-definitions` | `workflow-definitions.ts` (list/archive/restore/duplicate) |
| S7 Active Delegations | `/workflow-delegations` | `listAllDelegations` + `getDelegationDetail` |
| S8 SLA Monitor | `/sla-monitor` | `workflow-sla-monitor.ts` + oversight |
| S9 Notifications Center | `/notifications` | `notifications.ts` + `/api/notifications/*` |

## 3. Builder safety model (the one to hold in your head)
Definitions are edited only when **inactive AND with no running instances**
(`getWorkflowDefinitionDetail.editable`). Active or archived-but-running →
read-only; the way to change a live chain is **Duplicate → edit the copy →
Activate → Archive the old** (running instances re-read groups by
`(definition_code, group_no)`, so editing a live chain would rewrite work
mid-flight — the gate forbids exactly that). `saveDefinitionStructure` replaces
the whole group/approver set in one transaction; `activateDefinition` flips
`is_active` only after `validateDefinitionStructure` passes. **No schema change
was needed** — the builder writes only to existing `workflow_groups` /
`workflow_group_approvers` columns. Note: the sticky action bar's Save/Activate
buttons are genuinely clickable (verified `elementFromPoint`); headless synthetic
clicks on the `backdrop-blur` bar are flaky, so drive them with a real DOM click
if automating.

## 4. How to run + verify
```
node db/dev-db.mjs           # PGlite wire :55432 — start FIRST, keep running
cd frontend && npm run dev   # Next.js :3000
```
Green baseline right now: **DB harness 105/0** (`node db/validate.mjs`), **types clean**
(`npx tsc --noEmit`), **unit 155 / 10 files** (`npm run test`), **lint + `next build` clean**.
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
> Read CLAUDE.md, PROJECT.md and HANDOFF.md. Phase 4 (workflow engine + all 10 UI
> screens) is complete and green (harness 101, unit 155, build clean). The workflow
> backend is frozen again — extend a read model only if a new screen genuinely needs
> it, and stop-and-report before adding write backend. Likely next work: the open
> Velocity Gates (#1 VisionCAM billing, #5 EH discount gate, #8 Communication Spine
> welcome letter) — pick one, map UI→data, build on a `feat/*` branch, verify
> (harness/tsc/test/lint + a live drive at 320/768/1024/1440), merge `--no-ff`.
