# DEVELOPER HANDOVER — Essentia Group Portal

> **This is the one file you hand to a new developer.** Read it top to bottom
> before opening the code. It is sequenced deliberately: orientation, then the
> vocabulary, then the machine, then the rules, then the work.
>
> Budget about **two hours** to the first passing test run.
>
> Companion files: [`PROJECT_MEMORY.md`](PROJECT_MEMORY.md) (what state the project
> is in) · [`../RUNBOOK.md`](../RUNBOOK.md) (how to operate it) ·
> [`../CLAUDE.md`](../CLAUDE.md) (the immovable rules).

---

## 1. What you are joining

The internal operating portal for **essentia group** — an Indian design-and-build
and retail business. It replaces coordination that currently happens in WhatsApp,
Excel and hallway conversations with one system of record.

**Two businesses, one group:**
- **essentia environments (EE)** — design-and-build. 58+ active projects, each
  running 18–24 months, billed across 9 milestone-triggered instalments.
- **essentia home (EH)** — retail. Experience Centres in Gurugram, Delhi, Mumbai.
- **NH8 production facility** — Gurugram, 1,50,000 sqft, 9 production departments.
  Everything EE designs is made in-house here.

**The North Star, quoted on purpose:** *Every client returns.* You will see this
invoked in code review. It is the tie-breaker when two designs are otherwise equal.

**Scale you are building for:** 850+ internal users, 6 user communities, 46 modules.

### The one thing to understand before anything else

This portal's job is **to refuse things**. Most of its value is in blocking work
that should not proceed: a production order without approved drawings, a billing
milestone without a site photo, a design stage marked complete without evidence.

If you find yourself making a check optional to get a screen working, stop. That
check is probably the feature. See §5.

---

## 2. The vocabulary — read this twice

The domain language is not guessable, and it is used unexplained everywhere in the
codebase, the database and the brief. This table is the single biggest time-saver
in this document.

### Documents and orders

| Term | Means | Notes |
|---|---|---|
| **WIO** | **Work Initiation Order** | How *any* department's work starts. Has a **15-day clock** to convert to a PIO. Universal — not just production. |
| **PIO** | **Production Initiation Order** | Authorises the production facility to build. Nothing is made without one. |
| **BOQ** | Bill of Quantities | The priced scope. |
| **BOM** | Bill of Materials | What must be issued from Store. |
| **GFC** | **Good For Construction** | The drawing level that is safe to build from. Client-signed. |
| **SLD** | A drawing level on the ladder (structure / MEP first cut) | Ladder stage, see below. |
| **WO** | Work Order | Issued to third parties. Two number series: AIPL and Adrem. |
| **PO** | Purchase Order | |
| **VRN** | Vendor Registration Number | Auto-revoked at 11:59pm on `exit_date`. |
| **GRN** | Goods Receipt Note | |
| **OC**, **RIO** | Further numbered document types | Formats fixed in [`../CLAUDE.md`](../CLAUDE.md). |

**Document numbers are never free text.** Every format is fixed and
sequence-generated — e.g. project code `ED/26-27/058`, `WIO/26-27/018/ARCH`,
`AIPL/25-26/159`. The table in [`../CLAUDE.md`](../CLAUDE.md) is authoritative;
never invent or reformat one.

**The golden thread:** `project_code` (`ED/YY-YY/NNN`) links every document in the
system. When in doubt about how two records relate, they relate through this.

### Processes

| Term | Means |
|---|---|
| **Drawing Ladder** | The 14-stage design sequence: **CP → SLD → FI → TP → GFC → AB**. Implemented as the Design Room screen. |
| **Triangle of Agreement** | Final BOQ **+** final 3D **+** client-signed GFC **+** shared BOM, all aligned. Required before *every* PIO. Non-negotiable. |
| **WIO → PIO checklist** | Approved BOQ, Approved 3D, Approved SLD — all three before conversion. |
| **Velocity Gates** | 8 conditions that must all pass before go-live (Brief §35). 5 pass today. |
| **Communication Spine** | The client-communication system. Letters are generated, reviewed and sent from here. |
| **VisionCAM** | Site-photo capture. A photo is required before a billing milestone can fire. |
| **Weekly Pulse** | The Friday client update, auto-drafted per active project. |
| **Founder Morning Brief** | "The 7 numbers", generated 06:30 daily. L0–L1 only. |

### House vocabulary — enforced in every label, letter and message

These are not style preferences. They are checked in review.

| Always say | Never say |
|---|---|
| **essentia** (always lowercase) | Essentia, ESSENTIA |
| **production facility** | factory *(the `factory` DB schema is an internal identifier only — never surface it)* |
| **Experience Centre** | showroom |
| **Day of Recognition** | delivery, handover |
| **Client Advisor** | salesperson |
| **custom / made-to-order** | bespoke |
| **Completion Certificate** | handover certificate |
| **concern / feedback** | complaint |
| **milestone** / the item name | deliverable |
| **The Brigade** | *(the Staging & Styling team)* |

**Banned outright, no exceptions:** *luxury · bespoke · curated · seamless ·
holistic · world-class · best-in-class · studio* (use "firm" or the vertical name).

### People and access levels

**L0** founders · **L1** leadership/COO · **L2** team leads · **L3** staff.
Permission scope follows: `all` (L0/L1) → `own_dept` (L2) → `own_records` (L3).

- **Hardesh Chawla** — CEO. Operations, manufacturing.
- **Monica Chawla** — MD, and **Integration Commander** for this build. Design and
  family-facing systems. She rules on brand and vocabulary questions.
- **Ruby Nesrwal** — Team Lead & Product Owner. Directs build sessions; translates
  the brief into tasks. **Your day-to-day contact.**

---

## 3. Get it running

Full detail in [`../RUNBOOK.md`](../RUNBOOK.md). The short path:

**You need:** Node 20+ (verified on 24.18.0), npm, git. No Postgres install —
local dev runs an in-memory database.

```bash
git clone https://github.com/Ruby20012001/essentia-portal-backup---.git
cd essentia-portal-backup---
git checkout platform-baseline-v1
```

> ⚠️ **`platform-baseline-v1` is the real branch.** Historically `main` was an
> empty stub; it now tracks the baseline, but always confirm you are on
> `platform-baseline-v1` before starting work.

**There are two npm workspaces. Install both** — this trips up almost everyone:

```bash
cd db && npm install && cd ..
cd frontend && npm install && cd ..
cp frontend/.env.example frontend/.env.local
```

Then edit `frontend/.env.local` — set `DATABASE_URL` to the dev database,
`PGPOOL_MAX=1`, and `AUTH_ALLOW_DEV_LOGIN=true`. Variable meanings are in
[`../RUNBOOK.md`](../RUNBOOK.md) §2.

**Run it — two processes, database first:**

```bash
node db/dev-db.mjs            # in-memory Postgres on :55432 — START FIRST, leave running
cd frontend && npm run dev    # the app on :3000
```

Dev fixture logins exist at four access levels (`dev.founder@`, `dev.coo@`,
`dev.crmtl@`, `dev.site@`, all `@essentia.in`). The shared fixture password is in
`db/900_dev_fixtures.sql` — it is a throwaway seed, never a real credential, and
must never be copied into documentation. To preview a different role, change
`DEV_USER_ID` rather than logging in and out.

---

## 4. What "green" means

Run all four before you ask anyone to look at your work. These numbers are the
current baseline — if one drops, you changed something you did not mean to.

| Command | Expected |
|---|---|
| `node db/validate.mjs` | **105 PASS / 0 FAIL** |
| `cd frontend && npx tsc --noEmit` | exit 0 |
| `cd frontend && npm run test` | **155 passed**, 10 files |
| `cd frontend && npm run lint` | no warnings or errors |

**Never run `npm run build` while `npm run dev` is running** — it clobbers `.next`
and produces confusing failures. Stop the dev server first.

---

## 5. Rules that must never be broken

These come from the business, not from engineering preference. Breaking one is a
production incident, not a bug. Full list in [`../CLAUDE.md`](../CLAUDE.md).

1. **No PIO → no production work begins.**
2. **No BOM + PIO → no material released from Store.**
3. **Triangle of Agreement before every PIO** — no exceptions, no override flag.
4. **20% coordination charge on all third-party WO scopes** — cannot be deleted by
   anyone, at any access level.
5. **VisionCAM photo required before any billing milestone fires.**
6. **The TL must scroll to the bottom of a Communication Spine letter** before the
   send button activates.
7. **Exit protocol fires at exactly 11:59pm** — all six removal actions together.

### Two engineering doctrines you will be held to

**Honest state over green dashboards.** If an action cannot actually run — because
an integration is not wired — record it as `not_wired` or `partial` and show that.
Never report it as done. The Exit Protocol board deliberately says only 2 of its 6
removals are real. That is correct behaviour, not a bug to tidy away.

**AI is strictly advisory.** The AI layer computes advice only. It must never
approve, reject, delegate, or write to the database. When the API key is absent it
says so plainly rather than pretending. This is enforced by a test.

---

## 6. How the code is laid out

```
app/(portal)/*      Server components + routes (Next.js App Router)
  page.tsx          Gate with can(user, action, resource) → call a service → render
  api/*/route.ts    Thin: parse → requirePermission → service → JSON
components/*        Presentational only; design tokens, never inline colour
lib/services/*      ALL business logic and SQL lives here
lib/db              query() / withUserContext()
lib/auth            getCurrentUser, session
db/*.sql            Numbered migrations, additive only
db/validate.mjs     The schema contract — 105 checks
```

**The layering rule:** business logic and SQL live in `lib/services/`. Pages and
API routes stay thin — gate, call a service, render. If you are writing SQL in a
`page.tsx`, it belongs in a service.

**Database:** PostgreSQL 15 + pgvector, 7 schemas, 72 tables. Migrations are
**additive and numbered** — never edit a shipped migration. Add the next number,
register it in `db/lib.mjs` `DEFAULT_FILES`, **and** add a check to
`db/validate.mjs`. Miss either registration and it silently will not load.

**Styling:** premium dark theme. All colour comes from tokens in
`frontend/tailwind.config.ts` — semantic classes like `bg-canvas`, `text-secondary`,
`border-line`. **No inline hex anywhere.** Lato only (300/400/700). No shadows,
no gradients. The logo is always an image, never typed as text.

Check every new screen at **320 / 768 / 1024 / 1440** for horizontal scroll.

---

## 7. How to make a change

```bash
git checkout platform-baseline-v1
git checkout -b feat/your-thing        # feat/ · fix/ · test/ · chore/
# build it
# run all four checks from §4
git commit                              # meaningful message, see below
git checkout platform-baseline-v1
git merge --no-ff feat/your-thing       # --no-ff keeps the arc readable
git push origin platform-baseline-v1
```

**Commit messages** state what changed and why: `feat: add project delay analytics`,
`fix: correct parallel approval quorum handling`. Never `updates`, `changes`,
`stuff`, `final`, `latest`.

**Before opening a PR**, work the checklists in
[`architecture/MODULE_DEVELOPMENT_GUIDE.md`](architecture/MODULE_DEVELOPMENT_GUIDE.md)
— it has a PR checklist (§16), code review checklist (§17), Definition of Done
(§18) and release checklist (§19).

**Verify before you build.** Twice, a request to "build step N" turned out to be
already implemented, and the real work was closing a test gap — both times the
audit found genuine defects. Read the code before assuming something is missing.

---

## 8. Gotchas that have already cost real time

- **The dev database is single-connection.** Opening a second raw `pg` connection
  while `next dev` is running wedges it — the port still listens but every query
  fails. Fix: restart `db/dev-db.mjs`. Read state through the app's own HTTP APIs
  instead of a second connection.
- **`next build` while `next dev` runs** clobbers `.next`.
- **Notification templates interpolate `{{variables}}`.** When you publish an event,
  supply *every* variable its template expects — a missing one ships a raw
  `{{placeholder}}` to a real user. This has happened twice.
- **`audit.log`'s column is `actor_role`**, not `role`.
- **Never run a global find-and-replace over `db/validate.mjs`** — short ID
  fragments recur and will corrupt unrelated checks.
- **Tailwind config changes need a dev-server restart** — hot reload will not
  reprocess tokens.
- **Publish events; never notify directly.** Call `publishEvent(...)` and let the
  notification framework decide recipients, channels and templates.

---

## 9. Where the project stands

**Done:** platform foundation, RBAC, auth, notifications, scheduler; the full
workflow engine and all 10 of its screens; Project Hub; WIO/PIO Hub; Design Room;
VisionCAM web view; Founder Morning Brief; Exit Protocol; Succession Pack.

**Velocity Gates:** 5 of 8 pass (#2, #3, #4, #6, #7). Open: **#1** VisionCAM
billing on every site · **#5** EH discount gate · **#8** Communication Spine
welcome letter.

**Next up:** S6 EH · Experience Centre, then Phase 2 integrations (HubSpot,
TranZact, Keka, Microsoft Graph, WhatsApp).

**The workflow engine backend is frozen.** Extend a read model only if a screen
genuinely needs it, and raise it before adding any write path.

Current detail always lives in [`PROJECT_MEMORY.md`](PROJECT_MEMORY.md) §2 and §5 —
that file is maintained; this section will age.

---

## 10. Access you will need

Ask **Ruby Nesrwal** unless noted. None of these are in the repository.

| What | Why | Who |
|---|---|---|
| GitHub repository access | the code | Ruby |
| The 39-section portal brief | `docs/Portal_Complete_Brief.html` is in-repo; confirm you have the current revision | Ruby |
| `ANTHROPIC_API_KEY` | AI advisory features (optional — the app degrades honestly without it) | Ruby |
| Entra ID app registration | staff SSO — **[prod only]** | Ruby |
| AWS (RDS, S3) | database and VisionCAM photos — **[prod only]** | Ruby |
| Brand assets | the wordmark PNG; never typeset the name | Monica |

**Who to ask about what:** brand, vocabulary and anything client-facing → **Monica**.
Operations, manufacturing and the production facility → **Hardesh**. Scope,
priorities, sprint order and everything day-to-day → **Ruby**.

---

## 11. Where to go deeper

Read in this order. Stop when you have what you need.

| Read when | File |
|---|---|
| **Always first** — the rules and the brand | [`../CLAUDE.md`](../CLAUDE.md) |
| Current state, history, recovery | [`PROJECT_MEMORY.md`](PROJECT_MEMORY.md) |
| Setup, running, debugging, deployment | [`../RUNBOOK.md`](../RUNBOOK.md) |
| System shape and load-bearing patterns | [`../ARCHITECTURE.md`](../ARCHITECTURE.md) |
| Why something is the way it is — **before proposing a change** | [`../DECISIONS.md`](../DECISIONS.md) |
| Building a new module — checklists and Definition of Done | [`architecture/MODULE_DEVELOPMENT_GUIDE.md`](architecture/MODULE_DEVELOPMENT_GUIDE.md) |
| The workflow engine in depth | [`architecture/WORKFLOW_ENGINE_SPECIFICATION.md`](architecture/WORKFLOW_ENGINE_SPECIFICATION.md) |
| Permissions model | [`architecture/rbac.md`](architecture/rbac.md) |
| Schema | [`architecture/database.md`](architecture/database.md) |
| Every endpoint | [`architecture/api-catalogue.md`](architecture/api-catalogue.md) |
| Known debt and production gaps | [`architecture/TECH_DEBT.md`](architecture/TECH_DEBT.md) · [`architecture/PRODUCTION_READINESS.md`](architecture/PRODUCTION_READINESS.md) |
| A worked module example, written for a late joiner | [`wio-pio.md`](wio-pio.md) |
| Backlog | [`../TODO.md`](../TODO.md) |

---

## 12. Handover checklist

For whoever is handing the project over. Tick every line.

**Access granted**
- [ ] GitHub repository access confirmed — they can clone and push
- [ ] They know the baseline branch is `platform-baseline-v1`
- [ ] Any API keys and cloud credentials transferred **outside** the repository
- [ ] Brand assets supplied

**Proven working, watched over their shoulder**
- [ ] Both workspaces installed (`db/` **and** `frontend/`)
- [ ] `.env.local` created and the app loads at `:3000`
- [ ] All four checks in §4 pass on **their** machine
- [ ] They have signed in as at least two access levels and seen the difference

**Understood, not just read**
- [ ] They can explain WIO, PIO, GFC and the Triangle of Agreement without looking
- [ ] They know the seven never-break rules in §5
- [ ] They know the banned words and why "production facility" is not "factory"
- [ ] They know where business logic goes, and that pages stay thin
- [ ] They know migrations are additive and need registering in **two** places

**Handed over**
- [ ] Walked through [`PROJECT_MEMORY.md`](PROJECT_MEMORY.md) §5 — current work and blockers
- [ ] Walked through [`../TODO.md`](../TODO.md) — the backlog and what is blocked
- [ ] Introduced to Ruby (day-to-day), Monica (brand), Hardesh (operations)
- [ ] They have made one small change end-to-end: branch → verify → commit → merge
- [ ] Told: when this file goes stale, fix it. It is part of the codebase.
