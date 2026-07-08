# Platform Health Report

Whole-codebase review for RC-1. Every metric below is **measured** from the source at
tag `v0.1-platform-foundation`. Recommendations are given **only where an improvement
is justified** — much of the report is a clean bill.

Scope: `frontend/lib` (54 `.ts`), `frontend/app` (32 routes + 19 pages), `frontend/components`
(18), `db` (10 migrations + harness). ~7,190 lines of TS/TSX.

---

## Summary scoreboard

| Dimension | Finding | Status |
|---|---|---|
| Dead code | none found (slots are wired, fail-loud) | ✅ |
| Duplicate logic | one minor service-preamble repetition | 🟡 minor |
| TODO / FIXME / HACK | **0** | ✅ |
| `any` / `@ts-ignore` / `eslint-disable` | **0 / 0 / 0** | ✅ |
| Files > 500 lines | 2 (`001` schema, `wio.ts`) | 🟡 minor |
| Overly complex functions | concentrated in `wio.ts` gates | 🟡 minor |
| Unused dependencies | **0** (all 6 runtime deps imported) | ✅ |
| Security concerns | app-layer strong; infra/creds pending | 🟡 tracked |
| Performance concerns | correct but unproven at scale | 🟡 tracked |
| **Doc defect** | `db/README.md` provisioning is stale | 🔴 **fix** |

## 1. Dead code

**None found.** A basename-reference scan across `lib/` and `app/` returned no
unreferenced modules. The apparent "unused" files are **intentional provider slots**,
each wired into its registry and failing loud when its credentials are absent:

| File | Wired via | Purpose |
|---|---|---|
| `ai/providers/azure-openai.ts` | ai registry (1 ref) | credential-gated AI slot |
| `ai/providers/copilot.ts` | ai registry (1 ref) | credential-gated AI slot |
| `notifications/channels/stubs.ts` | channel registry (1 ref) | WhatsApp/SMS/Push prepared slots |

These are architecture, not debt — do not delete them.

## 2. Duplicate logic

Low. The one recurring pattern is the **service preamble** in `wio.ts` and `pio.ts`:
`requirePermission(...)` → `withUserContext(...)` → `writeAudit(...)` around each
mutation. It is consistent (a good thing) but repeated.
**Recommendation (optional, S):** extract a small `withGuardedMutation(action, resource, fn)`
helper so new modules inherit the gate+context+audit envelope in one call. Not urgent.

## 3. TODO / FIXME / HACK

**Zero.** No `TODO`, `FIXME`, `HACK`, or `XXX` markers anywhere in the TypeScript.
No suppression directives (`@ts-ignore`, `@ts-nocheck`, `eslint-disable`) either.

## 4. Large files (> 500 lines)

| File | Lines | Verdict |
|---|--:|---|
| `db/001_essentia_schema.sql` | 1015 | Expected — a full DDL schema; not a maintainability issue |
| `frontend/lib/services/wio.ts` | 581 | Slightly large; the only app-code file over 500 |

Next largest are healthy: `004_foundation.sql` (452), `validate.mjs` (379),
`workflows.ts` (328), `sessions.ts` (265), `pio.ts` (248). **Recommendation (optional, S):**
split `wio.ts` read helpers from mutations if it grows.

## 5. Overly complex functions

No pathological complexity observed. The densest logic is in `wio.ts` — the §30
conversion gate (`convertWioToPio`) and the clock/RAG computation — and the workflow
`act`/CAS path in `workflows.ts`. These are **linear guard sequences and a single
compare-and-swap**, not deeply nested branching, so they read clearly. No refactor
required; keep an eye on `convertWioToPio` if more gate conditions are added.
*(Note: no cyclomatic-complexity tool was run; this is a reading-based assessment.)*

## 6. Unused dependencies

**None.** All six runtime dependencies are imported:

| Dependency | Imported in | Use |
|---|--:|---|
| `next` | 37 files | framework |
| `react` / `react-dom` | 5+ | UI |
| `pg` | 1 (`db.ts`) | Postgres driver |
| `zod` | 8 | request validation |
| `@anthropic-ai/sdk` | 1 (`ai/providers/anthropic.ts`) | AI provider |

Dev dependencies (types, eslint, tailwind/postcss/autoprefixer, typescript, vitest) are
all standard build/test tooling and in use. `db/` uses the PGlite packages for the dev
server and harness.

## 7. Security concerns

**Application layer is strong.** Positives: RLS + RBAC dual enforcement under a
non-owner role; scrypt passwords; SHA-256 server-side session tokens; httpOnly/secure
cookies; deny-by-default permissions; parameterized SQL throughout; no secrets in code;
fail-loud provider slots; immutable audit trail.

Open items (all tracked in [TECH_DEBT.md](TECH_DEBT.md)):

| Concern | Severity | Note |
|---|---|---|
| Next.js 14.2.x advisories (TD-03) | High | assess exposure; plan major upgrade |
| Entra JWKS token validation pending (TD-04) | High | prod runs local provider until done |
| MFA architected but not enforced | Medium | design present; enforcement pending |
| In-memory rate limiter (TD-07) | Medium | single-instance; needs Redis at scale |
| `AUTH_ALLOW_DEV_LOGIN` bootstrap | Medium (op) | **must be unset in production** |
| Secrets via `.env`, not a manager | Medium | move to Secrets Manager for prod |

No injectable query paths, no hardcoded credentials, and no permissive CORS were found.

## 8. Performance concerns

Correct and lightweight, but unproven at 490-staff / 58-project scale:

| Concern | Severity | Note |
|---|---|---|
| No load/soak testing (TD-12) | Medium | validate before go-live |
| No caching layer | Medium | hot dashboard reads recompute each call |
| In-process event dispatch (TD-08) | Medium | publish latency couples to fan-out; needs a durable queue |
| Pool sizing untuned; single-connection dev DB | Low | dev masks concurrency; tune for prod |
| Dashboard queries modules directly (TD-11) | Low | event-sourcing would cut duplicate reads |

144 indexes (including partials) and parameterized queries mean the query layer is in
good shape; the gaps are load validation and caching, not query design.

## 9. Documentation defect (fix recommended)

🔴 **`db/README.md` provisioning instructions are stale.** They list
`003_seed_roles.sql` (which does not exist — `003` is a numbering gap; roles/permissions
are in `004_foundation.sql`) and omit migrations `004`–`010`. A new engineer following
it would fail on the missing file and under-provision the database.
**Recommendation:** update `db/README.md` to the correct sequence (see
[RUNBOOK.md §3](../../RUNBOOK.md)). This is the only *incorrect* (as opposed to
incomplete) documentation found. *(Left unedited during RC-1 to keep the baseline
frozen — flagged for a one-line follow-up fix on approval.)*

## Overall

The codebase is **clean, consistently styled, and honestly built**: zero suppression
directives, zero placeholder markers, no dead code, no unused dependencies, healthy
module boundaries. The open items are **operational and integration** work already
captured in the tech-debt register — plus the single stale README to correct. Nothing
here blocks proceeding, and nothing requires a rewrite.
