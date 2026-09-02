-- =====================================================================
-- 032 — WIO → PIO TRACKER · THE TWO TEAMS
--
--   Ruby, 2026-08-31: "dipmallya and neeraj have two teams in wio team, both
--   handle the projects of dhruv's team (dipmallya) and neeru's team (neeraj)"
--   — and, asked whether they share one board: one shared board, with a team
--   column.
--
--   So the WIO team is ONE department (DRAFTING, db/030) holding TWO teams,
--   split by whose CRM portfolio they serve:
--
--       Dipmallya's team  →  Dhruv Kelaya's projects
--       Neeraj's team     →  Neeru Bajaj's projects
--
--   This is a real table, not config. The split is per-ROW data — every WIO
--   belongs to exactly one team — and per-row data does not belong in a JSON
--   settings blob where nothing can reference it and nothing can enforce it.
--   (db/030 briefly carried it as `tracker.teams`; that key is gone.)
--
--   ACCESS IS UNCHANGED AND DELIBERATELY SO. Both teams sit in DRAFTING, so
--   both already read and edit the whole board — the team column is a LENS,
--   not a fence. Dipmallya's team can see and fix a row of Neeraj's, which is
--   the point of putting them on one board: the WIO team covers for itself.
--   If that ever needs to become a fence it is an RLS policy on team_code, not
--   a change here.
--
--   Additive + idempotent. Safe to re-run.
--   ROLLBACK: ALTER TABLE ee.tracker_wios DROP COLUMN team_code;
--             DROP TABLE ee.tracker_teams;
-- =====================================================================

CREATE TABLE IF NOT EXISTS ee.tracker_teams (
  code           VARCHAR(40) PRIMARY KEY,
  name           VARCHAR(120) NOT NULL,
  -- Whose CRM project portfolio this team serves. Held as a NAME because the
  -- link that matters is to a person the WIO team talks to daily, and it must
  -- keep reading correctly before Keka has synced that person into
  -- public.users. crm_tl_id attaches the account when it exists; neither
  -- column is load-bearing for the board to work.
  serves_crm_tl  VARCHAR(120),
  crm_tl_id      UUID REFERENCES public.users(id),
  sort_order     INTEGER NOT NULL DEFAULT 0,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE
);

COMMENT ON TABLE ee.tracker_teams IS
  'The two teams inside the WIO team (DRAFTING). Not departments — the portal''s '
  'org model stops at department, and these sit below it.';

INSERT INTO ee.tracker_teams (code, name, serves_crm_tl, sort_order) VALUES
  ('dipmallya', 'Dipmallya''s team', 'Dhruv Kelaya', 1),
  ('neeraj',    'Neeraj''s team',    'Neeru Bajaj',  2)
ON CONFLICT (code) DO NOTHING;

-- Attach the CRM TL's account where Keka has already synced one. Matched on
-- full_name because that is the only identifier this table carries; a miss
-- simply leaves crm_tl_id NULL, which nothing depends on.
UPDATE ee.tracker_teams t
   SET crm_tl_id = u.id
  FROM public.users u
 WHERE u.full_name = t.serves_crm_tl
   AND t.crm_tl_id IS NULL;

-- ---------------------------------------------------------------------
-- The column. Added nullable, backfilled, then made NOT NULL — every WIO on
-- this board belongs to exactly one of the two teams, and a row that cannot
-- say which is a row nobody owns.
--
-- The backfill tags all existing rows 'dipmallya' because that is the literal
-- provenance of the seed: db/031 is Dipmallya's workbook, exported 2026-08-25.
-- Neeraj's rows arrive as their own seed once Ruby sends that export; they are
-- NOT invented here.
-- ---------------------------------------------------------------------
ALTER TABLE ee.tracker_wios
  ADD COLUMN IF NOT EXISTS team_code VARCHAR(40) REFERENCES ee.tracker_teams(code);

UPDATE ee.tracker_wios SET team_code = 'dipmallya' WHERE team_code IS NULL;

ALTER TABLE ee.tracker_wios ALTER COLUMN team_code SET NOT NULL;

COMMENT ON COLUMN ee.tracker_wios.team_code IS
  'Which of the two WIO teams owns this row. A lens for filtering and roll-ups, '
  'not an access fence — both teams work the whole board (see db/032 header).';

-- The board filters by team on every screen, and the Today roll-ups are
-- recomputed per team, so this pairing is the hot read.
CREATE INDEX IF NOT EXISTS idx_tracker_wios_team
  ON ee.tracker_wios (team_code, stage_id);

-- ---------------------------------------------------------------------
-- The board is no longer one team's. db/031 carried the workbook's own label,
-- "Dipmallya's team", which was correct for a single-team export and is wrong
-- the moment Neeraj's rows land beside it.
--
-- Guarded so a team that has since renamed the board keeps their name.
-- ---------------------------------------------------------------------
UPDATE ee.tracker_settings
   SET team_name = 'WIO team'
 WHERE id = 1 AND team_name = 'Dipmallya''s team';
