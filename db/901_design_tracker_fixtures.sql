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

-- ── the four decks, at ids that survive a rebuild ─────────────────────
--
--   Same reason as the links above: a deck made through the API gets a
--   fresh uuid every time, so /deck/<id> changed under Monica on every
--   rebuild and whatever link she had been sent stopped working. Fixed
--   ids here mean the four deck links are the same tomorrow as today.
--
--   Blank decks — no project, no spaces, no plan. The plan is a 650 KB
--   image and has no business in a SQL file; it is attached with the tool.
--
INSERT INTO ee.concept_decks (id, name, state) VALUES
  ('d1000000-0000-4000-8000-000000000001', 'Lavika — concept deck', '{"v":1,"type":"Residence","logo":"","project":{"name":"Lavika — concept deck","client":"","contact":"","address":"","code":"","eyebrow":"CONCEPT DECK · PRIVATE RESIDENCE","headline":"A house you can read before you can walk it.","slogan":"different by design","closing":"Everything here is a beginning, not a conclusion. Tell us where it is wrong, and it changes — that is what a concept is for.","kind":"Interior Concept Deck","dateLabel":"September 2026","confidentiality":"Confidential","rate":"1200","estimateBasis":"Indicative only — at essentia published rate of ₹ 1,200 / sq.ft. Not a quotation.","autoSeconds":"2","designer":"Lavika","firm":"essentia environments","firmLine":"essentia Design & Project Partners · Sector 34, Gurugram · Since 1999","site":"essentiaenvironments.com"},"plates":[{"label":"Ground floor","src":"","w":0,"h":0}],"documents":[],"spaces":[],"narrative":{"lead":"A drawing is a language. Nobody should have to learn it to see their own home.","quote":"Touch a number, and the room answers for itself.","body":"A plan records where the walls fall. It does not say which window the morning arrives through, or what it will feel like to set a bag down at the end of a long day.\n\nSo every space on this plan carries a number. Touch it and the room opens — how large it is, where it sits, what it holds, and why it sits there rather than anywhere else.","disclaimer":"All the 3Ds in this deck are for representational purpose for design intent only, and are subject to changes according to the site conditions."}}'::jsonb),
  ('d1000000-0000-4000-8000-000000000002', 'Akansha Malik — concept deck', '{"v":1,"type":"Residence","logo":"","project":{"name":"Akansha Malik — concept deck","client":"","contact":"","address":"","code":"","eyebrow":"CONCEPT DECK · PRIVATE RESIDENCE","headline":"A house you can read before you can walk it.","slogan":"different by design","closing":"Everything here is a beginning, not a conclusion. Tell us where it is wrong, and it changes — that is what a concept is for.","kind":"Interior Concept Deck","dateLabel":"September 2026","confidentiality":"Confidential","rate":"1200","estimateBasis":"Indicative only — at essentia published rate of ₹ 1,200 / sq.ft. Not a quotation.","autoSeconds":"2","designer":"Akansha Malik","firm":"essentia environments","firmLine":"essentia Design & Project Partners · Sector 34, Gurugram · Since 1999","site":"essentiaenvironments.com"},"plates":[{"label":"Ground floor","src":"","w":0,"h":0}],"documents":[],"spaces":[],"narrative":{"lead":"A drawing is a language. Nobody should have to learn it to see their own home.","quote":"Touch a number, and the room answers for itself.","body":"A plan records where the walls fall. It does not say which window the morning arrives through, or what it will feel like to set a bag down at the end of a long day.\n\nSo every space on this plan carries a number. Touch it and the room opens — how large it is, where it sits, what it holds, and why it sits there rather than anywhere else.","disclaimer":"All the 3Ds in this deck are for representational purpose for design intent only, and are subject to changes according to the site conditions."}}'::jsonb),
  ('d1000000-0000-4000-8000-000000000003', 'Ritu — concept deck', '{"v":1,"type":"Residence","logo":"","project":{"name":"Ritu — concept deck","client":"","contact":"","address":"","code":"","eyebrow":"CONCEPT DECK · PRIVATE RESIDENCE","headline":"A house you can read before you can walk it.","slogan":"different by design","closing":"Everything here is a beginning, not a conclusion. Tell us where it is wrong, and it changes — that is what a concept is for.","kind":"Interior Concept Deck","dateLabel":"September 2026","confidentiality":"Confidential","rate":"1200","estimateBasis":"Indicative only — at essentia published rate of ₹ 1,200 / sq.ft. Not a quotation.","autoSeconds":"2","designer":"Ritu","firm":"essentia environments","firmLine":"essentia Design & Project Partners · Sector 34, Gurugram · Since 1999","site":"essentiaenvironments.com"},"plates":[{"label":"Ground floor","src":"","w":0,"h":0}],"documents":[],"spaces":[],"narrative":{"lead":"A drawing is a language. Nobody should have to learn it to see their own home.","quote":"Touch a number, and the room answers for itself.","body":"A plan records where the walls fall. It does not say which window the morning arrives through, or what it will feel like to set a bag down at the end of a long day.\n\nSo every space on this plan carries a number. Touch it and the room opens — how large it is, where it sits, what it holds, and why it sits there rather than anywhere else.","disclaimer":"All the 3Ds in this deck are for representational purpose for design intent only, and are subject to changes according to the site conditions."}}'::jsonb),
  ('d1000000-0000-4000-8000-000000000004', 'Jiya — concept deck', '{"v":1,"type":"Residence","logo":"","project":{"name":"Jiya — concept deck","client":"","contact":"","address":"","code":"","eyebrow":"CONCEPT DECK · PRIVATE RESIDENCE","headline":"A house you can read before you can walk it.","slogan":"different by design","closing":"Everything here is a beginning, not a conclusion. Tell us where it is wrong, and it changes — that is what a concept is for.","kind":"Interior Concept Deck","dateLabel":"September 2026","confidentiality":"Confidential","rate":"1200","estimateBasis":"Indicative only — at essentia published rate of ₹ 1,200 / sq.ft. Not a quotation.","autoSeconds":"2","designer":"Jiya","firm":"essentia environments","firmLine":"essentia Design & Project Partners · Sector 34, Gurugram · Since 1999","site":"essentiaenvironments.com"},"plates":[{"label":"Ground floor","src":"","w":0,"h":0}],"documents":[],"spaces":[],"narrative":{"lead":"A drawing is a language. Nobody should have to learn it to see their own home.","quote":"Touch a number, and the room answers for itself.","body":"A plan records where the walls fall. It does not say which window the morning arrives through, or what it will feel like to set a bag down at the end of a long day.\n\nSo every space on this plan carries a number. Touch it and the room opens — how large it is, where it sits, what it holds, and why it sits there rather than anywhere else.","disclaimer":"All the 3Ds in this deck are for representational purpose for design intent only, and are subject to changes according to the site conditions."}}'::jsonb)
ON CONFLICT (id) DO NOTHING;
