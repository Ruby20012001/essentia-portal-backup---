# WIO → PIO Tracker (S4b)

Brief §29–30. The stage-chain cut of the WIO → PIO window, converted from
Dipmallya's team's Excel workbook and seeded with their real board.

Route: **`/wio-tracker`** · Nav: Delivery → *WIO → PIO Tracker*

---

## What it is, and what it is not

Every WIO must become a PIO inside a 15-day window. It walks an **ordered chain
of stages**; at any moment it sits at exactly one. The tool answers one
question the checklist model cannot: **who is holding this, and for how long.**

Nobody reports status. Everything is computed from two fields someone changes
by hand — the **stage**, and the date it moved there (**since**).

> **This is not a second copy of the S4 WIO/PIO Hub at `/wio-pio`.**
>
> | | `/wio-pio` (S4) | `/wio-tracker` (S4b) |
> |---|---|---|
> | Row | one WIO per department | one ED/YY-YY/NNN work item |
> | Number | `WIO/26-27/018/ARCH` | `ED/26-27/129` |
> | Model | BOQ + 3D + SLD checklist → convert | 9-stage chain, moved by hand |
> | Tables | `ee.wio`, `ee.pio` | `ee.tracker_*` |
>
> They share the §30 window and nothing else. Neither owns the other's rows.

---

## Where the logic lives

**`frontend/lib/services/wio-tracker-logic.ts`** — the whole derivation, pure:
no database, no clock, no environment. Read this file first; it is the tool.

Nothing derived is ever stored. A stored status is a status that goes stale the
moment nobody updates it, and a board that quietly claims to be on time is
worse than no board. Pinned by 74 unit tests in
`frontend/tests/unit/wio-tracker-logic.test.ts`.

| Field | Rule |
|---|---|
| `pioDue` | `wioIssued + windowDays` · null when the clock never started |
| `daysLeft` | `pioDue − today` · null once released — n/a, never a misleading 0 |
| `daysHere` | `max(0, today − since)` |
| `thisStageDue` | `pioDue − stage.doneBy` |
| `dayLabel` | `PIO released` / `Add the WIO date` / `D-n` / `OVERDUE +n` |
| `accountability` | the stage's `waitingOn`; at the last stage, the WIO's `raisedBy` (or `not named`) |
| `upcomingStage` | next stage · its holder · `— last stage` · `—` once released |
| `status` | first match: Released → Not tracked → OVERDUE → LATE HERE → At risk → On track |
| `priority` | 60 overdue / 40 late-here / 20 at-risk, `+ min(daysHere, 20) + openDelays × 5` |

**`done_by` counts days *before* the PIO date** — it falls down the chain
(14 → 0). It is a deadline offset, not a duration, and cannot be summed.

### The colour rule

Green: On track, Released · Orange: At risk · **Red: LATE HERE and OVERDUE
only** · Neutral: Not tracked.

Red is rare on purpose — the team rejected an earlier build that turned most
rows red. Every status colour resolves through
`components/wio-tracker/StatusPill.tsx` so that property cannot erode one
component at a time. A unit test asserts exactly two statuses map to red.

### "Today" is stamped, not derived

`ee.tracker_settings.today_stamp` is **one shared row**, set by the team on the
Setup screen. It is never `CURRENT_DATE`. Two people must not disagree about
what is overdue, and a screenshot taken at 11pm must read the same as one taken
at 9am. That property is the reason this left the spreadsheet.

The seed stamps **2026-08-25** — derived, not guessed: all 24 delay rows
satisfy `days_lost = 2026-08-25 − started`, with no exceptions.

### The stage/since pairing

In the workbook this was two manual steps and the second got forgotten, which
made "days here" quietly wrong. Here, **changing the stage re-stamps `since`
server-side in the same write**, and the banner says so. An explicit `since` in
the same patch still wins, so a correction is possible — it just is not required.

### The countdown, rev A (db/045 · Monica, 2026-09-15)

The chain follows *WIO to PIO — the countdown* (rev A) as Monica marked it up:

| # | Stage | Waiting on | Done by |
|---|---|---|---|
| 1 | Archive pass | PD team | D-14 |
| 2 | SLD · Design | Design team | D-10 |
| 3 | SLD · Architecture | Architecture team | D-10 |
| 4 | Finishes | Roopdeep + CRM | D-9 |
| 5 | **Final SLD** | Design team | **D-9** |
| 6 | **SLD approvals** | Jyoti + Yogi + Vishakha + TL | **D-6** |
| 7 | FG code | Shruti + CRM | D-3 |
| 8 | Client sign-off | Client | D-2 |
| 9 | PIO | WIO raised by | D-0 |

GFC is gone (its days went to SLD preparation) and so is BOM (made after the
PIO). **Acknowledged** is a date per WIO: the drawing team acknowledges within
24 hours of issue. The board derives *Awaiting*, *Not acknowledged* (at the
first stage, day passed) and *Acknowledged late*, shown in orange under the
status — it never changes status, colour or priority. A row past the first
stage with no date reads *Not recorded* and is not flagged; no date is invented.

---

## Access (Ruby's ruling, 2026-08-31)

Rows in `public.permissions`, seeded in `db/030`. Policy is a row update, never
a code edit.

| Who | Board | Delay log |
|---|---|---|
| **The WIO team** (`DRAFTING`), L2 **and L3** | read · create · edit · delete | yes |
| **CRM** (`CRM_EE`), L2/L3 | **read only** (explicit `allowed=FALSE` rows) | yes |
| L0 / L1 — Monica, Hardesh, leadership | **read** | yes |
| Everyone else | nothing | nothing |

L3 holds edit on purpose: the person who moves a WIO each morning is a team
member, not the HOD. A board only a TL can touch is stale by Wednesday.

### The team lens

Every WIO carries `team_code` (`db/032`) — Dipmallya's or Neeraj's. A chip row
above the tabs narrows Today, WIOs and Delays together, so no two screens can
disagree about what a team is holding.

It is a **lens, not a fence**. Both teams sit in `DRAFTING` and both work the
whole board; the column only says whose row it is. Dipmallya's team can see and
fix a row of Neeraj's — that mutual cover is the reason they share one board. If
it ever must become a fence, that is an RLS policy on `team_code`, not a change
to the grants.

Team roll-ups go through the same pure `todayStats` / `holdingByStage` the
server calls, over `forTeam(rows, code)` — filtering is never a second
implementation, and a test asserts the parts sum to the whole. `forTeam` fails
closed: an unknown team shows nothing, never everything.

> **Neeraj's team has no rows yet.** The board says so in words rather than
> showing eight zero tiles, which would read as a clear day.

### Who the owning team is

Confirmed by Ruby, 2026-08-31. The owning department is exactly one —
`DRAFTING`, *"WIO / GFC Drafting"* (§30, Jyoti Yadav's team). **Dipmallya and
Neeraj run two teams inside it**, split by whose project portfolio they serve:

| Team | Serves |
|---|---|
| Dipmallya's | Dhruv Kelaya's CRM projects |
| Neeraj's | Neeru Bajaj's CRM projects |

Dhruv and Neeru are the two CRM Team Leads in `CRM_EE` (§26/§39) — which is
exactly why CRM holds the view tier: they own the projects these WIOs serve, so
they must see where each one stands, and may not move it.

The two teams are **not** separate departments, because they are not: the
portal's org model stops at department. If the board ever needs to say which of
the two a row belongs to, that is a column on `ee.tracker_wios`, not a split in
these grants. The pairing is recorded in `portal.app_config` under
`tracker.teams`, read by nothing yet.

> **Corrected during build.** An earlier draft granted edit to five departments
> (`DRAFTING`, `INTERIOR`, `ARCH`, `3D`, `FFE`) on the assumption that everyone
> named in the stage chain owned the board. Wrong: `INTERIOR`, `ARCH`, `3D` and
> `FFE` appear in `tracker_stages.waiting_on` because they **hold stages** —
> they are tracked *by* this board, not owners of it. Waiting-on is not a grant.

Logging a delay additionally requires **read on the board** — enforced in the
service, since a permission row governs only one resource. Without it a
department fenced out of the tracker could still write onto it.

---

## Files

```
db/030_wio_pio_tracker.sql        DDL · permissions · config      (idempotent)
db/031_wio_pio_tracker_seed.sql   the real board: 37 WIOs, 24 delays, 10 stages
db/045_tracker_countdown_rev_a.sql  the chain as marked up: 9 stages · acknowledged date
db/900_dev_fixtures.sql           + 2 dev personas in DRAFTING

frontend/lib/services/
  wio-tracker-logic.ts            ← the derivation. Pure. Start here.
  wio-tracker.ts                  reads/writes, RBAC, audit. Derives nothing.

frontend/app/api/wio-tracker/     GET board · wios · delays · settings · stages
frontend/app/(portal)/wio-tracker/page.tsx
frontend/components/wio-tracker/  WioTrackerBoard · Today · Wios · Delays · Setup · StatusPill
frontend/tests/unit/wio-tracker-logic.test.ts    74 tests
```

Tables: `ee.tracker_settings` · `tracker_stages` · `tracker_wios` ·
`tracker_delays` · `tracker_delay_reasons` · `tracker_people`.

No RLS, deliberately: the board is one shared object, not per-row-owned
records. A half-visible board would show "3 stuck at GFC" that silently means
"3 that you can see". Visibility is one all-or-nothing RBAC decision.

## Run it

```bash
cd db && npm install && npm run dev-db
```

Then `frontend/.env.local`:

```
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/postgres
PGPOOL_MAX=1
DEV_USER_ID=00000000-0000-4000-8000-00000000000b
AUTH_ALLOW_DEV_LOGIN=true
```

```bash
cd frontend && npm install && npm run dev
```

`…000b` is Dev Tracker Lead (L2, DRAFTING) — full edit. Swap to
`…0001` (CRM TL) to see the view-only tier, or `…0002` (Founder, L0) for
Monica's read.

Verify: `cd db && npm run validate` · `cd frontend && npm test && npm run typecheck`

## API

| Method | Path | Needs |
|---|---|---|
| GET | `/api/wio-tracker` | read — whole board in one pass |
| POST | `/api/wio-tracker/wios` | create |
| PATCH/DELETE | `/api/wio-tracker/wios/[id]` | edit / delete |
| POST | `/api/wio-tracker/delays` | read + delay-create |
| PATCH | `/api/wio-tracker/delays/[id]` | read + delay-edit |
| PATCH | `/api/wio-tracker/settings` | edit — the date stamp, window, threshold |
| PATCH | `/api/wio-tracker/stages/[id]` | edit — retune the chain |

Refusals are `422` with the exact sentence, never a silent block:

- `'Done by' must be less than the 15-day window. At 20 days before the PIO date, this stage would be late the moment a WIO was issued.`
- `"…" is not one of the delay reasons. Pick one from the list so the cause and source are recorded consistently.`
- `ED/26-27/120 is already on the board. Open it rather than adding a second row.`

`cause`/`source` are never accepted from the client — the service reads them off
the chosen reason, so two people logging the same reason always classify it the
same way.

Every write lands in `audit.log`: `WIO_TRACKER_STAGE_MOVED` records the
automatic `since` re-stamp explicitly, so the trail shows the date was set by
the move rather than typed.
