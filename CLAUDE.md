# CLAUDE.md

Standing context for any Claude session working in this repo. `HANDOFF.md`
points here; before 2026-09-23 the file it pointed at did not exist.

Read next: `docs/PROJECT_MEMORY.md`, then `RUNBOOK.md`.

## Where this project actually is

The portal is **not deployed anywhere**. `RUNBOOK.md` §8 says so plainly:
"Not yet stood up — this is the gate list, not a runbook of live steps." It
runs on one Windows laptop, against a PGlite dev database kept on disk at
`db/.dev-data` and served on `127.0.0.1:55432`.

So there is no production database, and no row anywhere is a real candidate's.
Anything that looks like live data is this machine's dev database.

## Traps that have already cost time

**`ENTRA_TENANT_ID` locks HR out.** `components/auth/LoginStage.tsx:151-160`
is either/or: if the tenant id is set, `/hr-login` shows "Sign in with
Microsoft" and the password form disappears. All four HR accounts are
`auth_provider = local` and do not exist in Entra. Do not set this variable
until Entra token validation is built (TD-04) **and** those accounts are moved
over — both, in the same change.

**A route missing from `lib/portal-mode.ts` is not merely unlinked.**
`LoginForm` falls back to `homeHref()` when `isRouteAllowed()` refuses the
`?next=`, so someone signing in lands on a board they have nothing to do with,
with no error. Hiring's routes were added in `c721337`; a new screen needs the
same entry.

**`db/migrate.mjs` skips the whole `9NN_` range** (line 64,
`const isFixture = (f) => /^9\d\d_/.test(f)`). Before `9be0c99` it named
`900_dev_fixtures.sql` only, and `901_design_tracker_fixtures.sql` ran against
every database it was pointed at — overwriting five designers' passwords with a
shared hash whose plaintext is in that file. Do not narrow that filter.

**Never run `db/migrate.mjs` against a database with real work in it.** 901
deletes its projects by name and re-inserts them. For adding the HR tables to a
live database use `db/apply-hr-portal.mjs`, which applies 056/057/058 and
nothing else. On a *fresh* database `migrate.mjs` alone is enough — those three
are already in `DEFAULT_FILES`.

**`PRODUCTION_READINESS.md` goes stale.** Its TD-01 said "all platform code
uncommitted" long after the repo had full history. Verify anything you take
from it before acting on it.

## The rules the hiring module is built to

These are enforced in the data layer, not hidden in markup. Do not weaken one
to make a screen easier.

- Nothing is ever deleted. A candidate is rejected or withdrawn; the file stays.
- A rejection needs a reason in words. Hiring and advancing take no note.
- One interviewer, one scorecard, written themselves, locked on submit.
- A submitted scorecard must say yes or no.
- No advancing while a write-up is owed on a round that has happened.
- Salary is HR only — stripped from the object in the route, not hidden later.
- The candidate sees their own diary: no verdict, no score, no pipeline
  position, nothing about anyone else. They can request a reschedule, not move
  one.
- Interview stages are data rows with an `order`, not code.
- All times Asia/Kolkata, with the timezone named on screen.

## House habits

- Windows laptop: PowerShell's execution policy blocks plain `npm`/`npx`. Use
  `npm.cmd` / `npx.cmd`.
- Work happens on `design-tracker-full`. `platform-baseline-v1` exists only as
  a remote branch — there is no local copy, and the `v0.1-platform-foundation`
  tag `RUNBOOK.md` §9 promises is not in this clone. `main` is **not** an empty
  stub either: `origin/main` is at `877e3c5`. Check `git branch -a` rather than
  trusting either document.
- New migration ⇒ add it to `db/lib.mjs` `DEFAULT_FILES` **and** a
  `db/validate.mjs` check.
- Never global-`sed` over `db/validate.mjs` — short id fragments recur and it
  corrupts unrelated checks.
- Commit trailer: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Do not push without being asked.
- Never print a secret, password or connection string — name the variable.

## Not part of this repo

`C:\hr portal` is a separate, abandoned Node/Express build of the same idea,
started 21 Sep 2026 and dropped once it was clear this repo already had the
module. Nothing was ever entered into it. Do not copy from it, and do not
touch it.
