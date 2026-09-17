-- =====================================================================
-- 050 — DESIGN ACTIVITY TRACKER (S4c · the design team's projects)
--
--   The source is "1.)DESIGN ACTIVITY CHART.xlsx", sheet "Daily use sheet":
--   every activity from the project lead follow-up to production, the day it
--   should be done by (STANDARD TIME CONSUMED, counted from the start), how
--   many days it takes (STANDARD TIMELINE) and who it depends on
--   (RESPONSIBILITY). That sheet is filled in once per project, by hand.
--   This puts it on one board, with the WIO tracker's shape, so that Vishakha
--   can open one designer's name and see which project is holding them up,
--   and on whom.
--
--   The chart's numbers are kept as the chart has them, including where the
--   activities run in parallel (the lookbook at day 93 while on-site work runs
--   to day 109; the PIO at day 130 before the WIO at 135). An activity carries
--   the day it is due by, not a place in a queue, so parallel work is simply
--   two activities open at once.
--
--   Nothing derived is stored. HOT, WARM, COLD, days late and who caused it
--   are all computed from start_date, the chart and the dates activities were
--   done (lib/services/design-tracker-logic.ts).
--
--   Additive + idempotent.
--   ROLLBACK: DROP TABLE ee.design_project_activities, ee.design_projects,
--             ee.design_tracker_people, ee.design_activities,
--             ee.design_tracker_settings;
-- =====================================================================

-- ── the chart ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ee.design_activities (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  position           INTEGER NOT NULL UNIQUE,
  code               VARCHAR(10) NOT NULL,         -- the chart's S.NO. — '8', '26 A'
  task               VARCHAR(300) NOT NULL,
  detail             TEXT,
  phase              VARCHAR(60),                  -- 'TIMELINES AS PER TYPICAL PIO'
  due_day            INTEGER CHECK (due_day IS NULL OR due_day >= 0),
  standard_days      INTEGER CHECK (standard_days IS NULL OR standard_days >= 0),
  depends_on         VARCHAR(300),                 -- RESPONSIBILITY
  depends_on_client  BOOLEAN NOT NULL DEFAULT FALSE, -- '(Depands upon client)'
  optional           BOOLEAN NOT NULL DEFAULT FALSE, -- 'N/A' / 'if the site is to be constructed'
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── who is on the board ───────────────────────────────────────────────
-- A row per person. The head sees and runs everybody; a designer sees their
-- own projects. `user_id` is how a signed-in account is recognised as one of
-- them — the name on the board is never typed at sign-in.
CREATE TABLE IF NOT EXISTS ee.design_tracker_people (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(120) NOT NULL UNIQUE,
  role        VARCHAR(10) NOT NULL DEFAULT 'designer' CHECK (role IN ('head', 'designer')),
  title       VARCHAR(120),
  user_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  sort_order  INTEGER NOT NULL DEFAULT 100,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS ee.design_projects (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(200) NOT NULL,
  client        VARCHAR(200),
  location      VARCHAR(200),
  designer_id   UUID NOT NULL REFERENCES ee.design_tracker_people(id),
  start_date    DATE,                               -- day 0 of the chart
  completed_on  DATE,
  notes         TEXT,
  created_by    UUID REFERENCES public.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS design_projects_designer_idx
  ON ee.design_projects (designer_id);

-- One row per activity somebody has touched on a project. No row = still to
-- do. Done is a date, never a tick: "done" without a day cannot say late.
CREATE TABLE IF NOT EXISTS ee.design_project_activities (
  project_id      UUID NOT NULL REFERENCES ee.design_projects(id) ON DELETE CASCADE,
  activity_id     UUID NOT NULL REFERENCES ee.design_activities(id) ON DELETE CASCADE,
  done_on         DATE,
  not_applicable  BOOLEAN NOT NULL DEFAULT FALSE,
  remark          TEXT,
  updated_by      UUID REFERENCES public.users(id),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, activity_id)
);

CREATE TABLE IF NOT EXISTS ee.design_tracker_settings (
  id           INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  team_name    VARCHAR(120) NOT NULL DEFAULT 'Interior Design',
  warm_within  INTEGER NOT NULL DEFAULT 3 CHECK (warm_within >= 0),
  today_stamp  DATE,                                -- NULL = read against the calendar
  stamped_by   UUID REFERENCES public.users(id),
  stamped_at   TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO ee.design_tracker_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ── the chart, as "Daily use sheet" has it ────────────────────────────
INSERT INTO ee.design_activities
  (position, code, task, detail, phase, due_day, standard_days, depends_on, depends_on_client, optional)
VALUES
  ( 1, '1',    'Project lead follow up', NULL, '4-5 weeks', 1, 1, 'Business Development', FALSE, FALSE),
  ( 2, '2',    'Services fee proposal', NULL, '4-5 weeks', 2, 1, 'Business Development', FALSE, FALSE),
  ( 3, '3',    'Client approval on fee proposal', NULL, '4-5 weeks', 3, 1, 'Business Development', TRUE, FALSE),
  ( 4, '4',    'Design PIO (production initiation order)', NULL, '4-5 weeks', 4, 1, 'Business Development', FALSE, FALSE),
  ( 5, '5',    'Assigning the project to the respective teams', NULL, '4-5 weeks', 5, 1, 'Management', FALSE, FALSE),
  ( 6, '6',    'Client brief and questionnaire', NULL, '4-5 weeks', 6, 1, 'CRM', FALSE, FALSE),
  ( 7, '7',    'Critical check', 'Before starting the layout — all by-laws, permissible built-up area, height and ground coverage checked.', '4-5 weeks', 8, 2, 'Architecture', FALSE, FALSE),
  ( 8, '8',    'Layout initiation for first cut presentation', NULL, '4-5 weeks', 29, 21, 'ID team', FALSE, FALSE),
  ( 9, '9',    'Sanctioning process', 'N/A where no sanction is needed.', '4-5 weeks', 49, 20, 'CRM & Architecture', FALSE, TRUE),
  (10, '10',   'Layout sign-off from client (digital / on paper)', NULL, '4-5 weeks', 56, 7, 'CRM', TRUE, FALSE),
  (11, '11',   'Signed-off layout shared with architecture team', NULL, '4-5 weeks', 57, 1, 'ID team', FALSE, FALSE),
  (12, '12',   'Hiring of MEPF consultant', 'Column layout as per architectural layout · MEP layouts · foundation drawing as per final column and MEP layout · roofing details.', '3-4 weeks', 64, 7, 'CRM (follow up) · Procurement (hiring, work order) · Architecture (drawing coordination)', FALSE, FALSE),
  (13, '13',   'MEPF drawing coordination', 'Column layout · MEP layouts · foundation drawing · roofing details.', '3-4 weeks', 78, 14, 'CRM (follow up) · Architecture (drawing coordination)', FALSE, FALSE),
  (14, '14',   'RCP — reflected ceiling plan', 'Ceiling, lintel, sill heights, lighting plan as per furniture planned — checked by the architecture head.', '3-4 weeks', 82, 4, 'ID team', FALSE, FALSE),
  (15, '15',   'Team 3D checklist fulfilled', 'RCP (architecture) · pre-made selections approved by Monica ma''am · camera angles · vibe approved by client · sanitary fixture schedule. Depends on NOC from accounts.', '3-4 weeks', 86, 4, 'CRM · ID team', TRUE, FALSE),
  (16, '16',   'Onsite BOQ — technical set, client approval', NULL, '5-6 weeks', 93, 7, 'Team Accounts & CRM', TRUE, FALSE),
  (17, '17',   'On-site work initiation', 'If the site is to be constructed. NOC from accounts after client approval — site mobilisation, site documentation, drawings for site, vendor onboarding.', '5-6 weeks', 109, 16, 'CRM (client approval) · Procurement', TRUE, TRUE),
  (18, '18',   'First cut lookbook presentation', NULL, '8-9 weeks', 93, NULL, 'CRM & ID team', FALSE, FALSE),
  (19, '19',   'Lookbook sign-off from client (digital / on paper)', 'After all the revisions and feedback are implemented.', '8-9 weeks', 94, 1, 'CRM', TRUE, FALSE),
  (20, '20',   'Onsite & offsite BOQ — all items captured as per 3D', 'Onsite BOQ (quantification, third-party PIs) · offsite BOQ (furniture, SLDs, BOQs) · décor intents.', '2-3 weeks', 111, 17, 'CRM (client approval) · Accounts · ID team', TRUE, FALSE),
  (21, '21',   'Onsite, offsite & décor BOQ — client approval', NULL, '2-3 weeks', 118, 7, 'CRM (client approval) · Accounts', TRUE, FALSE),
  (22, '22',   'Interior GFC drawings initiation', 'Material marking · finishing schedule with codes · furniture schedule · sanitary schedule · SLDs of all offsite items · consultants'' shop drawings.', '1 week', 115, 4, 'Architecture & CRM team · ID team', FALSE, FALSE),
  (23, '23',   'Interior GFC drawings completion', NULL, '1 week', 167, 52, 'Architecture team', FALSE, FALSE),
  (24, '24',   'On-site work initiation (interiors)', 'If the site is to be constructed. NOC from accounts after client approval.', '1-2 weeks to start the work', 132, 14, 'CRM (NOC from accounts)', TRUE, TRUE),
  (25, '24 iv','Vendor onboarding', 'Civil, MS framing, dry wall, waterproofing, anti-termite, plumbing, HVAC, electrical, false ceiling, stone/tile, paint, lighting, fire fighting, automation, POP, kitchen.', '1-2 weeks to start the work', 139, 7, 'CRM (follow up) · Procurement (hiring, work order)', FALSE, TRUE),
  (26, '25',   'Décor delivery', NULL, NULL, 238, 120, 'Décor team', FALSE, FALSE),
  (27, '26 A', 'WIO — work initiation order', 'F&F finishes meeting · sizes from site · furniture BOQ, sanitary schedule and SLDs — all client approved.', '2 weeks', 135, 15, 'Client approval · site team · WIO team · CRM', TRUE, FALSE),
  (28, '26 B', 'WIO drawings', 'Approved by internal heads (Yogi sir, Khushpreet sir, Dhruv sir) and client.', '2 weeks', 136, 1, 'WIO team & CRM', FALSE, FALSE),
  (29, '26 B', 'BOM — bill of materials', NULL, '2 weeks', 137, 1, 'PPC team — Parul Parashar', FALSE, FALSE),
  (30, '26 C', 'PIO — production initiation order', 'Required: BOM, approved BOQ, approved drawing, client approval (BOQ, drawing and intent).', '14 weeks', 130, 1, 'CRM', FALSE, FALSE),
  (31, '27',   'Releasing the PIO', NULL, '14 weeks', 131, NULL, 'CRM', FALSE, FALSE),
  (32, '28',   'Indent for material — production', NULL, '14 weeks', 132, 1, 'PPC team', FALSE, FALSE),
  (33, '29',   'Material order', NULL, '14 weeks', 135, 3, 'Procurement', FALSE, FALSE),
  (34, '29 *', 'Material delivery', 'Fabric 15 · leather 30 · veneer 15 · custom veneer 20 · basework 3 · stone 10 · stone block 15 days.', '14 weeks', 150, 15, 'Procurement', FALSE, FALSE),
  (35, '30',   'Production time', 'Tracked in the factory by the PPC team; CRM pushes and quality-checks.', '14 weeks', 225, 90, 'PPC team · factory', FALSE, FALSE),
  (36, '—',    'Last day', NULL, '34 weeks', 238, NULL, 'CRM', FALSE, FALSE)
ON CONFLICT (position) DO NOTHING;

-- ── the people ────────────────────────────────────────────────────────
-- Accounts from db/043, matched by email. A person whose account does not
-- exist yet is still on the board, just not recognised at sign-in.
INSERT INTO ee.design_tracker_people (name, role, title, user_id, sort_order)
SELECT v.name, v.role, v.title, u.id, v.sort_order
  FROM (VALUES
    ('Vishakha',      'head',     'Head of Interior Design', 'design.vishakha@essentia.in',     10),
    ('Lavika',        'designer', 'Designer',                'design.lavika@essentia.in',       20),
    ('Akansha Malik', 'designer', 'Designer',                'design.akanshamalik@essentia.in', 30),
    ('Ritu',          'designer', 'Designer',                'design.ritu@essentia.in',         40),
    ('Jiya',          'designer', 'Designer',                'design.jiya@essentia.in',         50)
  ) AS v(name, role, title, email, sort_order)
  LEFT JOIN public.users u ON lower(u.email) = v.email
ON CONFLICT (name) DO UPDATE
  SET user_id = COALESCE(ee.design_tracker_people.user_id, EXCLUDED.user_id);

-- ── the app role ──────────────────────────────────────────────────────
-- db/007's grant covers only the tables that existed then (see db/044).
-- The chart and the people are read-only to the application except for the
-- chart's numbers, which the head retunes from Setup.
GRANT SELECT, UPDATE ON ee.design_activities TO essentia_app;
GRANT SELECT ON ee.design_tracker_people TO essentia_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ee.design_projects TO essentia_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ee.design_project_activities TO essentia_app;
GRANT SELECT, UPDATE ON ee.design_tracker_settings TO essentia_app;
