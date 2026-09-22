-- =====================================================================
-- 056 — THE CANDIDATE'S OWN PAGE (S11 · People · Brief §32, §36)
--
--   db/049 put hiring in one place for the people who do the hiring. It left
--   the candidate outside it entirely, and said so: "No candidate-facing
--   portal." What that meant in practice is that the one person the whole
--   module is about found out when their interview was from a WhatsApp
--   message, and told us they could not make it by replying to it.
--
--   This gives them a page. A link they open without an account:
--     · the rounds that are booked, when, where, and who they will meet
--     · a button that says yes I will be there
--     · a button that says I cannot, here is why
--     · somewhere to put their CV, once, instead of attaching it to a reply
--
--   WHAT A CANDIDATE MUST NEVER SEE, AND HOW THAT IS KEPT.
--
--   A link with no login on the end of it is the most exposed surface this
--   portal has. Everything below is written on the assumption that the token
--   will leak — forwarded, logged by a proxy, pasted into a group.
--
--   Rows: a third fence. db/049 has two — `hr.may_see_hiring()` for HR and the
--   panel list for an interviewer. This adds `hr.acting_candidate()`, set from
--   `app.candidate_id` by `withCandidateContext()`, and opens ONLY that
--   candidate's own row and their own rounds. The policies db/049 already
--   wrote keep the rest shut without another line here: scorecards open to HR
--   or their own author, and the activity trail to HR. A candidate is neither,
--   so a candidate reading `hr.scorecards` gets nothing — from Postgres, not
--   from a code path somebody can forget.
--
--   Columns: RLS decides rows, not columns, and the candidate's own row is the
--   one carrying what they earn now and what they are asking for. This is the
--   same gap db/049 names for panel members and it is closed the same way —
--   in the service, which never selects the money on the candidate path. If
--   you add a read here, that is the thing to get right.
--
--   THE TOKEN IS NOT STORED. Only its SHA-256, the way db/041 holds sign-in
--   codes. A dump of this table cannot be used to open anybody's page. It also
--   means a lost link is reissued, never looked up.
--
--   IT STOPS MATTERING ON ITS OWN. Every invite has an expiry, and a candidate
--   who is rejected, withdrawn or hired has their link refused by the service
--   whatever the expiry says — a standing secret for somebody the company has
--   finished with is a secret with no owner.
--
--   NOTHING DELETES, STILL. A candidate who asks to move a slot leaves a row
--   saying so. HR moves the round; the asking stays on the record, because
--   "they rescheduled twice" is the kind of thing that gets said later and
--   should be checkable rather than remembered.
--
--   Additive + idempotent.
--   ROLLBACK: DROP TABLE hr.candidate_documents, hr.interview_responses,
--                        hr.candidate_invites;
--             DROP FUNCTION hr.acting_candidate();
--             DROP POLICY candidates_self ON hr.candidates;
--             DROP POLICY interviews_self ON hr.interviews;
-- =====================================================================

-- ── who is holding the link ────────────────────────────────────────────
-- Empty for every signed-in path in the portal: `withUserContext()` never
-- sets it, so none of the policies below can open for a member of staff by
-- accident. It is set by `withCandidateContext()` and nothing else.
CREATE OR REPLACE FUNCTION hr.acting_candidate() RETURNS UUID AS $who$
  SELECT NULLIF(current_setting('app.candidate_id', TRUE), '')::UUID;
$who$ LANGUAGE SQL STABLE;

-- ── the link itself ────────────────────────────────────────────────────
-- One live invite per candidate. Reissuing revokes the last one rather than
-- adding a second: two working links for one person is two things to withdraw
-- and one of them gets forgotten.
CREATE TABLE IF NOT EXISTS hr.candidate_invites (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id  UUID NOT NULL REFERENCES hr.candidates(id) ON DELETE CASCADE,
  -- SHA-256 of the token. The token itself is shown to HR once, at the moment
  -- it is made, and is not recoverable from this row afterwards.
  token_hash    CHAR(64) NOT NULL UNIQUE,
  sent_to       VARCHAR(255),         -- the address it was mailed to, for the trail
  issued_by     UUID REFERENCES public.users(id),
  issued_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ,
  revoked_by    UUID REFERENCES public.users(id),
  -- Proof the candidate actually opened it. HR chasing somebody who never got
  -- the mail is a different conversation from chasing somebody ignoring it.
  last_seen_at  TIMESTAMPTZ,
  seen_count    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS hr_candidate_invites_candidate_idx
  ON hr.candidate_invites (candidate_id, issued_at DESC);

-- At most one live invite per candidate, in the database rather than in the
-- service that is meant to revoke the old one first.
CREATE UNIQUE INDEX IF NOT EXISTS hr_candidate_invites_one_live
  ON hr.candidate_invites (candidate_id) WHERE revoked_at IS NULL;

-- ── what the candidate said back ───────────────────────────────────────
-- Append-only, one row per thing they said. Not a column on hr.interviews:
-- a confirmation that was later replaced by "actually I cannot" is two facts,
-- and the first one is why the room was booked.
CREATE TABLE IF NOT EXISTS hr.interview_responses (
  id            BIGSERIAL PRIMARY KEY,
  interview_id  UUID NOT NULL REFERENCES hr.interviews(id) ON DELETE CASCADE,
  response      VARCHAR(20) NOT NULL
                  CHECK (response IN ('confirmed', 'reschedule_requested')),
  -- Their words. Required for a reschedule by the service — "cannot make it"
  -- with no reason is the message that costs two more emails to resolve.
  note          TEXT,
  at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hr_interview_responses_idx
  ON hr.interview_responses (interview_id, at DESC);

-- ── what they sent us ──────────────────────────────────────────────────
-- BYTEA, the way ee.concept_deck_images holds a picture. db/049 pointed
-- `resume_url` at S3 or Drive and neither is configured; a candidate cannot
-- upload to a bucket that does not exist. The file is small, it is read about
-- four times in its life, and keeping it here means it is covered by the same
-- backup and the same fence as the row it belongs to.
CREATE TABLE IF NOT EXISTS hr.candidate_documents (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id  UUID NOT NULL REFERENCES hr.candidates(id) ON DELETE CASCADE,
  kind          VARCHAR(20) NOT NULL DEFAULT 'resume'
                  CHECK (kind IN ('resume', 'portfolio', 'other')),
  filename      VARCHAR(255) NOT NULL,
  mime          VARCHAR(100) NOT NULL,
  bytes         BYTEA NOT NULL,
  size_bytes    INTEGER NOT NULL CHECK (size_bytes > 0),
  -- 'candidate' when they put it there themselves, 'hr' when it was forwarded
  -- on. Worth knowing which CV the person actually stands behind.
  uploaded_by   VARCHAR(20) NOT NULL DEFAULT 'candidate'
                  CHECK (uploaded_by IN ('candidate', 'hr')),
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hr_candidate_documents_idx
  ON hr.candidate_documents (candidate_id, uploaded_at DESC);

-- ── the third fence ────────────────────────────────────────────────────
ALTER TABLE hr.candidate_invites    ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr.interview_responses  ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr.candidate_documents  ENABLE ROW LEVEL SECURITY;

DO $policies$
BEGIN
  -- The candidate's own row, and nothing beside it. `hr.acting_candidate()` is
  -- NULL on every signed-in path, and `id = NULL` is never true, so this
  -- policy is dead weight for staff and the only open door for a candidate.
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='hr' AND tablename='candidates'
                    AND policyname='candidates_self') THEN
    CREATE POLICY candidates_self ON hr.candidates
      USING (id = hr.acting_candidate());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='hr' AND tablename='interviews'
                    AND policyname='interviews_self') THEN
    CREATE POLICY interviews_self ON hr.interviews
      USING (candidate_id = hr.acting_candidate());
  END IF;

  -- An invite is HR's to make and the holder's to spend. The candidate path
  -- needs to stamp last_seen_at on its own row; it has no business reading
  -- anybody else's, and the token hash it could read is its own token.
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='hr' AND tablename='candidate_invites'
                    AND policyname='candidate_invites_hr_or_self') THEN
    CREATE POLICY candidate_invites_hr_or_self ON hr.candidate_invites
      USING (hr.may_see_hiring() OR candidate_id = hr.acting_candidate());
  END IF;

  -- A reply belongs to the round it answers, so it opens for exactly the
  -- people that round opens for: HR, the panel sitting in it, and the
  -- candidate whose round it is.
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='hr' AND tablename='interview_responses'
                    AND policyname='interview_responses_follow_round') THEN
    CREATE POLICY interview_responses_follow_round ON hr.interview_responses
      USING (EXISTS (
        SELECT 1 FROM hr.interviews i
         WHERE i.id = interview_responses.interview_id
           AND (hr.may_see_hiring()
                OR i.candidate_id = hr.acting_candidate()
                OR EXISTS (SELECT 1 FROM hr.interview_panel p
                            WHERE p.interview_id = i.id
                              AND p.user_id = hr.acting_user()))
      ));
  END IF;

  -- A CV is HR's to read, the candidate's to replace, and the panel's to see
  -- before they walk into the room — an interviewer who has not read the CV is
  -- the interviewer who asks what the candidate has already written down.
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='hr' AND tablename='candidate_documents'
                    AND policyname='candidate_documents_hr_panel_or_self') THEN
    CREATE POLICY candidate_documents_hr_panel_or_self ON hr.candidate_documents
      USING (hr.may_see_hiring()
             OR candidate_id = hr.acting_candidate()
             OR EXISTS (
                  SELECT 1 FROM hr.interviews i
                    JOIN hr.interview_panel p ON p.interview_id = i.id
                   WHERE i.candidate_id = candidate_documents.candidate_id
                     AND p.user_id = hr.acting_user()
                ));
  END IF;
END $policies$;

-- ── the app role ───────────────────────────────────────────────────────
-- db/042 forgetting its grants is why db/044 exists. The rights here are the
-- ones the code uses and no more.
GRANT SELECT, INSERT, UPDATE ON hr.candidate_invites   TO essentia_app;
-- Append and read. A reply that can be edited afterwards is not a reply.
GRANT SELECT, INSERT ON hr.interview_responses         TO essentia_app;
GRANT USAGE, SELECT ON SEQUENCE hr.interview_responses_id_seq TO essentia_app;
-- Replaceable: a candidate who sent the wrong file should not have to ask.
GRANT SELECT, INSERT, DELETE ON hr.candidate_documents TO essentia_app;

-- ── the door in the portal ─────────────────────────────────────────────
-- Issuing a link is not the same right as reading the board. It puts candidate
-- data on the far side of an address HR typed, so it belongs to the people who
-- already own the candidate — HR and the founders — and to nobody else. The
-- `hiring` resource and its L2/L3 refusals come from db/049; this adds one
-- action to them.
-- The action has to exist before a permission can point at it — db/049 learnt
-- the same lesson about resource_types, and permissions carries a foreign key
-- to both. `invite` is new: none of the twelve in db/004 means "put this in
-- front of somebody who does not work here", and stretching `create` or
-- `assign` to cover it would hide the one action on this resource that reaches
-- outside the company.
INSERT INTO public.permission_actions (code, name, description, sort_order) VALUES
  ('invite', 'Invite', 'Give somebody outside the company a link into one page of the portal', 13)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.permissions (access_level, resource_type, action_code, allowed, scope, notes)
SELECT v.lvl::access_level, 'hiring', 'invite', v.ok, v.scope, v.note
FROM (VALUES
  ('L0', TRUE,  'all',      'Founders may send a candidate their link'),
  ('L1', TRUE,  'all',      NULL),
  ('L2', FALSE, 'own_dept', 'SECURITY RULE (§36): the HR department rows in db/049 grant this to HR; a TL outside HR never mails a candidate'),
  ('L3', FALSE, 'own_dept', 'SECURITY RULE (§36): candidate data is never open to the floor')
) AS v(lvl, ok, scope, note)
ON CONFLICT (access_level, department_id, resource_type, action_code) DO NOTHING;

-- HR's own people, by department — the same mechanism db/049 uses to let HR
-- run hiring from L2 and L3. A department row beats the level's global row.
INSERT INTO public.permissions (access_level, department_id, resource_type, action_code, allowed, scope, notes)
SELECT lvl::access_level, d.id, 'hiring', 'invite', TRUE, 'all',
       'HR sends the candidate their own page'
  FROM public.departments d
  CROSS JOIN (VALUES ('L2'), ('L3')) AS v(lvl)
 WHERE d.code = 'HR'
ON CONFLICT (access_level, department_id, resource_type, action_code) DO NOTHING;

-- Two things must hold, or the link is either useless or handed to the floor.
DO $guards$
DECLARE
  opened INTEGER;
  fenced INTEGER;
BEGIN
  SELECT count(*) INTO opened
    FROM public.permissions
   WHERE resource_type = 'hiring' AND action_code = 'invite'
     AND allowed = TRUE AND department_id IS NULL
     AND access_level IN ('L2', 'L3');
  IF opened > 0 THEN
    RAISE EXCEPTION 'mailing a candidate must not be open to L2/L3 globally — % such rows', opened;
  END IF;

  -- The candidate's door only exists if both halves are there. A policy
  -- without the function silently opens nothing; the function without the
  -- policies is a page that renders an empty interview for everybody.
  SELECT count(*) INTO fenced
    FROM pg_policies
   WHERE schemaname = 'hr'
     AND policyname IN ('candidates_self', 'interviews_self');
  IF fenced <> 2 THEN
    RAISE EXCEPTION 'the candidate fence needs both policies; found %', fenced;
  END IF;
END $guards$;
