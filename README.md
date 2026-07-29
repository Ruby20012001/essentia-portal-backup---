# essentia group portal

The internal operating portal for **essentia group** — a design-and-build and
retail business — replacing coordination that lives in WhatsApp, Excel and hallway
conversations with one system of record.

**North Star:** *Every client returns.*

---

## New here?

Read **[`docs/DEVELOPER_HANDOVER.md`](docs/DEVELOPER_HANDOVER.md)** first. It is
written to take you from nothing to a passing test run in about two hours, and it
explains the domain vocabulary (WIO, PIO, GFC, the Triangle of Agreement) that the
rest of the codebase assumes you already know.

## Quick start

Node 20+. No PostgreSQL install needed — local development runs an in-memory database.

```bash
git checkout platform-baseline-v1     # the working branch
cd db && npm install && cd ..          # two workspaces —
cd frontend && npm install && cd ..    # install BOTH
cp frontend/.env.example frontend/.env.local
```

Run two processes, database first:

```bash
node db/dev-db.mjs            # in-memory Postgres on :55432 — start first, leave running
cd frontend && npm run dev    # the app on :3000
```

Verify — all four should pass:

```bash
node db/validate.mjs                    # 105 PASS / 0 FAIL
cd frontend && npx tsc --noEmit         # exit 0
cd frontend && npm run test             # 155 passed
cd frontend && npm run lint             # clean
```

> Never run `npm run build` while `npm run dev` is running.

## Status

**Phase 1 core screens** — the platform foundation, the workflow engine and all its
screens, Project Hub, WIO/PIO Hub, Design Room and VisionCAM are built.
**5 of the 8 Velocity Gates pass.** Open: VisionCAM billing (#1), the EH discount
gate (#5), the Communication Spine welcome letter (#8).

Current detail: [`docs/PROJECT_MEMORY.md`](docs/PROJECT_MEMORY.md).

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind · PostgreSQL 15 + pgvector
(dev: PGlite over the Postgres wire) · vitest. Entra ID SSO and Twilio OTP for auth;
AWS S3, Google Drive, Anthropic Claude (advisory only), Keka, HubSpot and TranZact
as integrations — most specified and gated, not yet wired.

## Layout

```
frontend/       Next.js app — app/ (routes) · components/ · lib/services/ (all business logic)
db/             Numbered, additive SQL migrations + the 105-check validation harness
docs/           Architecture, module docs, project memory, developer handover
```

## Documentation

| File | What it is |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | **The project brain** — brand rules, vocabulary, immovable constraints. Read first. |
| [`docs/DEVELOPER_HANDOVER.md`](docs/DEVELOPER_HANDOVER.md) | Onboarding: vocabulary, setup, the rules, how to make a change |
| [`docs/PROJECT_MEMORY.md`](docs/PROJECT_MEMORY.md) | Permanent memory — status, history, decisions, recovery |
| [`RUNBOOK.md`](RUNBOOK.md) | Setup, running, testing, debugging, deployment, recovery |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | System shape and load-bearing patterns |
| [`DECISIONS.md`](DECISIONS.md) | Why things are the way they are — read before proposing changes |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | Shipped milestones |
| [`TODO.md`](TODO.md) | Backlog |

## A note on language

This project enforces its own vocabulary in every label, document and message:
**production facility** (never "factory"), **Experience Centre** (never "showroom"),
**Client Advisor** (never "salesperson"), **Day of Recognition** (never "delivery").
*luxury*, *bespoke*, *curated*, *seamless* and *holistic* are banned outright.
The full table is in [`CLAUDE.md`](CLAUDE.md) — it is checked in review.
