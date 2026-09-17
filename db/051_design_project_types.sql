-- =====================================================================
-- 051 — DESIGN ACTIVITY TRACKER · WHAT KIND OF PROJECT IT IS
--
--   Monica, 16 Sep 2026: residential — apartment, penthouse, farmhouse,
--   kothi, villa, bungalow; commercial — office, club house; "and whatever
--   else there is, and use them".
--
--   The type is not only a label. The activity chart has two activities that
--   exist only where the project stands on its own plot — the sanctioning
--   process (9) and on-site work initiation "if the site is to be constructed"
--   (17). An apartment, a penthouse or an office floor has neither: there is
--   nothing to sanction and no structure to build. So a type carries
--   `own_plot`, an activity carries `needs_own_plot`, and a project whose type
--   has no plot starts with those activities marked N/A — said in the remark,
--   and undone by unticking N/A like any other.
--
--   The list is rows, so a type nobody thought of today is an INSERT, not a
--   deploy.
--
--   Additive + idempotent.
--   ROLLBACK: ALTER TABLE ee.design_projects DROP COLUMN type_code;
--             ALTER TABLE ee.design_activities DROP COLUMN needs_own_plot;
--             DROP TABLE ee.design_project_types;
-- =====================================================================

CREATE TABLE IF NOT EXISTS ee.design_project_types (
  code        VARCHAR(30) PRIMARY KEY,
  label       VARCHAR(60) NOT NULL,
  segment     VARCHAR(12) NOT NULL CHECK (segment IN ('residential', 'commercial')),
  own_plot    BOOLEAN NOT NULL,          -- a building of its own, on its own land
  sort_order  INTEGER NOT NULL DEFAULT 100,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO ee.design_project_types (code, label, segment, own_plot, sort_order) VALUES
  -- Residential. A unit inside somebody else's building has no plot of its own.
  ('apartment',      'Apartment',                  'residential', FALSE, 10),
  ('penthouse',      'Penthouse',                  'residential', FALSE, 20),
  ('duplex',         'Duplex apartment',           'residential', FALSE, 30),
  ('builder_floor',  'Builder floor',              'residential', FALSE, 40),
  ('kothi',          'Kothi',                      'residential', TRUE,  50),
  ('bungalow',       'Bungalow',                   'residential', TRUE,  60),
  ('villa',          'Villa',                      'residential', TRUE,  70),
  ('farmhouse',      'Farmhouse',                  'residential', TRUE,  80),
  -- Commercial.
  ('office',         'Office',                     'commercial',  FALSE, 110),
  ('club_house',     'Club house',                 'commercial',  TRUE,  120),
  ('sales_gallery',  'Sales gallery / experience centre', 'commercial', FALSE, 130),
  ('showroom',       'Showroom / retail',          'commercial',  FALSE, 140),
  ('restaurant',     'Restaurant / café',          'commercial',  FALSE, 150),
  ('hotel',          'Hotel / resort',             'commercial',  TRUE,  160)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE ee.design_projects
  ADD COLUMN IF NOT EXISTS type_code VARCHAR(30) REFERENCES ee.design_project_types(code);

ALTER TABLE ee.design_activities
  ADD COLUMN IF NOT EXISTS needs_own_plot BOOLEAN NOT NULL DEFAULT FALSE;

-- Sanctioning (9) and on-site work initiation (17). Matched by position and
-- task together, so a retuned chart is never marked by accident.
UPDATE ee.design_activities SET needs_own_plot = TRUE
 WHERE (position = 9  AND task = 'Sanctioning process')
    OR (position = 17 AND task = 'On-site work initiation');

GRANT SELECT ON ee.design_project_types TO essentia_app;
