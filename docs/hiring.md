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
| Candidate page | [lib/services/candidate-portal.ts](../frontend/lib/services/candidate-portal.ts) · [app/interview/{token}](<../frontend/app/interview/[token]/page.tsx>) · [components/hiring/CandidatePage.tsx](../frontend/components/hiring/CandidatePage.tsx) · [InvitePanel.tsx](../frontend/components/hiring/InvitePanel.tsx) · [RepliesList.tsx](../frontend/components/hiring/RepliesList.tsx) |
| Candidate data | [db/056_hr_candidate_portal.sql](../db/056_hr_candidate_portal.sql) — invites, replies, documents, the third RLS fence |
| HR's own door | [app/hr-login](../frontend/app/hr-login/page.tsx) — a second door, not a second lock |
| Voice agent | [lib/services/voice-agent.ts](../frontend/lib/services/voice-agent.ts) · `app/api/voice/` · [db/057_hr_voice_agent.sql](../db/057_hr_voice_agent.sql) — see [The voice agent](#the-voice-agent-db057) |
| Proof | [db/validate.mjs](../db/validate.mjs) (12 hiring checks, incl. all three RLS fences) · [hiring.test.ts](../frontend/tests/unit/hiring.test.ts) (24) · [candidate-portal.test.ts](../frontend/tests/unit/candidate-portal.test.ts) (22) · [voice-agent.test.ts](../frontend/tests/unit/voice-agent.test.ts) (30) |

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

- **No calendar invitations.** A round is in the portal's diary, not in
  anybody's Outlook. That is the Communication Spine's job when it lands.
- **No Keka link.** Hiring somebody does not create their employee record.
  `public.users.keka_employee_id` is where those two worlds will meet.
- **No mail.** HR copies the candidate's link out of the portal and sends it
  themselves. Mail is configured per deployment and a Send button that
  silently does nothing is worse than no button.

## The candidate's own page (db/056)

`/interview/{token}` — outside the portal shell, no account. It shows the
rounds that are booked, who will be in them, and takes three things back: "I
will be there", "I cannot, here is why", and a CV.

**HR's side** is on the candidate's file: make the link, see whether it was
opened and how often, withdraw it. The replies land above the board on `/hr`,
asks first and confirmations under them.

### What a stranger holding the link can do

Everything is written assuming the token has leaked — a link with no login
gets forwarded and pasted into group chats. The worst a holder can do is read
one person's interview times and reply to them.

- **Three fences, not two.** db/049 had `hr.may_see_hiring()` and the panel
  list. db/056 adds `hr.acting_candidate()`, set by `withCandidateContext()`
  in `lib/db.ts`, opening only that candidate's own row and rounds. It is a
  separate function from `withUserContext` on purpose: RLS policies are OR'd
  and the widest wins, so there must be no call site that can hold both.
- **The money is still the service's job.** RLS decides rows, and the
  candidate's own row is the one carrying `current_ctc` / `expected_ctc`. The
  one SELECT on that path names its columns. A unit test asserts no query run
  on the candidate path mentions either column, or `SELECT *`.
- **Scorecards and the trail needed no new policy.** db/049 opens them to HR
  or the card's own author; a candidate is neither. Proven in
  `db/validate.mjs`, not argued.
- **The token is never stored** — only its SHA-256, the way db/041 holds
  sign-in codes. HR sees it once. A lost link is reissued, never looked up.
- **It expires, and a finished candidate's dies early.** Rejected, withdrawn
  or hired, the link stops working whatever the expiry says.
- **Every failure says the same thing.** Expired, withdrawn, mistyped or
  belonging to somebody the company has finished with are indistinguishable
  from outside, or the page becomes a way to learn which links existed.
- **Nothing here moves an interview.** The candidate asks; HR reschedules.

### CVs

`hr.candidate_documents` holds the bytes, the way `ee.concept_deck_images`
holds a picture — `resume_url` pointed at S3 or Drive and neither is
configured. PDF and Word only, 5 MB, and they are served back to staff as an
attachment with `nosniff`, never inline: those bytes came from outside the
company.

## The voice agent (db/057)

An agent rings a candidate to confirm a round, or answers when they ring back.
It is a machine, it authenticates as a machine, and it never claims to be a
person — every call names the member of staff it is acting **for**.

| | |
|---|---|
| Service | [lib/services/voice-agent.ts](../frontend/lib/services/voice-agent.ts) |
| API | `POST /api/voice/calls` · `POST /api/voice/calls/{id}/identify` · `GET`/`DELETE` `/api/voice/calls/{id}` · `POST /api/voice/calls/{id}/reply` |
| Data | [db/057_hr_voice_agent.sql](../db/057_hr_voice_agent.sql) |
| Proof | 2 checks in [db/validate.mjs](../db/validate.mjs) · 30 in [voice-agent.test.ts](../frontend/tests/unit/voice-agent.test.ts) |

### Who is on the line

`candidate-portal.ts` had a 32-byte token and holding it was the proof. A
phone call has nothing like that: caller ID is spoofable, numbers are
reassigned, phones are shared. So a number is a **hint**, never an identity,
and the sequence is deliberately the awkward way round.

1. **Starting a call discloses nothing** — not the name, not whether the
   number is known. An unknown number gets a call id exactly like a known one,
   or the endpoint becomes a way to test numbers against the candidate list.
2. **The caller says their name; the server compares.** The agent is never
   told the name to read out. *"Am I speaking to Aarti Sethi?"* hands a wrong
   number the answer and makes the confirmation worthless — the question has
   to be *"who am I speaking to?"*.
3. **Every part of the name must match.** A first name alone is refused; it is
   a guess anybody could make, and the agent can ask for the surname. One
   character per word is forgiven, because this string came out of speech
   recognition and "Sethi" arrives as "Sethy" often enough to matter.
4. **Three tries and the call is dead**, counted on the row so redialling does
   not buy three more. Sessions expire after 20 minutes regardless.
5. **Wrong name, unknown number and finished candidate are one sentence.**
   Three reasons, one reply, or the set of them is an oracle.

**What a call is worth once open:** exactly what the link in db/056 is worth —
one person's rounds, the panel's names, and the ability to reply. Somebody
holding the candidate's phone who knows their name gets that. That is the same
exposure as somebody holding a forwarded link, which is why the money and the
scorecards are unreachable on both paths rather than on one. Reads go through
`withCandidateContext()` — db/056's fence, not a second one.

### On whose behalf

`hr.voice_calls.on_behalf_of` is NOT NULL and must be a real, active account
that is **itself** permitted to contact candidates: an agent cannot do, for
somebody, a thing that person could not do signed in. The opening line names
them, and it is returned by the API rather than left to the agent's prompt, so
changing the disclosure is a code change with a reviewer.

The trail carries both: `via = 'voice_agent'` and `on_behalf_of = <staff>`,
with `user_id` NULL because a member of staff did not say it — the candidate
did. Same shape as the workflow engine's delegation, where
`COALESCE(delegated_to_user_id, assignee_user_id)` keeps both names.

**Scheduling is work; a scorecard is not.** Anybody may arrange a round for
anybody, so "on behalf of" is right there. A scorecard is an opinion, and
db/049 keys it to the account that was signed in — nothing in this channel
touches that, and nothing should.

### What it cannot do

There is no endpoint that **moves** a round, and that is design rather than
omission. The candidate asks; HR reschedules. An agent that could rewrite four
people's afternoons on the strength of a call authenticated by a spoken name
would be a bad idea wearing a good one. A unit test greps the service for
`UPDATE hr.interviews` so that adding one has to be argued for.

### Configuration

`VOICE_AGENT_API_KEY` (≥32 chars, from a CSPRNG), presented as `x-agent-key`
or a bearer token, compared in constant time. **Unset means the channel is
off, not open** — every endpoint refuses. That is the safe default for a
deployment with no agent, and it is the failure mode a truthy check would get
backwards.
