-- =====================================================================
-- 009 — KEKA INTEGRATION (Platform Phase 2)
-- Org sync: employees, departments (mapped onto the Master — never
-- created outside it, A-13), reporting hierarchy, designations, active
-- status. After a sync, people/HODs/TLs/reporting come from Keka; the
-- department taxonomy stays the Master's. Live Keka is a credential-gated
-- provider slot; a fixture provider (the brief's real people) backs dev.
-- =====================================================================

-- =====================================================================
-- SYNC RUNS — one row per sync, with stats. Per-entity changes go to
-- audit.log (action KEKA_SYNC). Together these are the "sync audit logs".
-- =====================================================================
CREATE TABLE IF NOT EXISTS portal.sync_runs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source       VARCHAR(30) NOT NULL DEFAULT 'keka',
  provider     VARCHAR(20) NOT NULL,                 -- fixture | http
  trigger_type VARCHAR(20) NOT NULL CHECK (trigger_type IN ('manual','scheduled')),
  status       VARCHAR(20) NOT NULL DEFAULT 'running'
               CHECK (status IN ('running','success','partial','failed')),
  started_by   UUID REFERENCES public.users(id),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at  TIMESTAMPTZ,
  stats        JSONB DEFAULT '{}',                   -- counts + unmapped depts
  error_msg    TEXT
);
CREATE INDEX IF NOT EXISTS idx_sync_runs_recent ON portal.sync_runs (started_at DESC);

-- =====================================================================
-- WORKFLOW APPROVER RESOLUTION — the sync links seeded approver emails to
-- real synced accounts, arming the PIO chain (blocked since S4, A-04).
-- =====================================================================
ALTER TABLE portal.workflow_steps
  ADD COLUMN IF NOT EXISTS approver_email VARCHAR(255);

UPDATE portal.workflow_steps SET approver_email = 'khushpreet.arora@essentia.in'
  WHERE workflow_code = 'pio_approval' AND step_no = 1 AND approver_email IS NULL;
UPDATE portal.workflow_steps SET approver_email = 'deepak.jain@essentia.in'
  WHERE workflow_code = 'pio_approval' AND step_no = 2 AND approver_email IS NULL;
UPDATE portal.workflow_steps SET approver_email = 'hardesh.chawla@essentia.in'
  WHERE workflow_code = 'pio_approval' AND step_no = 3 AND approver_email IS NULL;

-- =====================================================================
-- CONFIG — provider selection + department-name mapping (A-13).
-- Keka department names → Department Master codes. Names absent here are
-- reported as "unmapped" and the person is synced without a department;
-- the sync never creates a department outside the Master.
-- =====================================================================
INSERT INTO portal.app_config (key, value, category, description) VALUES
  ('keka.provider', '"fixture"', 'people',
   'Active org-sync provider: fixture (dev, the brief''s people) | http (live Keka — needs KEKA_API_KEY/KEKA_BASE_URL).'),
  ('keka.sync_enabled', 'true', 'people',
   'Master switch for scheduled Keka syncs.')
ON CONFLICT (key) DO NOTHING;

-- Populate the mapping (A-13 left it '{}'). Values are Department Master codes.
UPDATE portal.app_config
SET value = '{
  "CRM": "CRM_EE",
  "BD & Sales": "BD",
  "Architecture": "ARCH",
  "3D Visualisation": "3D",
  "Interior Design": "INTERIOR",
  "FF&E": "FFE",
  "WIO GFC Drafting": "DRAFTING",
  "Staging & Styling": "STAGING",
  "Site": "SITE",
  "Production": "FACTORY",
  "PPC": "PPC",
  "Quality Control": "QC",
  "Store": "STORE",
  "Packing & Dispatch": "PACKING",
  "Procurement": "PROC",
  "Accounts": "ACCOUNTS",
  "HR": "HR",
  "Legal": "LEGAL",
  "Marketing": "MARKETING"
}'::jsonb
WHERE key = 'keka.department_mapping';

-- =====================================================================
-- APP-ROLE GRANTS (db/007 pattern)
-- =====================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON portal.sync_runs TO essentia_app;
