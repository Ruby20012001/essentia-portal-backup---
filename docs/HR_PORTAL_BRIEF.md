# essentia HR portal — build brief

Paste this whole file as a prompt. It describes the hiring and interview
portal end to end: what it holds, who may see what, and the rules that are the
point of it.

---

## What this is

An internal hiring portal for **essentia**, a luxury interior design company in
Gurugram, India. It replaces hiring that lived in a WhatsApp group and an
inbox.

The cost of that was not admin. It was that a candidate got asked the same
question by four people, and the one thing nobody asked turned out to be the
thing that mattered — and that a decision made in March could not be
reconstructed in September.

Three audiences, and they must not see the same things:

| Who | Sees |
|---|---|
| **HR** | Everything — the board, every candidate, salary, every scorecard |
| **An interviewer on a panel** | Only the round they are sitting in, and the person they are about to meet. Never the board, never the salary |
| **The candidate** | Only their own interview times. Never a verdict, never another candidate, never any money |

---

## Data model

- **open_roles** — title, department, headcount, location, employment type
  (full time / contract / intern), status (open / on hold / filled / closed),
  hiring lead.
- **candidates** — name, email, phone, source, current CTC, expected CTC,
  notice period, stage, status (active / offered / hired / rejected /
  withdrawn), outcome note.
- **interview_stages** — **rows in a table, never an enum and never hardcoded.**
  Ordered by a sequence number, with a flag for the final one. Inserting a
  round between two others must be an INSERT, not a deploy. Seed: Applied → HR
  conversation → Department round → HOD round → Founder round → Offer.
- **interviews** — candidate, stage, scheduled time, duration, mode (in person
  / video / phone), location, status (scheduled / done / cancelled / no show).
- **interview_panel** — who is sitting in, and who leads. A list, not a column,
  because "who still owes feedback" is only answerable if it is a list.
- **question_sets** and **questions** — a set belongs to a stage, or a role, or
  both, or neither.
- **scorecards** — one per interviewer per round, with a rating per question,
  strengths, concerns, and a yes/no recommendation.
- **candidate_activity** — append-only trail. Who moved somebody, when, and
  what it was called.
- **candidate_invites** — the private link (see below).
- **interview_responses** — what the candidate said back.
- **candidate_documents** — their CV, bytes and all.

Keep candidate data in its **own database schema**, separate from employee
data. Candidate data is not employee data and must not be reachable from a
join written for employee data.

---

## The rules. These are the product, not decoration.

1. **Nothing deletes.** A candidate is rejected or withdrawn, never removed —
   somebody who applied twice deserves to be met by somebody who knows it. A
   seat is closed, not dropped. The activity trail has no update or delete
   path anywhere in the code, and the database grant does not offer one.

2. **You cannot move somebody on while an interviewer owes a write-up.**
   Refuse it, and count them in the refusal: *"3 interviewers have not written
   up a round that has already happened."* The alternative is deciding without
   the person who was actually in the room.

3. **A rejection needs a reason in words.** A "no" with nothing written is the
   row that gets the same person called again next year and asked the same
   questions. Hiring and offering need no note; stopping somebody does.

4. **One interviewer, one scorecard, and they write it themselves.** Enforce it
   with a unique constraint, not a code path somebody can forget. A submitted
   scorecard has no edit path anywhere. What a scorecard is worth is that it
   was written *before* its author heard what everybody else thought.

5. **A submitted scorecard must say yes or no.** Enforce in the service and
   again as a database constraint. Ratings with no recommendation are the
   shape of feedback that decides nothing.

6. **A round needs somebody in it.** An empty panel is refused: nobody writes
   feedback on a conversation they were not part of.

7. **Question sets are chosen, not remembered.** Scheduling a round with no set
   named picks the most specific active one — written for this role at this
   stage, then the stage's own, then a general set. Two candidates at the same
   stage get the same questions without anybody having to think about it.

8. **Salary is HR's alone.** Current and expected CTC never reach an
   interviewer's screen or the candidate's own page. See below — this one is
   not a UI decision.

9. **Every decision is audited**, with what the status was before.

---

## Security: three fences, and why row-level security is not enough

Enforce access **twice** — the service refuses, and the database refuses
independently through row-level security. A query written later by somebody
who forgot the service must return nothing rather than a CV.

**Fence 1 — HR.** The board opens for the founders, and for anybody whose
department is HR. Not by seniority level alone: HR runs hiring from a
mid-level role, and a senior person outside HR is a founder. Grant it by
department, and make the migration raise an exception if a global grant to
ordinary staff ever appears.

**Fence 2 — the panel.** A department head sitting on a round is not HR and
must never see the board, but they must reach the round they are in or they
cannot write the feedback the round exists to get. So the fence opens by the
panel list, one interview at a time. Somebody who is not HR lands on *their own
rounds*, not on the word "Restricted".

**Fence 3 — the candidate.** See the next section.

### The gap row-level security cannot close

**RLS decides rows, not columns.** A candidate's row carries what they earn now
and what they are asking for, and a panel member legitimately reaches that row.
Their own page legitimately reaches it too.

So keeping the money out is the **service's** job, and it must be explicit:
every read path names its columns, and any function returning a candidate takes
an explicit `withMoney` argument so each caller has to answer the question out
loud. Never `SELECT *` on that table.

Write a test asserting that no query on the panel path or the candidate path
mentions either salary column.

---

## The candidate's own page

A link the candidate opens with **no account**: `/interview/<token>`, outside
the portal shell — no navigation into the rest of the company, nothing
implying there is more to reach.

It shows: which role, when each round is, how long, where, and who they will
meet **by display name only**. Two buttons — "I will be there" and "I cannot
make this time" (which asks why) — and a CV upload.

It shows **nothing else**. No verdict, no score, no stage count, no "you are 3
of 7 candidates", no progress bar through a pipeline they are not party to. A
candidate reading that their next round is with the HOD is reading their own
diary. A candidate reading how many people are ahead of them is reading ours.

### Write all of it as though the token has already leaked

A link with no login gets forwarded, logged by a proxy, and pasted into group
chats. The question is not "is the holder the candidate" — you cannot know —
but "what is the worst a stranger holding this can do". The answer must stay:
read one person's interview times, and reply to them.

- **The token is never stored**, only its SHA-256. It is shown to HR once, at
  the moment it is made. A lost link is reissued, never looked up.
- **One live link per person**, enforced by a unique index. Reissuing revokes
  the last one in the same transaction. Two live links is two things to
  withdraw and one of them gets forgotten.
- **It expires**, and a rejected, withdrawn or hired candidate's link stops
  working whatever the expiry says. A standing secret belonging to somebody the
  company has finished with is a secret with no owner.
- **Every failure says the same thing.** Expired, withdrawn, mistyped, or
  belonging to somebody finished with — indistinguishable from outside, or the
  page becomes a way to work out which links once existed.
- **The candidate can ask to move a round. They cannot move it.** HR
  reschedules. A page that let the person being interviewed rewrite four
  people's afternoons would be a different and much worse page.
- **A reschedule needs a reason.** "Cannot make it" with nothing after it costs
  two more emails to resolve.
- **Rate limit it.** Key on the caller's address, not the token.
- **`noindex`.** A page reachable without a login is a page a crawler reaches
  if the link ever appears anywhere public, and this one has a person's name
  and interview times on it.

### CVs

Store the bytes in the database beside the row they belong to. PDF and Word
only, 5 MB. Take the MIME type from the upload and check it against a short
list; strip any path out of the filename before storing it.

Serve them back to staff **always as an attachment, never inline**, with
`X-Content-Type-Options: nosniff`. Those bytes came from outside the company
through a page with no login on it. A candidate's file opens for HR and for
whoever is on one of their panels — an interviewer who has not read the CV is
the interviewer who asks what the candidate already wrote down.

---

## Reaching candidates

HR must not have to copy a link and paste it into WhatsApp by hand, once per
person. That friction ends with half the candidates never being sent anything.

**WhatsApp** — use a `wa.me` link: `https://wa.me/<number>?text=<encoded>`. No
API, no Meta approval, no per-message cost. It opens WhatsApp on HR's own
machine with the number and the message already written, and **HR presses
send**.

Be honest about that. Label the button **"Open WhatsApp"**, never "Send".
Record it in the trail as **"prepared"**, not "sent" — the portal cannot know
whether they pressed send, and claiming otherwise is a claim it cannot check.

**Email** — sent by the server. Because the server does it, the token never
appears on HR's screen at all, which is the real improvement over copy-paste,
not just the speed. If mail is not configured, say so on the page **before**
anything is pressed, and leave WhatsApp working.

### Phone number normalisation — the dangerous part

A mangled number sends a stranger somebody's private interview link, and nobody
finds out. Refuse rather than guess:

| Input | Result |
|---|---|
| 10 digits starting 6–9 | Indian mobile, prefix `91` |
| 10 digits starting 0–5 | **refuse** — landline or typo |
| 11 digits starting 0 | strip the trunk zero, then as above |
| 12 digits starting 91 | already correct |
| 11–15 digits not starting 0 | already international |
| anything else | **refuse** |

A country code never starts with 0, so a long string that does is a landline
with an extension run together. Test every line, **especially the refusals** —
`"0124 4567890 ext 2211"` naively becomes 15 digits and sneaks through.

### What the message may contain

Company name, sender's name, role title, the link, and a line asking them not
to forward it. Address them by **first name only**.

It must **not** contain the interview time, the location, the panel's names, or
any salary figure. A WhatsApp message gets forwarded and screenshotted; the
page behind the token is the thing with a fence around it, and putting its
contents in the message walks them out past the fence. Write a test for this.

### The "Reach them" screen

Everybody still moving, with the two columns that matter: **has a live link?**
and **have they opened it?** Somebody with no link has never been sent
anything; somebody who has one and never opened it is the one to chase.
Chasing somebody who replied last week is what this screen exists to stop.

Bulk email with checkboxes, capped at 20 — not a technical limit, a pause,
because twenty emails in one press is already a lot to have got wrong. **Bulk
is email only**: WhatsApp opens a window per person, which the browser blocks
after the first.

One failure must not stop the rest, and **report failures by name**. "3 failed"
sends HR hunting through twenty files to find which three.

---

## Voice — free, and with no model in it

On the candidate's own page, let them answer by speaking. Use the browser's
built-in `SpeechRecognition` and `SpeechSynthesis`. No provider, no API key, no
per-minute cost.

**Do not put a language model in this, and understand why.** The page was
opened with a token, so it already knows who the person is — there is no
identification to do. And the question has exactly two answers. A model would
add a bill, a dependency and a way to be talked into something, and would
answer nothing that is being asked.

Understand yes and no in English and Hindi, romanised and in Devanagari. Check
for **no before yes** — "no, but yes to Thursday" has confirmed nothing. Match
**whole words only**, or "November" reads as a refusal.

**Never send what it only thinks it heard.** Recognition is wrong often enough
that "I can do Tuesday" arrives as "I can't do Tuesday". Put the transcript on
screen in an editable box and wait for the person to press send. Voice fills
the form; the person submits it.

**Never make it the only way.** Render it only where the browser supports it.
The ordinary buttons stay exactly as they are.

Say plainly, before the microphone is requested, that the browser sends the
audio to its own speech service. It is their voice and their choice.

---

## Times

This is the one place where rendering a timestamp in UTC is not untidy but
wrong: 11:30 in Gurugram shows as 06:00 and somebody misses an interview.

Format in `Asia/Kolkata`, **named explicitly** rather than taken from the
machine, so the server and the browser produce the same string and hydration
does not tear. Test it with the machine clock set to three different zones.

---

## Look

- Wordmark is lowercase **essentia**. Understated, expensive, quiet. Not
  techy, no gradients, no emoji, no stock photography.
- **Lato only**, three weights: Light 300, Regular 400, Bold 700.
- Dark by default: near-black canvas, white text, flat surfaces, hairline 1px
  borders, generous whitespace. A light theme must work too, and must be warm
  stone — **never white**.
- Colour only through semantic tokens (canvas / card / surface / line / muted /
  success / warning / error). **No hex value in markup.**
- Works properly at phone width.

### Words on screen

Plain English, no exclamation marks, no "Oops!". When the system refuses
something it explains why in one human sentence, and the sentence is more use
than any wording invented at the UI layer — surface the service's refusal
verbatim.

Every list that can be empty needs a sentence saying what to do next: *"No
seats are open. Open one to start hiring for it."* — not "No data found", not a
blank panel.

---

## Do not build

- No AI screening, no candidate scoring, no automatic ranking or rejection.
- No delete buttons, anywhere.
- No salary on any screen an interviewer or candidate can reach.
- No endpoint that lets a candidate move their own interview.
- Nothing that shows a candidate another candidate, in any form.
- No demo or seed data left where real HR will see it. If you seed for
  development, make it impossible for that seed to reach a real database, and
  say in the file how that is enforced.
