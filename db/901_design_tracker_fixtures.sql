-- =====================================================================
-- 901 — DEV FIXTURES · PROJECTS ON THE DESIGN BOARD
--
--   DEV ONLY. Loaded by db/dev-db.mjs and never by a real deployment.
--
--   Monica, 21 Sep 2026: "mujhe data nahi dikh raha, kyun". Because there
--   was none. db/050 seeds the chart, the five people and the activities,
--   but a project is something somebody enters — so a rebuilt test database
--   came up with a board that was correct and completely empty, and the
--   projects she had been looking at were ones typed in by hand hours
--   earlier, into a database that lives in memory.
--
--   This puts projects back on every rebuild. Not a copy of anyone's real
--   work — invented jobs, the kind the board is for, spread so the board
--   has something to show on each of its tabs:
--
--     · one nearly finished and running clean        (Lavika, day ~150)
--     · one mid-flight and on time                   (Ritu, day ~60)
--     · two mid-flight and late, waiting on others   (Akansha, Jiya)
--     · one just started, nothing ticked yet         (Lavika)
--     · one with no start date at all — NOT TRACKED  (Ritu)
--
--   Dates are relative to the day the fixture loads, never absolute, so the
--   board is never a museum: a project that was HOT when this was written
--   is still HOT next March.
--
--   Activities are ticked by walking the chart in order and marking
--   everything due before a cut-off. The late ones are dated after their due
--   day, which is what puts them in Delays under whoever the chart says is
--   responsible.
--
--   Idempotent: it deletes its own six projects by name first, so loading
--   twice leaves six, not twelve.
-- =====================================================================

DO $$
DECLARE
  lavika  UUID;
  ritu    UUID;
  akansha UUID;
  jiya    UUID;
BEGIN
  SELECT id INTO lavika  FROM ee.design_tracker_people WHERE name = 'Lavika';
  SELECT id INTO ritu    FROM ee.design_tracker_people WHERE name = 'Ritu';
  SELECT id INTO akansha FROM ee.design_tracker_people WHERE name = 'Akansha Malik';
  SELECT id INTO jiya    FROM ee.design_tracker_people WHERE name = 'Jiya';

  IF lavika IS NULL THEN
    RAISE NOTICE 'design fixtures skipped — the team is not seeded';
    RETURN;
  END IF;

  DELETE FROM ee.design_projects
   WHERE name IN ('Prestige Hilltop 1204', 'Nandi Farmhouse', 'Cubbon House',
                  'Indiranagar Showroom', 'Whitefield Duplex', 'Koramangala Café');

  INSERT INTO ee.design_projects (name, client, location, designer_id, type_code, start_date, notes) VALUES
    ('Prestige Hilltop 1204', 'Mr & Mrs Ramesh Iyer', 'Bengaluru', lavika,  'apartment', CURRENT_DATE - 150, 'Handover next month.'),
    ('Nandi Farmhouse',       'Kavitha Reddy',        'Nandi Hills', ritu,   'farmhouse', CURRENT_DATE - 60,  NULL),
    ('Cubbon House',          'Arjun Mehta',          'Bengaluru', akansha, 'kothi',     CURRENT_DATE - 95,  'Client travelling — approvals slow.'),
    ('Indiranagar Showroom',  'Vastra Retail',        'Bengaluru', jiya,    'showroom',  CURRENT_DATE - 80,  NULL),
    ('Whitefield Duplex',     'Sneha Nair',           'Bengaluru', lavika,  'duplex',    CURRENT_DATE - 6,   'Just started.'),
    ('Koramangala Café',      'Third Wave',           'Bengaluru', ritu,    'restaurant', NULL,              'Waiting on the lease.');
END $$;

/*
 * Ticking the chart. For each project, everything due on or before its
 * cut-off day is marked done — on its due date where the project is
 * running clean, and a few days after it where it is not. done_on is
 * derived from start_date, so the whole board stays relative.
 */
DO $$
DECLARE
  p RECORD;
  cutoff INT;
  slip   INT;
BEGIN
  FOR p IN
    SELECT id, name, start_date FROM ee.design_projects
     WHERE start_date IS NOT NULL
       AND name IN ('Prestige Hilltop 1204', 'Nandi Farmhouse', 'Cubbon House',
                    'Indiranagar Showroom', 'Whitefield Duplex')
  LOOP
    -- How far each project has got, and whether it got there on time.
    SELECT CASE p.name
             WHEN 'Prestige Hilltop 1204' THEN 140   WHEN 'Nandi Farmhouse'      THEN 55
             WHEN 'Cubbon House'          THEN 60    WHEN 'Indiranagar Showroom' THEN 45
             ELSE 0
           END,
           CASE p.name
             WHEN 'Cubbon House' THEN 9   WHEN 'Indiranagar Showroom' THEN 5
             ELSE 0
           END
      INTO cutoff, slip;

    CONTINUE WHEN cutoff = 0;

    INSERT INTO ee.design_project_activities (project_id, activity_id, done_on)
    SELECT p.id, a.id, p.start_date + a.due_day + slip
      FROM ee.design_activities a
     WHERE a.due_day <= cutoff
    ON CONFLICT (project_id, activity_id) DO NOTHING;
  END LOOP;
END $$;
