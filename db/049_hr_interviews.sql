-- =====================================================================
-- 049 — HIRING AND INTERVIEWS (S11 · People · Brief §32, §36)
--
--   Hiring at essentia has lived in a WhatsApp group and an inbox: a CV
--   forwarded to three people, three replies in three threads, and a decision
--   nobody can reconstruct a month later. The cost of that is not admin — it
--   is that the same candidate is asked the same question four times and the
--   one thing nobody asked is the thing that mattered.
--
--   This puts the whole of it in one place:
--     · a role that is open, and the candidates against it
--     · the rounds, when they are, and who is sitting in
--     · the questions each round asks — the same ones every time, so two
--       candidates can actually be compared
--     · what each interviewer thought, in their own words, written once
--
--   THREE RULES THIS FILE EXISTS TO KEEP.
--
--   Nothing deletes. A candidate is withdrawn or rejected, never removed — a
--   person who applied twice deserves to be met by somebody who knows it. The
--   activity trail has no update path anywhere in the code.
--
--   The stages are rows. Whoever decides that a Client Advisor now meets the
--   Country Head before the founder changes a row, not a deploy. This is the
--   house rule (structure is data, not code), and hiring changes more often
--   than most things do.
--
--   One interviewer writes one scorecard per round, and writes it themselves.
--   UNIQUE (interview_id, user_id) is that rule in the database rather than in
--   a code path somebody can forget. Nobody submits feedback on behalf of
--   somebody else: the name against it is the account that was signed in.
--
--   WHY A SCHEMA OF ITS OWN. Candidate data is not employee data and must not
--   be reachable from a join written for employee data. `hr` sits beside
--   ee/eh/factory/proc as the domain it is, carries its own grants, and can be
--   dropped whole.
--
--   Additive + idempotent.
--   ROLLBACK: DROP SCHEMA hr CASCADE;
--             DELETE FROM public.permissions WHERE resource_type = 'hiring';
--             DELETE FROM portal.event_routes WHERE event_type LIKE 'hiring.%';
--             DELETE FROM portal.notification_templates WHERE code LIKE 'hiring_%';
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS hr;

-- ── the stages a candidate moves through ───────────────────────────────
-- Rows, not an enum: an enum needs a migration to add a value, and this list
-- is going to change. `seq` orders the board; `is_final` marks the stage after
-- which there is nothing left to schedule.
CREATE TABLE IF NOT EXISTS hr.interview_stages (
  code        VARCHAR(30) PRIMARY KEY,
  label       VARCHAR(80) NOT NULL,
  seq         INTEGER NOT NULL,
  is_final    BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT
);

INSERT INTO hr.interview_stages (code, label, seq, is_final, description) VALUES
  ('applied',    'Applied',          10, FALSE,
   'On record, not yet spoken to. Every candidate starts here.'),
  ('hr_screen',  'HR conversation',  20, FALSE,
   'The first call — is this person right for essentia at all.'),
  ('department', 'Department round', 30, FALSE,
   'The team they would actually sit in. Craft, not culture.'),
  ('hod',        'HOD round',        40, FALSE,
   'The head of the department they would report into.'),
  ('founder',    'Founder round',    50, FALSE,
   'For the seats that need it, not every seat.'),
  ('offer',      'Offer',            60, TRUE,
   'Numbers and a start date. Nothing is scheduled after this.')
ON CONFLICT (code) DO NOTHING;

-- ── the role being hired for ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr.open_roles (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title          VARCHAR(200) NOT NULL,
  department_id  UUID REFERENCES public.departments(id),
  headcount      INTEGER NOT NULL DEFAULT 1 CHECK (headcount > 0),
  location       VARCHAR(120),
  employment     VARCHAR(20) NOT NULL DEFAULT 'full_time'
                   CHECK (employment IN ('full_time', 'contract', 'intern')),
  status         VARCHAR(20) NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open', 'on_hold', 'filled', 'closed')),
  hiring_lead    UUID REFERENCES public.users(id),  -- the HOD who owns the seat
  notes          TEXT,
  opened_by      UUID REFERENCES public.users(id),
  opened_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hr_open_roles_status_idx
  ON hr.open_roles (status, opened_at DESC);

-- ── the candidate ──────────────────────────────────────────────────────
-- `stage` is where they are now; `status` is whether they are still moving.
-- Keeping the two apart is what lets the board say "rejected after the HOD
-- round" rather than losing that to one column that says only 'rejected'.
CREATE TABLE IF NOT EXISTS hr.candidates (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role_id        UUID NOT NULL REFERENCES hr.open_roles(id),
  full_name      VARCHAR(200) NOT NULL,
  email          VARCHAR(255),
  phone          VARCHAR(30),
  source         VARCHAR(60),          -- 'referral' · 'naukri' · 'walk-in' · …
  referred_by    UUID REFERENCES public.users(id),
  current_ctc    NUMERIC(12, 2),
  expected_ctc   NUMERIC(12, 2),
  notice_days    INTEGER,
  resume_url     TEXT,                 -- S3 / Drive; the file itself is not here
  stage          VARCHAR(30) NOT NULL DEFAULT 'applied'
                   REFERENCES hr.interview_stages(code),
  status         VARCHAR(20) NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'offered', 'hired',
                                     'rejected', 'withdrawn')),
  outcome_note   TEXT,                 -- why, in words, when they stop moving
  added_by       UUID REFERENCES public.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hr_candidates_role_idx
  ON hr.candidates (role_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS hr_candidates_stage_idx
  ON hr.candidates (stage, status);

-- ── the questions a round asks ─────────────────────────────────────────
-- A set belongs to a stage, or a role, or both, or neither. Neither means a
-- set anybody may reach for; both means the one written for that round of that
-- role. The lookup prefers the most specific.
CREATE TABLE IF NOT EXISTS hr.question_sets (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name           VARCHAR(160) NOT NULL,
  stage_code     VARCHAR(30) REFERENCES hr.interview_stages(code),
  role_id        UUID REFERENCES hr.open_roles(id),
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_by     UUID REFERENCES public.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hr_question_sets_lookup_idx
  ON hr.question_sets (is_active, stage_code, role_id);

CREATE TABLE IF NOT EXISTS hr.questions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  set_id         UUID NOT NULL REFERENCES hr.question_sets(id) ON DELETE CASCADE,
  seq            INTEGER NOT NULL,
  prompt         TEXT NOT NULL,
  guidance       TEXT,                 -- what a good answer sounds like
  UNIQUE (set_id, seq)
);

-- ── a scheduled round ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr.interviews (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id    UUID NOT NULL REFERENCES hr.candidates(id),
  stage_code      VARCHAR(30) NOT NULL REFERENCES hr.interview_stages(code),
  question_set_id UUID REFERENCES hr.question_sets(id),
  scheduled_at    TIMESTAMPTZ NOT NULL,
  duration_mins   INTEGER NOT NULL DEFAULT 45 CHECK (duration_mins > 0),
  mode            VARCHAR(20) NOT NULL DEFAULT 'in_person'
                    CHECK (mode IN ('in_person', 'video', 'phone')),
  location        VARCHAR(200),        -- a room, or a meeting link
  status          VARCHAR(20) NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled', 'done', 'cancelled', 'no_show')),
  scheduled_by    UUID REFERENCES public.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hr_interviews_candidate_idx
  ON hr.interviews (candidate_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS hr_interviews_upcoming_idx
  ON hr.interviews (status, scheduled_at);

-- Who is sitting in. A round is rarely one person, and "who still owes
-- feedback" is only answerable if the panel is a list rather than a column.
CREATE TABLE IF NOT EXISTS hr.interview_panel (
  interview_id   UUID NOT NULL REFERENCES hr.interviews(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES public.users(id),
  is_lead        BOOLEAN NOT NULL DEFAULT FALSE,
  added_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Excused from writing it up: on leave, left the company, never actually
  -- came in. Without this, one unsubmitted draft held a candidate still for
  -- ever — calling the round off is refused once anybody has written it up,
  -- and taking the person off the panel is refused once they have started.
  -- The reason is required and goes on the trail; nothing is deleted.
  excused_at     TIMESTAMPTZ,
  excused_by     UUID REFERENCES public.users(id),
  excused_reason TEXT,
  PRIMARY KEY (interview_id, user_id),
  CONSTRAINT hr_interview_panel_excuse_has_reason
    CHECK (excused_at IS NULL OR (excused_by IS NOT NULL AND excused_reason IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS hr_interview_panel_user_idx
  ON hr.interview_panel (user_id);

-- ── what the interviewer thought ───────────────────────────────────────
-- One per interviewer per round, enforced here rather than in code. A
-- scorecard is a draft until it is submitted; after that it is what the room
-- decided on, and the code has no path that edits a submitted one.
CREATE TABLE IF NOT EXISTS hr.scorecards (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  interview_id   UUID NOT NULL REFERENCES hr.interviews(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES public.users(id),
  recommendation VARCHAR(20)
                   CHECK (recommendation IN ('strong_yes', 'yes', 'no', 'strong_no')),
  strengths      TEXT,
  concerns       TEXT,
  submitted_at   TIMESTAMPTZ,          -- NULL while it is still a draft
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (interview_id, user_id),
  -- A submitted scorecard must say yes or no. Ratings with no recommendation
  -- are the shape of feedback that decides nothing, which is what this module
  -- exists to stop.
  CONSTRAINT hr_scorecards_submitted_has_call
    CHECK (submitted_at IS NULL OR recommendation IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS hr_scorecards_interview_idx
  ON hr.scorecards (interview_id);

CREATE TABLE IF NOT EXISTS hr.scorecard_answers (
  scorecard_id   UUID NOT NULL REFERENCES hr.scorecards(id) ON DELETE CASCADE,
  question_id    UUID NOT NULL REFERENCES hr.questions(id),
  rating         INTEGER CHECK (rating BETWEEN 1 AND 4),
  notes          TEXT,
  PRIMARY KEY (scorecard_id, question_id)
);

-- ── the trail ──────────────────────────────────────────────────────────
-- Append-only. Who moved a candidate, when, and what it was called. There is
-- no UPDATE or DELETE path for this table anywhere in the application, and the
-- grant below does not offer one.
CREATE TABLE IF NOT EXISTS hr.candidate_activity (
  id             BIGSERIAL PRIMARY KEY,
  candidate_id   UUID NOT NULL REFERENCES hr.candidates(id) ON DELETE CASCADE,
  user_id        UUID REFERENCES public.users(id),
  at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  what           VARCHAR(80) NOT NULL,
  detail         TEXT
);

CREATE INDEX IF NOT EXISTS hr_candidate_activity_idx
  ON hr.candidate_activity (candidate_id, at DESC);

-- ── the second fence ───────────────────────────────────────────────────
-- The service layer already refuses anybody without hr_access. This is the
-- database saying the same thing independently, so a query written later by
-- somebody who forgot the service returns nothing rather than a CV.
--
-- Reachable by L0/L1, and by anybody whose department is HR. Not by level
-- alone: an L1 outside HR is a founder and belongs here; an L2 inside HR runs
-- the hiring and belongs here more.
CREATE OR REPLACE FUNCTION hr.may_see_hiring() RETURNS BOOLEAN AS $fence$
  SELECT current_setting('app.user_access_level', TRUE) IN ('L0', 'L1')
      OR EXISTS (
           SELECT 1
             FROM public.users u
             JOIN public.departments d ON d.id = u.department_id
            WHERE u.id = NULLIF(current_setting('app.user_id', TRUE), '')::UUID
              AND d.code = 'HR'
         );
$fence$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION hr.acting_user() RETURNS UUID AS $who$
  SELECT NULLIF(current_setting('app.user_id', TRUE), '')::UUID;
$who$ LANGUAGE SQL STABLE;

-- Five tables, not nine. open_roles, interview_stages, interview_panel,
-- question_sets and questions carry no person: a job title, a headcount, an
-- order of rounds and a list of questions. A panel member reaches the title of
-- the seat they are interviewing for through their own round, and should.
-- The service still gates the board itself; RLS is for the rows that would
-- matter if the service were ever bypassed.
ALTER TABLE hr.candidates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr.interviews         ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr.scorecards         ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr.scorecard_answers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr.candidate_activity ENABLE ROW LEVEL SECURITY;

-- The panel is the reason these are not five copies of one policy.
--
-- A department HOD sitting on a round is not HR and must never see the hiring
-- board — but they must see the round they are in and the person they are
-- about to meet, or they cannot write the feedback the round exists to get.
-- So the fence opens by the panel list, one interview at a time.
--
-- What that does NOT do is hide a column: RLS decides rows, and a candidate
-- row carries what they earn now and what they are asking for. Keeping that
-- from a panel member is the service's job (`lib/services/hiring.ts` selects
-- the money only for a reader with hr_access), and it is written down in both
-- places because only one of them is enforced by Postgres.
DO $policies$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='hr' AND tablename='candidates'
                    AND policyname='candidates_hr') THEN
    CREATE POLICY candidates_hr ON hr.candidates
      USING (hr.may_see_hiring());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='hr' AND tablename='candidates'
                    AND policyname='candidates_panel') THEN
    CREATE POLICY candidates_panel ON hr.candidates
      USING (EXISTS (
        SELECT 1 FROM hr.interviews i
          JOIN hr.interview_panel p ON p.interview_id = i.id
         WHERE i.candidate_id = candidates.id
           AND p.user_id = hr.acting_user()
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='hr' AND tablename='interviews'
                    AND policyname='interviews_hr') THEN
    CREATE POLICY interviews_hr ON hr.interviews
      USING (hr.may_see_hiring());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='hr' AND tablename='interviews'
                    AND policyname='interviews_panel') THEN
    CREATE POLICY interviews_panel ON hr.interviews
      USING (EXISTS (
        SELECT 1 FROM hr.interview_panel p
         WHERE p.interview_id = interviews.id
           AND p.user_id = hr.acting_user()
      ));
  END IF;

  -- Your own scorecard is yours whoever you are; everybody's is HR's.
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='hr' AND tablename='scorecards'
                    AND policyname='scorecards_hr_or_own') THEN
    CREATE POLICY scorecards_hr_or_own ON hr.scorecards
      USING (hr.may_see_hiring() OR user_id = hr.acting_user());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='hr' AND tablename='scorecard_answers'
                    AND policyname='scorecard_answers_follow_card') THEN
    CREATE POLICY scorecard_answers_follow_card ON hr.scorecard_answers
      USING (EXISTS (
        SELECT 1 FROM hr.scorecards s
         WHERE s.id = scorecard_answers.scorecard_id
           AND (hr.may_see_hiring() OR s.user_id = hr.acting_user())
      ));
  END IF;

  -- The trail is HR's. A panel member needs their round, not the history of
  -- every conversation the candidate has had with the company.
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='hr' AND tablename='candidate_activity'
                    AND policyname='candidate_activity_hr') THEN
    CREATE POLICY candidate_activity_hr ON hr.candidate_activity
      USING (hr.may_see_hiring());
  END IF;

  -- …but a panel member does WRITE one line to it: "wrote up the department
  -- round". Without this, the policy above doubled as the INSERT check, and
  -- every interviewer outside HR got a raw RLS error on Submit — after their
  -- scorecard had already been saved. They may add a line in their own name,
  -- about a candidate they are on a panel for, and still read none of it.
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='hr' AND tablename='candidate_activity'
                    AND policyname='candidate_activity_panel_writes') THEN
    CREATE POLICY candidate_activity_panel_writes ON hr.candidate_activity
      FOR INSERT
      WITH CHECK (
        user_id = hr.acting_user()
        AND EXISTS (
          SELECT 1 FROM hr.interviews i
            JOIN hr.interview_panel p ON p.interview_id = i.id
           WHERE i.candidate_id = candidate_activity.candidate_id
             AND p.user_id = hr.acting_user()
        )
      );
  END IF;
END $policies$;

-- ── telling the panel ──────────────────────────────────────────────────
-- A department HOD put on a panel had no reason to open the Hiring screen, so
-- nothing told them there was an interview to sit in or a write-up to do.
-- These go through the notification engine every other module uses: a
-- template, and a route that sends it to the people named in the event.
--
-- Every {{variable}} below is supplied by lib/services/hiring.ts, and a unit
-- test holds it to that — an unsupplied one renders as literal braces.
INSERT INTO portal.notification_templates
  (code, tier, title_template, body_template, action_url_template, action_label, description) VALUES
  ('hiring_panel_added', 'action_required',
   'Interview — {{candidateName}}',
   '{{stageLabel}} for {{roleTitle}} · {{when}} IST · {{mode}}{{whereLine}}. You are on the panel; write yours up after the conversation.',
   '/hr/rounds/{{interviewId}}', 'Open the round',
   'S11: somebody was put on an interview panel'),
  ('hiring_round_changed', 'action_required',
   'Interview changed — {{candidateName}}',
   '{{stageLabel}} for {{roleTitle}}: {{change}}',
   '/hr/rounds/{{interviewId}}', 'Open the round',
   'S11: a round a panel member sits in was rescheduled or called off')
ON CONFLICT (code) DO NOTHING;

INSERT INTO portal.event_routes
  (event_type, category, notification_type, template_code, recipient_strategy, default_channels, priority) VALUES
  ('hiring.panel_added',   'user', 'assignment', 'hiring_panel_added',   'explicit', '["in_app"]', 'action_required'),
  ('hiring.round_changed', 'user', 'reminder',   'hiring_round_changed', 'explicit', '["in_app"]', 'action_required')
ON CONFLICT (event_type) DO NOTHING;

-- ── the app role ───────────────────────────────────────────────────────
-- db/007 granted what existed then; every table since has needed its own
-- grant, and db/042 forgetting it is why db/044 exists. The rights here are
-- the ones the code uses and no more.
GRANT USAGE ON SCHEMA hr TO essentia_app;
GRANT SELECT ON hr.interview_stages                  TO essentia_app;
GRANT SELECT, INSERT, UPDATE ON hr.open_roles        TO essentia_app;
GRANT SELECT, INSERT, UPDATE ON hr.candidates        TO essentia_app;
GRANT SELECT, INSERT, UPDATE ON hr.interviews        TO essentia_app;
-- UPDATE: the lead changes, and people are excused from a write-up.
GRANT SELECT, INSERT, UPDATE, DELETE ON hr.interview_panel TO essentia_app;
GRANT SELECT, INSERT, UPDATE ON hr.question_sets     TO essentia_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON hr.questions TO essentia_app;
GRANT SELECT, INSERT, UPDATE ON hr.scorecards        TO essentia_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON hr.scorecard_answers TO essentia_app;
-- Read and append. No update, no delete: a trail that can be edited is not one.
GRANT SELECT, INSERT ON hr.candidate_activity TO essentia_app;
GRANT USAGE, SELECT ON SEQUENCE hr.candidate_activity_id_seq TO essentia_app;

-- ── who the portal lets in ─────────────────────────────────────────────
-- `hiring` is its own resource, not a corner of `users`: seeing that a seat is
-- open is a different question from seeing an employee's file. hr_access is
-- the door; edit is the right to move somebody through it.
--
-- The resource has to exist before a permission can point at it — permissions
-- carries a foreign key to this table, so the order here is load-bearing.
INSERT INTO public.resource_types (code, name, domain, is_financial, is_hr) VALUES
  ('hiring', 'Open Roles / Candidates', 'shared', FALSE, TRUE)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.permissions (access_level, resource_type, action_code, allowed, scope, notes)
SELECT v.lvl::access_level, 'hiring', v.act, v.ok, v.scope, v.note
FROM (VALUES
  ('L0', 'hr_access', TRUE,  'all',      'Founders see every seat and every candidate'),
  ('L0', 'read',      TRUE,  'all',      NULL),
  ('L0', 'create',    TRUE,  'all',      NULL),
  ('L0', 'edit',      TRUE,  'all',      NULL),
  ('L1', 'hr_access', TRUE,  'all',      NULL),
  ('L1', 'read',      TRUE,  'all',      NULL),
  ('L1', 'create',    TRUE,  'all',      NULL),
  ('L1', 'edit',      TRUE,  'all',      NULL),
  ('L2', 'hr_access', FALSE, 'own_dept', 'SECURITY RULE (§36): a TL sees hiring only if they are HR — the department rows below grant it'),
  ('L2', 'read',      FALSE, 'own_dept', NULL),
  ('L3', 'hr_access', FALSE, 'own_dept', 'SECURITY RULE (§36): candidate data is never open to the floor'),
  ('L3', 'read',      FALSE, 'own_dept', NULL)
) AS v(lvl, act, ok, scope, note)
ON CONFLICT (access_level, department_id, resource_type, action_code) DO NOTHING;

-- HR's own people, by department. A department row beats the level's global
-- row in the resolver, so this is what lets HR run hiring from L2 and L3.
INSERT INTO public.permissions (access_level, department_id, resource_type, action_code, allowed, scope, notes)
SELECT v.lvl::access_level, d.id, 'hiring', v.act, TRUE, 'all', v.note
FROM public.departments d
CROSS JOIN (VALUES
  ('L2', 'hr_access', 'HR runs hiring — Brief §32'),
  ('L2', 'read',      NULL),
  ('L2', 'create',    NULL),
  ('L2', 'edit',      NULL),
  ('L3', 'hr_access', 'An HR coordinator schedules rounds and chases feedback'),
  ('L3', 'read',      NULL),
  ('L3', 'create',    NULL)
) AS v(lvl, act, note)
WHERE d.code = 'HR'
ON CONFLICT (access_level, department_id, resource_type, action_code) DO NOTHING;

-- Two things must hold, or the module is either shut or wide open.
DO $guards$
DECLARE
  stages INTEGER;
  opened INTEGER;
BEGIN
  SELECT count(*) INTO stages FROM hr.interview_stages;
  IF stages < 2 THEN
    RAISE EXCEPTION 'the pipeline needs stages to move a candidate through; found %', stages;
  END IF;

  SELECT count(*) INTO opened
    FROM public.permissions
   WHERE resource_type = 'hiring' AND action_code = 'hr_access'
     AND allowed = TRUE AND department_id IS NULL
     AND access_level IN ('L2', 'L3');
  IF opened > 0 THEN
    RAISE EXCEPTION 'hiring must not be open to L2/L3 globally — % such rows', opened;
  END IF;
END $guards$;
