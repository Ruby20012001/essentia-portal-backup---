-- =====================================================================
-- 063 — TEAM 3D BOARD
--   The 3D page behind the "3D" button on the Team Weekly Board (Monica,
--   7 Oct 2026). Two teams — Team Neeru and Team Dhruv — and under each, its
--   projects in three stages: Ongoing, Revisions, Signoff. Jiya keeps it:
--   adds a project, edits it, moves it along, removes it.
--
--     ee.team_3d_teams      the teams, data rows with an order
--     ee.team_3d_projects   one project: which team, which stage, its name,
--                           client and a note
--
--   Access is the Team Weekly Board's (lib/services/team-weekly.ts): the
--   design tracker's list plus L0 / L1. Removing deletes, and is audited.
--
--   Forward-only, idempotent.
--
--   ROLLBACK: DROP TABLE ee.team_3d_projects; DROP TABLE ee.team_3d_teams;
-- =====================================================================

CREATE TABLE IF NOT EXISTS ee.team_3d_teams (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(80) NOT NULL CHECK (btrim(name) <> ''),
  sort_order  INTEGER NOT NULL DEFAULT 100
);

CREATE UNIQUE INDEX IF NOT EXISTS team_3d_teams_name_uq
  ON ee.team_3d_teams (lower(name));

CREATE TABLE IF NOT EXISTS ee.team_3d_projects (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id     UUID NOT NULL REFERENCES ee.team_3d_teams(id),
  stage       VARCHAR(10) NOT NULL DEFAULT 'ongoing'
                CHECK (stage IN ('ongoing', 'revisions', 'signoff')),
  name        VARCHAR(200) NOT NULL CHECK (btrim(name) <> ''),
  client      VARCHAR(200),
  notes       TEXT,
  created_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS team_3d_projects_team_idx
  ON ee.team_3d_projects (team_id, stage);

INSERT INTO ee.team_3d_teams (name, sort_order) VALUES
  ('Team Neeru', 10),
  ('Team Dhruv', 20)
ON CONFLICT DO NOTHING;

GRANT SELECT ON ee.team_3d_teams TO essentia_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ee.team_3d_projects TO essentia_app;
