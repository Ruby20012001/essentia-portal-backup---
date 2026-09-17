# Hiring and interviews (S11)

For a developer who joins in month 6. The module is the People side of the
portal: an open seat (Brief §32) through the interviews that fill it, into a
decision somebody can reconstruct a year later (§36).

## What it does

Hiring lived in a WhatsApp group and an inbox. The cost of that was not admin:
it was that a candidate got asked the same question by four people, and the one
thing nobody asked turned out to be the thing that mattered.

The module holds the seats that are open, the people against them, the
interviews in the diary, the questions each interview asks, and what each
interviewer thought — written once, by the person who thought it, after the
conversation and before they heard anybody else.

## How somebody uses it

1. **Open a seat** on `/hr` — the job opening, with its headcount, employment
   type and hiring lead.
2. **Add candidate** on that seat — a name and an email or phone. Somebody who
   applied before is recognised by email or the last ten digits of their phone.
3. **Schedule an interview** from the candidate's page — which interview, when
   (India time), who sits in. The right question set is chosen automatically.
   Everybody put on the panel is notified.
4. **Write it up** — each interviewer opens the interview from "Your
   interviews" on `/hr` (or the notification) once it has started, and submits.
5. **Decide** on the candidate's page — move them on, make the offer (the
   final stage), hire, reject, withdraw, or reopen.

The same five steps are printed at the top of the board for anybody who can add.

## Where things live

| Layer | Files |
|---|---|
| Rules (pure) | [frontend/lib/services/hiring-logic.ts](../frontend/lib/services/hiring-logic.ts) — question-set choice, default interview, "has it happened", allowed decisions, seat limits, input checks, IST conversion |
| Service | [frontend/lib/services/hiring.ts](../frontend/lib/services/hiring.ts) — seats, candidates, interviews, question sets, scorecards, the trail, panel notifications |
| APIs | `GET/POST /api/hiring/roles` · `PATCH /api/hiring/roles/{id}` · `GET/POST /api/hiring/candidates` · `GET/PATCH /api/hiring/candidates/{id}` · `GET/POST /api/hiring/interviews` · `GET/PATCH /api/hiring/interviews/{id}` · `PUT /api/hiring/interviews/{id}/scorecard` · `GET/POST /api/hiring/question-sets` · `PATCH /api/hiring/question-sets/{id}` · `GET /api/hiring/colleagues` · `GET /api/hiring/my-rounds` |
| UI | [app/(portal)/hr/](<../frontend/app/(portal)/hr/>) — the board, `candidates/{id}`, `rounds/{id}`, `questions` — with [components/hiring/](../frontend/components/hiring/) |
| Data | [db/049_hr_interviews.sql](../db/049_hr_interviews.sql) — schema `hr`, nine tables, RLS, grants, permissions, notification templates |
| Proof | [db/validate.mjs](../db/validate.mjs) (14 hiring checks, incl. the RLS fence from three directions and every privilege the code uses, checked against `essentia_app` itself) · [tests/unit/hiring.test.ts](../frontend/tests/unit/hiring.test.ts) · [tests/unit/hiring-logic.test.ts](../frontend/tests/unit/hiring-logic.test.ts) |

## Who can see what

Two doors, and they are not the same door.

**The board** is `hr_access` on the `hiring` resource: L0, L1, and anybody
whose department is `HR`. HR runs hiring from L2 via a department row beating
the level's global row. An HR L3 coordinator can add and schedule but not
decide. There is no global L2 or L3 grant, and db/049 raises an exception at
migration time if one ever appears.

**An interview** is the panel list. A department HOD sitting in an interview is
not HR and must never see the board, but reaches the interview they sit in —
`/hr/rounds/{id}` — and writes their own feedback. HR can open any interview to
check its time, panel and questions, without a write-up form.

Both are enforced twice: the service refuses, and Postgres refuses
independently through RLS on `hr.candidates`, `hr.interviews`,
`hr.scorecards`, `hr.scorecard_answers` and `hr.candidate_activity`. A panel
member may INSERT one line to the trail — "wrote up the department round", in
their own name, about a candidate they are interviewing — and reads none of it.

### The one gap RLS cannot close

RLS decides rows, not columns, and a candidate row carries what they earn and
what they are asking for. A panel member legitimately reaches that row, so the
money is fenced in the **service**: `getRound` never selects it, and
`toCandidateSummary` takes an explicit `withMoney` argument. If you add a read
path to `hr.candidates`, that is the thing to get right.

## Business rules enforced

1. **Nothing deletes.** A candidate is rejected or withdrawn — and can be
   reopened with a reason. A seat is closed, not dropped. The trail has no
   update or delete path, and `essentia_app` holds only `SELECT, INSERT` on it.
2. **Nobody is moved on, offered or hired while an interviewer owes a
   write-up.** The refusal names them. An interview counts as having happened
   when it is marked held **or when its end time has passed without being
   called off** — waiting for somebody to click "Held" meant the rule never
   fired. An interview that did not take place is marked called off or no-show;
   somebody who sat in but cannot write it up (on leave, left the company) is
   **excused** by HR with a reason on the trail.
3. **The final stage is the offer.** Moving a candidate there sets `offered`;
   moving them back takes it back. There is no separate "offered" button.
4. **Decisions follow from where the candidate stands.** Nothing flips a
   rejected candidate to hired; they are reopened first. Rejecting, withdrawing
   and reopening need a reason.
5. **The seat is real.** A hire is refused on a closed or filled seat or past
   headcount; the hire that takes the last place marks the seat filled — and
   asks first if others are still moving on it. Closing or filling a seat with
   people still moving asks too. A seat's headcount cannot be edited below the
   people already hired; a seat filled by hand reopens only when its headcount
   is raised, and reopening the hire who filled a seat opens it again.
6. **Stopping a candidate calls off their interviews still ahead,** in the
   same transaction, and the panel is told — except any interview somebody has
   already written up.
7. **One interviewer, one scorecard, submitted once the interview has started,
   never edited after.** `UNIQUE (interview_id, user_id)` plus a CHECK that a
   submitted card carries a recommendation. The scorecard, its answers and the
   trail line are one transaction.
8. **An interview needs somebody in it.** The HR person scheduling it may add
   themselves ("Add me"). Nobody who has started a write-up can be taken off.
   **Once an interview has started, its time, questions and panel are fixed**
   except for adding somebody who sat in — moving it would erase the write-ups
   it is owed. An edit sends only what changed, and only people being added are
   checked, so a colleague who has since left does not stop an interview being
   moved. Shared logins (the tracker's view-only account) can never sit on a
   panel.
9. **Question sets are chosen, not remembered.** The most specific active set
   wins: seat + interview, then interview for any seat, then seat for any
   interview, then general; newest wins inside a tier. A set picked by hand has
   to fit the seat and interview. A set used by any interview can only be
   retired, not rewritten.
10. **The stages are rows.** `hr.interview_stages`, ordered by `seq`. Nothing
    in the TypeScript hard-codes the pipeline.
11. **Earlier applications are surfaced.** Adding somebody who applied before
    stops and says for which seat and how it ended; they can be added as a new
    application, and the file links the earlier ones.
12. **Decisions and corrections are audited** (`HIRING_DECISION`,
    `HIRING_CANDIDATE_EDIT`, `HIRING_SEAT_UPDATE`, `HIRING_PANEL_EXCUSE`).

## Times

Interview times are the one place where rendering UTC is not untidy but wrong —
11:30 in Gurugram shows as 06:00 and somebody believes it. Times are shown with
`formatIST` ([lib/format.ts](../frontend/lib/format.ts)) and **entered** as India
time too: the form's `datetime-local` value is read with an explicit `+05:30`
(`istLocalToIso`), so a laptop left on UTC stores the hour that was typed.

## Salaries

Entered in lakhs, stored in rupees. A figure below ₹10,000 a year is refused as
almost certainly typed in the wrong unit.

## Notifications

`hiring.panel_added` (you are on a panel) and `hiring.round_changed`
(rescheduled, called off, or you were taken off) go through the notification
engine to the named people, never to the person who made the change. In-app
only. A notification failure never fails the action it reports. Every template
variable is asserted by a unit test that reads db/049.

## Going live

The live deployment runs `NEXT_PUBLIC_PORTAL_MODE=tracker`. `/hr` and
`/api/hiring` are on its route list in
[lib/portal-mode.ts](../frontend/lib/portal-mode.ts); the panel picker uses
`/api/hiring/colleagues` so hiring does not also open `/api/users`.

If the code reaches a database before db/049 has been run, the hiring screens
say "Hiring is not switched on yet" instead of failing.

## What is not here

- **No candidate-facing portal.** Everything is inside the portal, for staff.
- **No calendar invitations or email.** A panel member is told in the portal.
- **No Keka link.** Hiring somebody does not create their employee record.
- **No CV storage.** `resume_url` points at Drive or OneDrive; the file is not
  in Postgres.
