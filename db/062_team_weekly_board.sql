-- =====================================================================
-- 062 — TEAM WEEKLY BOARD
--   Jiya's weekly log of what each design team did (Monica, 7 Oct 2026:
--   "jo bhi wo daalengi uski ek list ban kar aa jayegi … end of the week
--   remove"). The WIO board's shape, at /team-board.
--
--   Two tables:
--     ee.team_weekly_options   the teams, the particulars (RK, MR, JKR) and
--                              the work types (Layouts, Intents, SLD) — data
--                              rows with an order, so Jiya adds one from the
--                              board rather than anybody changing code.
--     ee.team_weekly_entries   one line of work: team, particular, type,
--                              what was done, how many, which day, status.
--
--   Entries ARE deleted. That is the point of the board — read at the end of
--   the week, then cleared — and was asked for in those words. Each removal
--   is written to the audit log with the row it removed.
--
--   Access is by name, the design tracker's list (db/050): anybody on
--   ee.design_tracker_people, plus L0 / L1. See lib/services/team-weekly.ts.
--
--   Forward-only, idempotent.
--
--   ROLLBACK: DROP TABLE ee.team_weekly_entries; DROP TABLE ee.team_weekly_options;
-- =====================================================================

CREATE TABLE IF NOT EXISTS ee.team_weekly_options (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kind        VARCHAR(12) NOT NULL CHECK (kind IN ('team', 'particular', 'work_type')),
  name        VARCHAR(80) NOT NULL CHECK (btrim(name) <> ''),
  sort_order  INTEGER NOT NULL DEFAULT 100,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- "RK" and "rk" are the same particular.
CREATE UNIQUE INDEX IF NOT EXISTS team_weekly_options_kind_name_uq
  ON ee.team_weekly_options (kind, lower(name));

CREATE TABLE IF NOT EXISTS ee.team_weekly_entries (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Names, not ids: an option renamed or retired later must not rewrite what
  -- a past week says was done.
  team        VARCHAR(80) NOT NULL,
  particular  VARCHAR(80) NOT NULL,
  work_type   VARCHAR(80) NOT NULL,
  title       TEXT NOT NULL CHECK (btrim(title) <> ''),
  qty         INTEGER NOT NULL DEFAULT 1 CHECK (qty BETWEEN 1 AND 999),
  work_date   DATE NOT NULL,
  status      VARCHAR(10) NOT NULL DEFAULT 'done' CHECK (status IN ('done', 'progress', 'pending')),
  created_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS team_weekly_entries_date_idx
  ON ee.team_weekly_entries (work_date);

-- The sixth team is Navya; it was first seeded as "Anvya" by mistake (Monica,
-- 7 Oct). A database that already ran the old seed is renamed in place —
-- the option and any entry filed under it — before the insert below, so the
-- insert does not add Navya as a seventh team beside a stale Anvya.
UPDATE ee.team_weekly_options SET name = 'Team Navya'
 WHERE kind = 'team' AND name = 'Team Anvya'
   AND NOT EXISTS (SELECT 1 FROM ee.team_weekly_options WHERE kind = 'team' AND name = 'Team Navya');
UPDATE ee.team_weekly_entries SET team = 'Team Navya' WHERE team = 'Team Anvya';

INSERT INTO ee.team_weekly_options (kind, name, sort_order) VALUES
  ('team', 'Team Ritu',    10),
  ('team', 'Team Lavika',  20),
  ('team', 'Team Prerna',  30),
  ('team', 'Team Vritika', 40),
  ('team', 'Team Aryan',   50),
  ('team', 'Team Navya',   60),
  ('particular', 'RK',  10),
  ('particular', 'MR',  20),
  ('particular', 'JKR', 30),
  ('work_type', 'Layouts', 10),
  ('work_type', 'Intents', 20),
  ('work_type', 'SLD',     30)
ON CONFLICT DO NOTHING;

GRANT SELECT, INSERT ON ee.team_weekly_options TO essentia_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ee.team_weekly_entries TO essentia_app;
