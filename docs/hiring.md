# Hiring and interviews (S11)

For a developer who joins in month 6. The module is the People side of the
portal's first segment: an open seat (Brief §32) through the rounds that fill
it, into a decision somebody can reconstruct a year later (§36).

## What it does

Hiring lived in a WhatsApp group and an inbox. The cost of that was not admin:
it was that a candidate got asked the same question by four people, and the one
thing nobody asked turned out to be the thing that mattered.

The module holds the seats that are open, the people against them, the rounds
in the diary, the questions each round asks, and what each interviewer thought —
written once, by the person who thought it, before they heard anybody else.

## Where things live

| Layer | Files |
|---|---|
| Service | [frontend/lib/services/hiring.ts](../frontend/lib/services/hiring.ts) — seats, candidates, rounds, question sets, scorecards, the trail |
| APIs | `GET/POST /api/hiring/roles` · `PATCH /api/hiring/roles/{id}` · `GET/POST /api/hiring/candidates` · `GET/PATCH /api/hiring/candidates/{id}` · `GET/POST /api/hiring/interviews` · `GET/PATCH /api/hiring/interviews/{id}` · `PUT /api/hiring/interviews/{id}/scorecard` · `GET/POST /api/hiring/question-sets` · `GET /api/hiring/my-rounds` |
| UI | [app/(portal)/hr/](<../frontend/app/(portal)/hr/>) — the board, `candidates/{id}`, `rounds/{id}`, `questions` — with [components/hiring/](../frontend/components/hiring/) |
| Data | [db/049_hr_interviews.sql](../db/049_hr_interviews.sql) — schema `hr`, nine tables, RLS, grants, permissions |
| Proof | [db/validate.mjs](../db/validate.mjs) (7 hiring checks, incl. the RLS fence) · [frontend/tests/unit/hiring.test.ts](../frontend/tests/unit/hiring.test.ts) (24 contract tests) |

## Who can see what

Two doors, and they are not the same door.

**The board** is `hr_access` on the `hiring` resource: L0, L1, and anybody
whose department is `HR`. HR runs hiring from L2, which is a department row
beating the level's global row — the mechanism [`004_foundation.sql`](../db/004_foundation.sql)
already had. There is no global L2 or L3 grant, and `db/049` raises an
exception at migration time if one ever appears.

**A round** is the panel list. A department HOD sitting in an interview is not
HR and must never see the board, but they must reach the round they are in or
they cannot write the feedback the round exists to get. So `/hr/rounds/{id}`
is gated on `hr.interview_panel` and nothing else, and `/hr` shows such a
person their own rounds instead of the word "Restricted".

Both are enforced twice. The service refuses, and Postgres refuses
independently through RLS on `hr.candidates`, `hr.interviews`,
`hr.scorecards`, `hr.scorecard_answers` and `hr.candidate_activity`.

### The one gap RLS cannot close

RLS decides rows, not columns, and a candidate row carries what they earn now
and what they are asking for. A panel member legitimately reaches that row.
Keeping the money from them is therefore the **service's** job:
`getRoundForPanel` never selects it, and `toCandidateSummary` takes an explicit
`withMoney` argument so every caller has to answer the question out loud.

If you add a read path to `hr.candidates`, that is the thing to get right.

## Business rules enforced

1. **Nothing deletes.** A candidate is rejected or withdrawn, never removed —
   somebody who applied twice deserves to be met by somebody who knows it. A
   seat is closed, not dropped. The trail has no update or delete path in the
   code, and `essentia_app` is granted only `SELECT, INSERT` on it.
2. **You do not move somebody on while an interviewer owes a write-up.** The
   refusal counts them and says so. The alternative is deciding without the
   person who was actually in the room.
3. **A rejection needs a reason.** A "no" with nothing written is the row that
   gets the same person called again next year and asked the same questions.
   Hiring and offering need no note; stopping somebody does.
4. **One interviewer, one scorecard, one way.** `UNIQUE (interview_id,
   user_id)` in the database, and a submitted card has no edit path anywhere.
   What a scorecard is worth is that it was written before its author heard
   what everybody else thought.
5. **A submitted scorecard must say yes or no.** Enforced in the service and
   again as a CHECK constraint. Ratings with no recommendation are the shape of
   feedback that decides nothing.
6. **A round needs somebody in it.** An empty panel is refused: nobody writes
   feedback on a conversation they were not part of.
7. **The stages are rows.** `hr.interview_stages`, ordered by `seq`. Nothing in
   the TypeScript hard-codes the pipeline, so inserting a round between two
   others is an `INSERT`, not a deploy. This is the house rule — structure is
   data, not code.
8. **Question sets are chosen, not remembered.** Scheduling a round with no set
   named picks the most specific active one: written for this seat at this
   stage, then the stage's own, then a general set. Two candidates at the same
   stage get the same questions without anybody having to think about it.
9. **Decisions are audited.** `HIRING_DECISION` into `audit.log` with what the
   status was before, alongside the module's own candidate trail.

## Times

Interview times are the one place in the portal where rendering a timestamp in
UTC is not untidy but wrong — 11:30 in Gurugram shows as 06:00 and somebody
believes it. `when()` in
[components/hiring/RoundsList.tsx](../frontend/components/hiring/RoundsList.tsx)
formats in `Asia/Kolkata` explicitly, named rather than taken from the machine
so the server and the browser agree and hydration does not tear.

## What is not here

- **No candidate-facing portal.** Everything is inside the portal, for staff.
  A link a candidate opens would want its own route outside the portal shell,
  the way `/deck` is, and its own decisions about what a stranger may see.
- **No calendar invitations.** A round is in the portal's diary, not in
  anybody's Outlook. That is the Communication Spine's job when it lands.
- **No Keka link.** Hiring somebody does not create their employee record.
  `public.users.keka_employee_id` is where those two worlds will meet.
- **No CV storage.** `resume_url` points at S3 or Drive; the file is not in
  Postgres.
