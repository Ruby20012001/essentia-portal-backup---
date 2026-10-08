-- =====================================================================
-- 064 — STAGE TRACKER  (ID · 3D · Architecture)
--   The MASTER SHEET's three phases as one board at /stage-board (Monica,
--   8 Oct 2026): the ID tracker opens first, with 3D and Architecture as two
--   buttons beside it.
--
--     ID            team member; Layout, Vibe and Camera angles, each its own
--                   section with Start / End / Signoff
--     3D            team member, start date, end date, status
--     Architecture  team member, status, technical drawings, boundbook date,
--                   external GFCs
--
--   One table, one row per project per tab. A column a tab does not use stays
--   NULL. Every value is TEXT, not DATE, on purpose: the spreadsheet these
--   come from says "sent: 17th july approved: 20th" and "expected: 1st week
--   of sept" — a date column would refuse the real data.
--
--   updated_at is what "aaj kya badla" reads: the board marks the rows
--   touched today (Asia/Kolkata).
--
--   Access is the Team Weekly Board's (lib/services/team-weekly.ts): the
--   design tracker's list plus L0 / L1. Removing deletes, and is audited
--   with the row it removed.
--
--   Forward-only, idempotent.
--
--   ROLLBACK: DROP TABLE ee.stage_tracker_rows;
-- =====================================================================

CREATE TABLE IF NOT EXISTS ee.stage_tracker_rows (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  discipline      VARCHAR(4) NOT NULL CHECK (discipline IN ('id', '3d', 'arch')),
  project         VARCHAR(200) NOT NULL CHECK (btrim(project) <> ''),
  member          VARCHAR(120),
  status          TEXT,
  -- ID
  layout_start    TEXT,
  layout_end      TEXT,
  layout_signoff  TEXT,
  vibe_start      TEXT,
  vibe_end        TEXT,
  vibe_signoff    TEXT,
  cam_start       TEXT,
  cam_end         TEXT,
  cam_signoff     TEXT,
  -- 3D
  start_date      TEXT,
  end_date        TEXT,
  -- Architecture
  tech_drawings   TEXT,
  boundbook       TEXT,
  ext_gfc         TEXT,
  created_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The same project twice on one tab is a typing slip, not two projects.
CREATE UNIQUE INDEX IF NOT EXISTS stage_tracker_rows_project_uq
  ON ee.stage_tracker_rows (discipline, lower(btrim(project)));

GRANT SELECT, INSERT, UPDATE, DELETE ON ee.stage_tracker_rows TO essentia_app;
