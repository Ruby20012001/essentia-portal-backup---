# CLAUDE.md

Standing context for any Claude session working in this repo. `HANDOFF.md`
points here; before 2026-09-23 the file it pointed at did not exist.

Read next: `docs/PROJECT_MEMORY.md`, then `RUNBOOK.md`.

## Where this project actually is

The portal is **not deployed anywhere**. `RUNBOOK.md` §8 says so plainly:
"Not yet stood up — this is the gate list, not a runbook of live steps." It
runs on one Windows laptop, against a PGlite dev database kept on disk at
`db/.dev-data` and served on `127.0.0.1:55432`.

Since 2026-09-23 there is also a **Neon** database (managed Postgres, `vector`
available). `frontend/.env.local` points at it; the PGlite line is kept beside
it, commented, to go back to.

**Neon is a test database. It is not production.** It exists so the portal
could be run in production mode against real PostgreSQL — extensions,
migrations and sign-in — before anyone picks where this is hosted. Nothing
about it is production: no backup, no point-in-time recovery, nobody watching
it, and a connection string that has been pasted into a chat transcript.

So **no real candidate's name, phone, CV or salary goes into it.** Not one, not
as a trial. When real hiring starts, where it lives is a separate decision that
has not been taken yet. Until then every row in `hr.*` — here and on the dev
database — is something somebody typed to prove a screen worked.

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

**`SET LOCAL ROLE essentia_app` fails on a real database until the connecting
user holds the membership *with `SET`*.** `withUserContext` (`lib/db.ts`) runs
it in every fenced transaction; without the membership PostgreSQL answers
`42501 permission denied to set role` and every page that reads fenced data
returns a server-side exception. From PostgreSQL 16 the membership carries a
separate `SET` option that grants do not give by default — Neon creates the
membership with `SET false`. `db/007_app_role.sql` now grants it.

**PGlite hides that whole class of bug.** Its connecting user is a superuser,
so it never needs the membership — and superusers skip RLS entirely, which is
the exact hole `007` exists to close. Anything about roles, grants or fencing
that passes locally has not been tested. Neon is where it gets tested.

**The documents are wrong about the PostgreSQL version.** They said 15 until
2026-09-23; the real minimum is 16, for the `SET` option above. Neon is 18.6
and PGlite is 18.3, so **no PostgreSQL 15 exists anywhere in this project** —
`007`'s pre-16 branch is written but has never been run.

**Documents here go stale, repeatedly.** Four found in one week: TD-01's "all
platform code uncommitted" (the repo had full history), the baseline-branch
line, the PostgreSQL 15 minimum, and `(portal)/layout.tsx:11`'s claim that
"middleware only does the Edge cookie-presence gate" — there is no middleware
file in this repo at all. Verify anything you take from a document, or from a
comment, before acting on it.

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

## There are two hiring builds, and this is only one of them

`C:\hr portal` is a second, separate build of the same idea — Node/Express,
EJS templates, a JSON file for storage, started 21 Sep 2026. It was written
before it was clear this repo already had a hiring module, set aside once that
became clear, and then picked back up on 23 Sep. **Both are live work.**

| | this repo | `C:\hr portal` |
|---|---|---|
| stack | Next.js, PostgreSQL, RLS | Express, EJS, `data/db.json` |
| stages | 6 rows, `hr.interview_stages` | 5 rows in the JSON |
| accounts | `hr.*@essentia.in`, scrypt, HR department | four accounts, bcrypt |
| database | Neon (test) + PGlite (dev) | one JSON file |

The same board has now been built in both — `527f6a5` here, and separately
there. **Which one survives has not been decided.** Until it is, neither is the
abandoned one, and work in one does not imply anything about the other.

Still true, and the part that matters: **do not copy code between them.** They
share no stack, no schema and no auth. Anything moved across has to be rewritten
rather than pasted, and a half-ported file is worse than either original. Real
candidate data belongs in neither until the decision is made — see the Neon note
above for why.
