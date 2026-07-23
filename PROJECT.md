# PROJECT — Essentia Group Portal

> One-page orientation. For the founder brief and immovable constraints read
> [`CLAUDE.md`](CLAUDE.md) first — it is the project brain and outranks this file.
> For depth, follow the pointers into [`docs/architecture/`](docs/architecture/).

## What this is
The internal operating portal for **essentia group** — a design-and-build business
(essentia environments, 58+ active projects, 18–24 month lifecycle) and a retail +
in-house manufacturing business (essentia home, Experience Centres in Gurugram, Delhi
and Mumbai, building to 24) served by the **NH8 production facility** (Gurugram,
1,50,000 sqft, 9 production departments). **6 user communities · 46 modules · 850+
internal users.** Authoritative brief: `Portal_Group_Essentia_Complete_Brief.html`.

**North Star (never violate):** *Every client returns.* Every screen and feature
must make that more true.

## Where the build is (2026-07-22)
- **Platform foundation, scheduler, notification framework** — built.
- **Phase 4 Workflow Engine — all 10 steps built** (definition→groups→tasks→actions,
  quorum, conditional routing, SLA timers, delegation, AI advisory). Backend is
  frozen except where explicitly lifted.
- **Now in the FRONTEND-FIRST phase**: building the 10 workflow UI screens, one at
  a time, verifying after each (typecheck · lint · routing · live API).
  - Done: **S1 Dashboard** `/workflows`, **S2 Detail** `/workflows/[id]`,
    **S6 Definitions** `/workflow-definitions`; S3 My Approvals + S4 Delegate dialog pre-existed.
  - **In progress: S7 Active Delegations — PAUSED, awaiting a decision.** See
    [`HANDOFF.md`](HANDOFF.md) and [`TODO.md`](TODO.md).
  - Remaining: S8 SLA Monitor, S9 Notifications Center, **S5 visual Workflow Builder (last)**.

### Velocity Gates (Brief §35) — 8 must all pass before go-live
Done: **#2** Weekly Pulse · **#3** WIO clock · **#4** Exit protocol · **#6** Founder Morning Brief · **#7** Succession pack.
Remaining: **#1** VisionCAM billing · **#5** EH discount gate · **#8** Communication Spine welcome letter.

## Tech stack (summary — full list in CLAUDE.md)
Next.js 14 App Router · TypeScript (strict) · Tailwind (dark theme, tokens in
`frontend/tailwind.config.ts`) · PostgreSQL 15 + pgvector (dev = PGlite over the
wire on `127.0.0.1:55432`) · Entra ID SSO + Twilio OTP · AWS S3 / Google Drive ·
Anthropic Claude (advisory only) · GitHub Actions CI/CD.

## Run it locally
Two processes together (see [`docs/architecture/`](docs/architecture/) and the dev-environment memory):
```
node db/dev-db.mjs      # PGlite wire server on :55432  (start FIRST, keep running)
cd frontend && npm run dev   # Next.js on :3000
```
**Never** `next build` while `next dev` is running — it clobbers `.next`.
Dev accounts (password `essentia-dev-2026`): `dev.founder@essentia.in` (L0),
`dev.coo@essentia.in` (L1), `dev.crmtl@essentia.in` (L2), `dev.site@essentia.in` (L3).

## Verify (green baseline as of this writing)
```
node db/validate.mjs                 # DB harness — 96 checks
cd frontend && npx tsc --noEmit      # types
cd frontend && npm run test          # 9 unit files (143 tests)
cd frontend && npm run lint
```

## People
- **Hardesh Chawla** — CEO (operations, manufacturing).
- **Monica Chawla** — MD, **Integration Commander** for this build (design, family-facing systems).
- **Ruby Nesrwal** — Team Lead & Product Owner; directs the build sessions.
- **Claude** — primary builder.

## The rest of the memory system
[`ARCHITECTURE.md`](ARCHITECTURE.md) · [`DECISIONS.md`](DECISIONS.md) ·
[`TODO.md`](TODO.md) · [`CHANGELOG.md`](CHANGELOG.md) · [`HANDOFF.md`](HANDOFF.md)
