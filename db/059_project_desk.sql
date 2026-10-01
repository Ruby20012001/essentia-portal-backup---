-- =====================================================================
-- 059 — PROJECT DESK
--
--   One table: every live project from enquiry to handover, read by the
--   page at /project-desk and by its assistant (/api/project-desk/ask).
--
--   Deliberately flat. The brief for it was "keep it simple — if there are
--   too many features, designers will not use it", so the eleven site steps
--   are one JSONB array of the steps ticked rather than a child table, and
--   stage and type are CHECKed text rather than lookup rows.
--
--   Rows are removed for real when somebody taps Remove twice. That is what
--   the brief asks for, and nothing else in the portal points at this table.
--
--   Additive + idempotent.
--   ROLLBACK: DROP SCHEMA desk CASCADE;
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS desk;

CREATE TABLE IF NOT EXISTS desk.projects (
  id          BIGSERIAL PRIMARY KEY,
  name        VARCHAR(200) NOT NULL CHECK (btrim(name) <> ''),
  client      VARCHAR(200),
  city        VARCHAR(100),
  type        VARCHAR(20)  NOT NULL DEFAULT 'Residence'
                CHECK (type IN ('Residence', 'Apartment', 'Clubhouse', 'Office',
                                'Retail', 'Hospitality', 'Other')),
  stage       VARCHAR(20)  NOT NULL DEFAULT 'Enquiry'
                CHECK (stage IN ('Enquiry', 'Proposal sent', 'Design',
                                 'Execution', 'Handover')),
  owner       VARCHAR(120),
  next_step   VARCHAR(300),
  due_date    DATE,
  -- The keys of the site steps that are done, e.g. ["measurement","civil"].
  -- The list of steps itself lives in lib/services/project-desk-logic.ts.
  site_work   JSONB        NOT NULL DEFAULT '[]'::JSONB
                CHECK (jsonb_typeof(site_work) = 'array'),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by  VARCHAR(200)
);

CREATE INDEX IF NOT EXISTS desk_projects_due_idx ON desk.projects (due_date);

GRANT USAGE ON SCHEMA desk TO essentia_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON desk.projects TO essentia_app;
GRANT USAGE, SELECT ON SEQUENCE desk.projects_id_seq TO essentia_app;
