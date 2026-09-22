-- =====================================================================
-- 057 — THE VOICE AGENT (S11 · People · Brief §32, §36)
--
--   db/056 gave the candidate a page. This gives them a phone call: an agent
--   rings to confirm a round, or takes the call when they ring back, and
--   writes down what they said.
--
--   THE HARD PART IS NOT THE CALL, IT IS WHO IS ON IT.
--
--   db/056 had a token: 32 random bytes, and holding it was the proof. A
--   phone call has nothing of the sort. Caller ID is spoofable, numbers get
--   reassigned, and phones are shared. So this file does not pretend a phone
--   number is an identity. It treats a call as a short, narrow, heavily
--   rate-limited session that has to be EARNED before it discloses anything.
--
--     1. A call starts from a number and knows nothing. `candidate_id` is
--        NULL and stays NULL.
--     2. The caller says their own name. The agent sends it; the server
--        compares. The agent is never told the name first — otherwise "is
--        that Aarti?" hands a wrong number the answer, and the confirmation
--        confirms nothing.
--     3. Three tries, then the call is burnt and a new one must be started.
--     4. Only then does `candidate_id` get filled, and only then does
--        anything come back.
--
--   WHAT IT IS WORTH, HONESTLY. Once identified, a call reaches exactly what
--   the link in db/056 reaches: one person's interview times, the panel's
--   names, and the ability to reply. Somebody holding the candidate's phone
--   who knows their name gets that. That is the same exposure as somebody
--   holding a forwarded link, and it is the reason the money and the
--   scorecards are unreachable on BOTH paths rather than only on one.
--
--   A session dies after 20 minutes whatever happens. A call that is still
--   open an hour later is not a call.
--
--   ON WHOSE BEHALF. The agent is not a person and never pretends to be one.
--   Every call names the member of staff it is acting for, and that name
--   appears in the trail beside the agent's — the same shape the workflow
--   engine already uses for delegation, where `COALESCE(delegated_to_user_id,
--   assignee_user_id)` keeps both. Scheduling is work and anybody may do it
--   for anybody. A SCORECARD IS NOT: db/049 keys it to the account that was
--   signed in, and nothing here touches that.
--
--   Additive + idempotent.
--   ROLLBACK: DROP TABLE hr.voice_calls;
--             ALTER TABLE hr.candidate_activity DROP COLUMN via,
--                                               DROP COLUMN on_behalf_of;
-- =====================================================================

-- ── how a line in the trail got there ──────────────────────────────────
-- db/049's trail answers "who and when". A voice agent makes that two
-- questions: which member of staff it was for, and the fact that a machine
-- placed the call. Both go on the row rather than into the prose of `detail`,
-- so they can be filtered rather than grepped.
ALTER TABLE hr.candidate_activity
  ADD COLUMN IF NOT EXISTS via VARCHAR(20) NOT NULL DEFAULT 'portal'
    CHECK (via IN ('portal', 'candidate_page', 'voice_agent'));

ALTER TABLE hr.candidate_activity
  ADD COLUMN IF NOT EXISTS on_behalf_of UUID REFERENCES public.users(id);

COMMENT ON COLUMN hr.candidate_activity.on_behalf_of IS
  'The member of staff a machine acted for. NULL when a person did it themselves.';

-- ── the call ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr.voice_calls (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- The number, as dialled or as it arrived. Kept for the trail and for
  -- rate-limiting a number that is being worked through a list.
  phone          VARCHAR(30) NOT NULL,
  direction      VARCHAR(10) NOT NULL DEFAULT 'outbound'
                   CHECK (direction IN ('outbound', 'inbound')),
  -- NULL until the caller has said their own name and it matched. Nothing is
  -- disclosed while this is NULL — that is the whole fence.
  candidate_id   UUID REFERENCES hr.candidates(id),
  -- The member of staff this call is being made for. Required: a call with
  -- nobody's name on it is a call nobody can be asked about afterwards.
  on_behalf_of   UUID NOT NULL REFERENCES public.users(id),
  status         VARCHAR(20) NOT NULL DEFAULT 'identifying'
                   CHECK (status IN ('identifying', 'open', 'failed', 'closed')),
  -- Three wrong names and the call is over. Counted here rather than in
  -- memory so that hanging up and redialling does not reset it — the number
  -- is what is being limited, not the socket.
  attempts       INTEGER NOT NULL DEFAULT 0,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  identified_at  TIMESTAMPTZ,
  closed_at      TIMESTAMPTZ,
  expires_at     TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '20 minutes'
);

CREATE INDEX IF NOT EXISTS hr_voice_calls_phone_idx
  ON hr.voice_calls (phone, started_at DESC);
CREATE INDEX IF NOT EXISTS hr_voice_calls_open_idx
  ON hr.voice_calls (status, expires_at);

-- Looking a candidate up by the number they rang from. Digits only, because
-- '+91 98100 11122' and '9810011122' are the same phone and only one of them
-- is what the switch will hand us.
CREATE INDEX IF NOT EXISTS hr_candidates_phone_digits_idx
  ON hr.candidates (regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'));

-- ── the fence ──────────────────────────────────────────────────────────
-- A call is HR's to read. The agent itself does not reach Postgres under a
-- candidate context at all: it authenticates as a machine, and the service
-- resolves a call into a candidate id and then uses db/056's
-- `withCandidateContext()` — so everything the agent can see is fenced by
-- exactly the policies the web page is fenced by, and there is one fence to
-- get right rather than two.
ALTER TABLE hr.voice_calls ENABLE ROW LEVEL SECURITY;

DO $policies$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='hr' AND tablename='voice_calls'
                    AND policyname='voice_calls_hr') THEN
    CREATE POLICY voice_calls_hr ON hr.voice_calls
      USING (hr.may_see_hiring());
  END IF;
END $policies$;

GRANT SELECT, INSERT, UPDATE ON hr.voice_calls TO essentia_app;

-- ── guards ─────────────────────────────────────────────────────────────
DO $guards$
DECLARE
  nullable INTEGER;
BEGIN
  -- A call must always name the person it is for. If this column ever becomes
  -- nullable, "who asked for this call" stops being answerable.
  SELECT count(*) INTO nullable
    FROM information_schema.columns
   WHERE table_schema = 'hr' AND table_name = 'voice_calls'
     AND column_name = 'on_behalf_of' AND is_nullable = 'YES';
  IF nullable > 0 THEN
    RAISE EXCEPTION 'a voice call must always name the member of staff it is for';
  END IF;
END $guards$;
