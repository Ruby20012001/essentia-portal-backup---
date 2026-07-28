# PROJECT MEMORY — Essentia Group Portal

> **The permanent memory of this project.** If a Claude session, this machine, or
> the chat history disappears, this file plus `git log` is enough to recover the
> project and continue from the correct next task.
>
> **Read order for a cold start:** [`CLAUDE.md`](../CLAUDE.md) (the brain, outranks
> everything) → this file → [`RUNBOOK.md`](../RUNBOOK.md) (how to operate it).
>
> **Last verified:** 2026-07-28 · **Baseline:** `platform-baseline-v1` @ `1491b83`
> **Green:** DB harness 105/0 · tsc 0 · unit 155/155 · lint clean *(observed, not inherited)*

---

## 0. Repository & persistence topology

**Canonical working copy**

```
C:\Users\Ai-01\Desktop\ruby crm\essentia-portal
```

**GitHub remote (Layer 3 — off-device disaster recovery)**

```
https://github.com/Ruby20012001/essentia-portal-backup---.git
```

> The repo was renamed from `essentia-portal-` to `essentia-portal-backup---`.
> The local remote URL was corrected on 2026-07-28 so Git no longer depends on
> GitHub's rename redirect — redirects break if a new repo later claims the old name.

**Branch model.** `platform-baseline-v1` is the integration branch and the approved
baseline — **not `main`**. Feature work happens on `feat/*`, `fix/*`, `test/*`,
`chore/*` and merges into it with `--no-ff` so each arc stays legible in history.
`main` remains at the original stub commit `afb7bd8` and holds none of the build.

**Known copies on this machine** (do not add more):

| Path | Role |
|---|---|
| `Desktop\ruby crm\essentia-portal` | **Canonical.** `platform-baseline-v1`, full build |
| `Desktop\ruby crm\essentia-portal-` | Stale stub clone, 13 commits. Superseded — safe to delete |
| `OneDrive - ADREM (INDIA) PVT LTD\essentia portal` | **Empty.** Never held the project |

**Canonical-location decision (2026-07-28).** The project stays on Desktop, not in
OneDrive. An actively-used `.git` inside a OneDrive-synced folder risks index and
pack corruption (sync locks during Git operations, cloud-only placeholder files that
Git, Node and build tools cannot read on demand). Off-device durability is provided
by GitHub, which is what Layer 3 exists for. *Reversible — see §9 if this is overruled.*

---

## 1. Project overview

**Purpose.** The internal operating portal for **essentia group**, replacing scattered
WhatsApp/Excel/verbal coordination with one system of record.

**North Star (never violate):** *Every client returns.* Every screen and feature must
make that more true.

**The business.** Two verticals plus manufacturing (figures reconciled 2026-07-22 —
the group brief `Portal_Group_Essentia_Complete_Brief.html` supersedes earlier numbers):
- **essentia environments (EE)** — Adrem India Pvt. Ltd. Design-and-build. 58+ active
  projects · 18–24 month lifecycle · 9 milestone-triggered billing instalments = 100% of fee
- **essentia home (EH)** — Essentia Designs Pvt. Ltd. Retail + staging + in-house
  manufacturing. Experience Centres: Gurugram (15,000 sqft flagship), Delhi, Mumbai;
  building to 24 owned + franchised
- **NH8 production facility** — Gurugram, 1,50,000 sqft, 9 production departments
- **6 user communities · 46 modules · 21 document types · 850+ internal users ·
  600+ advocates/alumni · 105-day deployment**

> **Open brand tension** (not a figure conflict — those are settled). The 39-section
> brief still uses *factory* and *luxury*; the group brief bans both. **Rule adopted:
> the group brief wins on brand and vocabulary; the 39-section brief wins on process
> and §-level detail.** See [`docs/BRIEF_DISCREPANCIES.md`](BRIEF_DISCREPANCIES.md).
> Note the DB schema is still named `factory` — an internal identifier, never shown to a user.

**Major modules.** Workflow engine · WIO/PIO · Project Hub · Design Room ·
VisionCAM · Approvals · Notifications · Scheduler · Founder Brief · Exit Protocol ·
Succession Pack · Communication Spine · Procurement · BD Pipeline · EH retail.

**Technology stack.** Next.js 14 (App Router) · TypeScript strict · Tailwind
(dark theme, tokens only) · PostgreSQL 15 + pgvector (dev: PGlite over the Postgres
wire) · Node 20+ (verified on 24.18.0) · vitest.

**Integrations.** Microsoft Entra ID SSO (staff) · Twilio OTP (external) · AWS S3
(VisionCAM photos) · Google Drive (GFC drawings) · Anthropic Claude (**advisory
only**) · Keka (HR) · HubSpot (BD) · TranZact (procurement). Most are specified and
gated but **not yet wired** — see §7.

---

## 2. Current project status

**Current phase.** Phase-1 Core screens, following the 18-screen build sequence in
[`docs/reference/`](reference/). Phase 4 (workflow engine) is complete and its
backend is **frozen** — extend a read model only if a new screen genuinely needs it;
stop and report before adding write backend.

**Current milestone.** Phase-1 Core screens — 3 of 4 shipped.

**Completed**
- Platform foundation, RBAC, auth, notification framework, scheduler
- **Phase 4 Workflow Engine** — all 10 steps (definitions → groups → tasks → actions,
  quorum, conditional routing, SLA timers, delegation, AI advisory)
- **All 10 workflow UI screens** (S1–S9 + builder)
- **Project Hub**, **WIO/GFC approval on the engine**, brand reconciliation
- **Phase-1 Core:** Design Room (S5), CRM TL greeting (S2), VisionCAM (S3)
- **Velocity Gates passed: #2, #3, #4, #6, #7**

**In progress.** Nothing mid-flight. Paused awaiting screen selection.

**Not started**
- **S6 EH · Experience Centre** — the last Phase-1 Core screen
- Phase 2 integrations: S7 BD/HubSpot, S8 COO, S9 Procurement/TranZact,
  S10 Factory HOD, S11 HR/Keka, S13 API Health, S14 Vendor
- VisionCAM **mobile capture** (React Native, offline-first) — the web log/gate exists
- **Velocity Gates open: #1** VisionCAM billing on every site · **#5** EH discount
  gate across 3 ECs · **#8** Communication Spine welcome letter

**Known issues.** See §7.

---

## 3. Architecture

Full detail lives in [`docs/architecture/`](architecture/) and
[`ARCHITECTURE.md`](../ARCHITECTURE.md) — this is the map, not the territory.

**Layers**

```
app/(portal)/*      Server components + route handlers (App Router)
  page.tsx          Gate with can(user, action, resource) → call a service → render
  api/*/route.ts    Thin: parse → requirePermission → service → JSON
components/*        Presentational; design-system tokens only, no inline hex
lib/services/*      ALL business logic + SQL (the read/write surface)
lib/db              query() / withUserContext() over PGlite (dev) / Postgres (prod)
lib/auth            getCurrentUser, session
db/*.sql            Additive numbered migrations, listed in db/lib.mjs DEFAULT_FILES
db/validate.mjs     In-process PGlite harness (105 checks) — the schema contract
```

**Database.** 7 schemas (`public`, `ee`, `eh`, `factory`, `proc`, `portal`, `audit`),
72 base tables. Migrations are **additive and numbered** (`001`–`028` + `900_dev_fixtures`)
and must be registered in `DEFAULT_FILES` in `db/lib.mjs` **and** given a check in
`db/validate.mjs`. RLS via `withUserContext()`. **The golden thread:** `project_code`
(`ED/YY-YY/NNN`) links every document; all document numbers are sequence-generated
(formats fixed in [`CLAUDE.md`](../CLAUDE.md) — never deviate).

**Authentication.** Entra ID SSO (staff) + Twilio OTP (external). A dev-login stub is
enabled only when `AUTH_ALLOW_DEV_LOGIN=true`; it must be unset in production.

**Authorization.** L0 (founders) → L3 (staff). `requirePermission` / `can(user, action,
resource)` returns a scope: `all` (L0/L1), `own_dept` (L2), `own_records` (L3). Pages
gate **before** rendering. Screens reading `audit.log` are leadership-only. Financial
figures are fenced behind `read:billing`.

**Workflow engine.** `Definition → Groups → Tasks → Actions`.
Effective approver = `COALESCE(delegated_to_user_id, assignee_user_id)`. Concurrency is
compare-and-swap. Quorum is N-of-M per group. Conditional routing uses a small DSL
(`{field, op, value}` + `and/or/not`). SLA warn/breach fire **exactly once**; escalation
**transfers** ownership rather than only notifying.

**Data flows.** Business logic calls `publishEvent(...)`; the notification framework
owns recipients, channels and templates. Never notify directly.

---

## 4. Implementation history

Newest first. Full detail in [`docs/CHANGELOG.md`](CHANGELOG.md); full history in `git log`.

| Date | Milestone | Commits |
|---|---|---|
| 2026-07-28 | Work restored to a clean branch; all 98 commits + 33 branches pushed to GitHub (Layer 3 was empty) | `1491b83` |
| 2026-07-23 | **Phase-1 Core:** VisionCAM S3, CRM TL greeting S2, Design Room S5 | `c573b48` · `9734283` · `2619d7a` |
| 2026-07-22 | WIO/GFC approval on the engine (db/028); Project Hub; brand reconciliation | `fec6f74` · `807b5df` · `c0a9f0e` |
| 2026-07-22 | **Phase 4 frontend complete** — S7, S8, S9, S5 builder | `45b769e` · `e6d6fee` |
| 2026-07-21 | S2 Detail, S6 Definitions, read models, responsive shell, S1 Dashboard | `8e11fc5` · `21c112f` · `cc1b5ab` · `5ce540e` · `e99dd50` |
| 2026-07-20 | Phase 4 engine test coverage + audit fixes (escalation transfer, fire-once SLA) | `fbfcc66` · `1d8715b` |
| 2026-07-19 | Velocity Gates #7 succession, #4 exit protocol, #2 weekly pulse, #6 founder brief | `c3065d0` · `84a3fdd` · `b633839` · `3f93e56` |
| 2026-07-13 | Premium dark theme ratified as default | `0b7bdcc` |
| earlier | Platform foundation, scheduler (db/011–012), notifications (db/010), engine Steps 1–10 (db/013–020) | `05209de` |

---

## 5. Current work

**Current task.** None in flight — paused awaiting a screen decision.

**Completed portion.** Phase 4 complete; 3 of 4 Phase-1 Core screens shipped; work
restored and backed up to GitHub; green baseline verified 2026-07-28.

**Remaining work.** S6 EH · Experience Centre, then Phase 2 integrations.

**Blockers.** None technical. Two decisions are open:
1. Whether `essentia-portal-backup---` is the permanent GitHub home given its name.
2. Whether `main` should be fast-forwarded to `platform-baseline-v1` (§7).

**Next action.** Build **S6 EH · Experience Centre** on a `feat/*` branch, or pick an
open Velocity Gate (#1, #5, #8). See §9.

---

## 6. Decisions

Full log with rationale in [`DECISIONS.md`](../DECISIONS.md). Load-bearing ones:

| ID | Decision |
|---|---|
| **ADR-013** | **AI is strictly advisory** — never approves, rejects, delegates or mutates state; degrades honestly when the API key is absent |
| **ADR-EP-01** | **Configuration-driven, not hard-coded** (Monica's standing direction) — generate from template rows so the business changes contents without code |
| **ADR-EV-01** | **Publish events; never notify directly.** Supply every `{{var}}` the template interpolates — a missing var ships a raw placeholder to a real user |
| **ADR-HS-01** | **Honest state over green dashboards** — an action that cannot run is recorded `not_wired`/`partial`, never reported done |
| **ADR-WF-01** | Escalation **transfers** ownership; it doesn't just notify |
| **ADR-WF-02** | SLA warn/breach fire **exactly once**; timeout failures are counted and audited, never swallowed |
| **ADR-WF-03** | Definitions are **archived, never hard-deleted**. Revise a live chain by duplicate → edit → activate → archive |
| **ADR-WF-04** | Delegated decisions keep the **original approver** on record |
| **ADR-FE-01** | Dark theme is default; **tokens are the only source of colour**, no inline hex; Lato only |
| **ADR-FE-02** | Workflow Detail is read-only; decisions are taken only on My Approvals |
| **ADR-RM-01** | Read models aggregate existing sources; they never copy into new tables |
| **ADR-DB-01** | Additive numbered migrations; PGlite is single-connection in dev |
| **ADR-PROC-01** | **Verify before "building"** — twice a "build Step N" request was really a test-gap + audit task, and both audits found real defects |

**Permanent constraints (from [`CLAUDE.md`](../CLAUDE.md) — do not negotiate):**
No PIO → no factory work. No BOM + PIO → no material released. Triangle of Agreement
(BOQ + 3D + GFC aligned) before every PIO. 20% coordination charge cannot be deleted.
VisionCAM photo required before any billing milestone. TL must scroll to the bottom of
a Communication Spine letter before send activates. Exit protocol fires at exactly 11:59pm.

---

## 7. Known issues

**Technical debt** — register: [`docs/architecture/TECH_DEBT.md`](architecture/TECH_DEBT.md)

- **Dev fixture password is committed in plaintext** in 9 tracked files
  (`PROJECT.md`, `HANDOFF.md`, `RUNBOOK.md`, `db/900_dev_fixtures.sql`,
  `docs/ASSUMPTIONS_DECISIONS.md`, `docs/auth.md`, `LoginForm.tsx`, 2 e2e tests).
  Documented as **A-17**: an in-memory dev seed, deleted with the fixtures once real
  auth lands. Low risk (private repo, no production reach) but it violates the
  "never commit passwords" rule and should move to `.env.example` before any public push.
- **Integrations recorded `not_wired`** by design (ADR-HS-01): Microsoft Graph (Teams
  removal, full SSO revoke, mail auto-responder), WhatsApp Cloud API, telephony
  forwarding. Only 2 of the 6 exit-protocol removals are real today. Wiring them is
  genuine remaining work, **not a bug**.
- **Dev DB fragility (A-15).** PGlite is single-connection. A second raw `pg`
  connection opened while `next dev` runs wedges it (port listens, ECONNRESET).
  Recovery: restart `db/dev-db.mjs`. Read state through the app's HTTP APIs instead.
- **`main` holds none of the build** — it sits at the stub commit `afb7bd8`. Anyone
  cloning and staying on the default branch sees an empty project. Merging
  `platform-baseline-v1` → `main` is an open decision.
- **Brand vocabulary tension** between the two brief documents (§1) — a standing rule
  is adopted, but the 39-section brief text itself still uses the banned words.

**Unresolved questions.** Is `essentia-portal-backup---` the permanent remote? Should
`main` be fast-forwarded to the baseline?

**Risks.** Single-machine development; GitHub is now the only off-device copy.
No CI/CD exists yet (`.github/workflows` is absent) despite `CLAUDE.md` describing it
as planned — so **nothing is automatically tested or deployed on push**.

---

## 8. Recovery information

Operational depth: [`RUNBOOK.md`](../RUNBOOK.md).

**Toolchain.** Node 20+ (verified on **v24.18.0**), npm (verified **11.16.0**), git.
PostgreSQL 15 + pgvector is needed only for production; dev uses in-memory PGlite.

**Clone and install** — note there are **two** npm workspaces, `db/` and `frontend/`:

```bash
git clone https://github.com/Ruby20012001/essentia-portal-backup---.git
cd essentia-portal-backup---
git checkout platform-baseline-v1     # NOT main — main is an empty stub
cd db && npm install && cd ..
cd frontend && npm install && cd ..
cp frontend/.env.example frontend/.env.local   # then fill in
```

**Run** — two processes, dev DB **first**:

```bash
node db/dev-db.mjs            # PGlite on 127.0.0.1:55432 — start FIRST, keep running
cd frontend && npm run dev    # Next.js on :3000
```

**Verify** (the green baseline):

| Command | Expected |
|---|---|
| `node db/validate.mjs` | 105 PASS / 0 FAIL |
| `cd frontend && npx tsc --noEmit` | exit 0 |
| `cd frontend && npm run test` | 155 passed, 10 files |
| `cd frontend && npm run lint` | no warnings or errors |
| `cd frontend && npm run build` | clean — **never run while `next dev` is running** |

**Environment variable NAMES** (values live only in `.env.local`, which is git-ignored
and must never be committed): `DATABASE_URL` · `PGPOOL_MAX` (**set `1`** for the
PGlite dev DB) · `DEV_USER_ID` · `AUTH_ALLOW_DEV_LOGIN` (**must be unset in prod**) ·
`NODE_ENV` · `ANTHROPIC_API_KEY` · `ENTRA_TENANT_ID` · `ENTRA_CLIENT_ID` ·
`ENTRA_CLIENT_SECRET`. Full contract in [`RUNBOOK.md`](../RUNBOOK.md) §2.

**Dev accounts.** Fixture users `dev.founder@` (L0), `dev.coo@` (L1), `dev.crmtl@` (L2),
`dev.site@` (L3), all `@essentia.in`. The shared fixture password is in
`db/900_dev_fixtures.sql`; it is **not recorded here** and must never be treated as a
real credential. Switch the previewed role via `DEV_USER_ID` rather than logging in.

**Gotchas that have cost real time**
- Never `next build` while `next dev` runs — it clobbers `.next`.
- Never global-`sed` over `db/validate.mjs` — short id fragments recur and corrupt
  unrelated checks.
- Tailwind config edits need a preview restart; HMR won't reprocess tokens.
- `audit.log`'s column is **`actor_role`**, not `role`.
- A new migration must be added to `db/lib.mjs` `DEFAULT_FILES` **and** `db/validate.mjs`.

---

## 9. Next steps

Priority order. Backlog: [`TODO.md`](../TODO.md); roadmap:
[`docs/architecture/ROADMAP.md`](architecture/ROADMAP.md).

1. **S6 EH · Experience Centre** — the last Phase-1 Core screen; carries Velocity
   Gate #5 (discount control across all 3 ECs).
2. **Velocity Gate #8 — Communication Spine** welcome letter within 4 hrs of first
   instalment, with the scroll-to-bottom send gate.
3. **Velocity Gate #1 — VisionCAM billing** live on every active site.
4. **Decide `main`** — fast-forward it to `platform-baseline-v1` so a default clone
   isn't an empty stub.
5. **Move the dev fixture password** out of tracked files (§7).
6. **Phase 2 integrations** — HubSpot, TranZact, Keka, Graph, WhatsApp.
7. **VisionCAM mobile capture** (React Native, offline-first).

**Standing hygiene.** Update this file and [`docs/CHANGELOG.md`](CHANGELOG.md) at every
checkpoint. Re-check every new screen at 320 / 768 / 1024 / 1440 for horizontal scroll.
Merge to `platform-baseline-v1` with `--no-ff`. Commit trailer:
`Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

**If the canonical-location decision (§0) is overruled** and the project must live in
OneDrive: push everything to GitHub first, close all editors and dev servers, move the
directory, then re-verify with `git fsck` and the full green baseline before trusting it.
