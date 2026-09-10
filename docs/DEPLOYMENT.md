# Deploying the portal to a subdomain

Written for putting **S4b · WIO → PIO Tracker** in front of the WIO team first,
on something like `tracker.essentia.in`, with the rest of the portal following
later. Host-agnostic — the choices that differ by platform are called out.

---

## The three facts that decide everything

**1. It is a server, not a set of files.** Every route is server-rendered
(`ƒ` in the `next build` output). There is no static export. It needs a Node
runtime that stays running — Vercel, AWS App Runner/EC2/Amplify, a VPS,
anything that runs `next start`. **Shared/cPanel hosting that serves a
WordPress site cannot run it.**

**2. It needs PostgreSQL 15+.** `db/dev-db.mjs` is PGlite — in-memory, wiped on
restart. It exists so nobody needs Postgres installed to *develop*. It is not a
database. **Do not let anyone enter real WIOs against it.**

**3. The subdomain is just DNS, and it does not have to live where the main
website lives.** Add one record at the registrar pointing at wherever the app
runs. `essentia.in` is untouched — no shared server, no migration, no risk to
the existing site.

```
essentia.in            →  unchanged, wherever it is today
tracker.essentia.in    →  CNAME / A record  →  the Node host
                                                    │
                                                    └──► PostgreSQL 15+
```

---

## Environment

Copy from `frontend/.env.example`. The ones that matter:

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | `postgres://user:pw@host:5432/db` | Required. The only hard requirement. |
| `PGPOOL_MAX` | `10` | `1` only for the PGlite dev server. |
| `AUTH_ALLOW_DEV_LOGIN` | **unset** | See the warning below. |
| `DEV_USER_ID` | **unset** | Only read when the line above is `"true"`. |
| `NODE_ENV` | `production` | |
| `ENTRA_TENANT_ID` / `_CLIENT_ID` / `_CLIENT_SECRET` | from your Microsoft tenant | Enables "Sign in with Microsoft". |
| `ANTHROPIC_API_KEY` | | Not needed by the tracker. |

> ### ⚠ `AUTH_ALLOW_DEV_LOGIN` must never be `true` in production
>
> When it is `"true"`, `lib/auth/session.ts` will act as `DEV_USER_ID` **with no
> sign-in at all** — anyone reaching the URL is that user. It also prints the
> shared dev password on the login page. It is off unless explicitly set to the
> literal string `"true"`, and `tests/unit/env.test.ts` pins that. Leave it
> unset and confirm after every deploy.
>
> This board carries real client names, project scopes and internal delay
> attribution. On a public subdomain, that is the difference between a private
> tool and a leak.

---

## Database setup

Run once, in order, against the real database:

```
db/001_essentia_schema.sql   … through …   db/034_wio_pio_tracker_standup_2026_08_31.sql
```

`db/lib.mjs` holds the canonical ordered list (`DEFAULT_FILES`). Every file is
idempotent, so a re-run is safe.

**Skip `db/900_dev_fixtures.sql` in production.** It creates dev accounts with a
shared, published password. It is for local work only.

Verify the load the same way CI does:

```bash
cd db && npm install && npm run validate
```

---

## Real accounts

`900_dev_fixtures.sql` is not a user list. Real people need rows in
`public.users` with the right department and access level, or the tracker will
correctly refuse them:

| Who | `department_id` | `access_level` | Gets |
|---|---|---|---|
| WIO team — Dipmallya's and Neeraj's teams | `DRAFTING` | `L2` lead · `L3` member | read + edit the board |
| CRM — Dhruv's and Neeru's teams | `CRM_EE` | `L2` / `L3` | read only |
| Monica, Hardesh | — | `L0` | read |
| Senior leadership | — | `L1` | read |

Access is rows in `public.permissions` (`db/030`), not code. Changing who can
do what is an `UPDATE`, never a deploy.

### How people sign in

- **Microsoft (recommended).** If everyone has an `@essentia.in` Microsoft 365
  account, set the three `ENTRA_*` variables and they click "Sign in with
  Microsoft". No passwords to create, distribute, or reset. Needs an app
  registration from whoever runs the tenant — an IT request, not code.
- **Email + password.** The form exists and works, but **there is no invite,
  set-password or forgot-password flow yet**. Until one is built, there is no
  safe way to onboard someone with a password. Do not work around this by
  setting passwords centrally and sending them out.

---

## Pre-flight checklist

- [ ] `next build` passes
- [ ] `DATABASE_URL` points at real Postgres 15+, reachable from the host
- [ ] Migrations `001`–`034` loaded; `900_dev_fixtures.sql` **not** loaded
- [ ] `AUTH_ALLOW_DEV_LOGIN` unset — **confirm on the deployed site**: the login
      page must show no "Dev: …" hint line
- [ ] HTTPS on the subdomain (automatic on most platforms; certificate required)
- [ ] Real accounts created with correct department + access level
- [ ] Sign in as a CRM user and confirm the board is **read-only** — the stage
      dropdown renders but is disabled, and no "Add a WIO" button appears
- [ ] Sign in as a WIO-team user and confirm a stage change saves
- [ ] Database backups switched on

---

## Launching with only the tracker

Set one variable:

```
NEXT_PUBLIC_PORTAL_MODE=tracker
```

The deployment then serves the tracker and nothing else. Everything else
redirects to `/wio-tracker`; other modules' APIs return 404. The sidebar lists
one entry. `/` goes to the tracker rather than the dashboard.

**This is real, not cosmetic.** It is enforced in `middleware.ts`, so a closed
screen is unreachable by typing its URL — hiding nav links alone would not be.

To hand the team the tracker now and open the rest later, change the value to
`full` (or unset it) and rebuild. There is no fork, no second database and no
merge: it is the same codebase, which is exactly why "merge it in later" costs
nothing.

> **What this is not.** Launch mode decides which screens a *deployment* serves.
> It does not decide who may see what — that is RBAC (`public.permissions`) and
> RLS, which still apply underneath. A screen closed by this flag is closed by
> configuration, not by permission.

It is inlined at build time, so a change requires a rebuild. That is deliberate:
which screens a deployment serves should not be flippable at runtime.

---

## After go-live

The board is read against a **stamped date**, not the clock — one shared value
the team sets on the Setup tab. It does not advance on its own, by design: a
screenshot taken at 11pm must read the same as one taken at 9am, and everyone
must agree on what is overdue. Someone on the WIO team owns re-stamping it each
morning. If the numbers ever look frozen, that is the first thing to check.
