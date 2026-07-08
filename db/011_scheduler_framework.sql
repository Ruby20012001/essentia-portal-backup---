-- =====================================================================
-- 011 — SCHEDULER / JOB FRAMEWORK  (auto-pilot; resolves A-14 / IG-06)
--   Cadence-as-data invocation of REGISTERED jobs, with single-fire
--   locking (a unique claim per scheduled slot), retry/backoff, a run
--   log, and monitoring fields. The scheduler holds no business logic —
--   it triggers existing job handlers (PAS §6 / MDG §9).
-- =====================================================================

-- ---------------------------------------------------------------------
-- SYSTEM SERVICE ACCOUNT — the identity the auto-pilot acts as. L1
-- (senior-leadership scope) so cross-department sweeps see every record
-- under RLS; it has no credential (microsoft_oid/phone NULL) so it can
-- never log in interactively. Jobs and events are attributed to it.
-- ---------------------------------------------------------------------
INSERT INTO public.users
  (id, email, full_name, display_name, access_level, job_title, is_active, is_external)
VALUES
  ('00000000-0000-4000-8000-0000000000a0', 'autopilot@essentia.in',
   'Essentia Auto-Pilot', 'Auto-Pilot', 'L1', 'Platform Scheduler (system)', TRUE, FALSE)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- PERMISSIONS — a 'scheduler' resource. 004's L0/L1 CROSS JOIN seeds
-- already ran, so a resource added later needs explicit rows.
-- ---------------------------------------------------------------------
INSERT INTO public.resource_types (code, name, domain, is_financial, is_hr) VALUES
  ('scheduler', 'Scheduler / Background Jobs', 'portal', FALSE, FALSE)
ON CONFLICT (code) DO NOTHING;

-- L0/L1: full control of the scheduler.
INSERT INTO public.permissions (access_level, resource_type, action_code, allowed, scope, notes)
SELECT lvl, 'scheduler', a.code, TRUE, 'all', 'Scheduler admin (011)'
FROM (VALUES ('L0'::access_level), ('L1'::access_level)) AS l(lvl)
CROSS JOIN public.permission_actions a
ON CONFLICT (access_level, department_id, resource_type, action_code) DO NOTHING;

-- L2 (HOD/TL): read-only visibility of job status.
INSERT INTO public.permissions (access_level, resource_type, action_code, allowed, scope, notes) VALUES
  ('L2', 'scheduler', 'read', TRUE, 'all', 'HOD/TL can view scheduler status (011)')
ON CONFLICT (access_level, department_id, resource_type, action_code) DO NOTHING;

-- ---------------------------------------------------------------------
-- JOB REGISTRY — one row per registered job; cadence is DATA.
--   schedule_kind='interval' → schedule_expr = seconds (e.g. '60')
--   schedule_kind='daily'    → schedule_expr = 'HH:MM' (server time)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal.scheduled_jobs (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                  VARCHAR(60) UNIQUE NOT NULL,        -- handler-registry key
  description           TEXT,
  schedule_kind         VARCHAR(10) NOT NULL CHECK (schedule_kind IN ('interval','daily')),
  schedule_expr         VARCHAR(20) NOT NULL,
  enabled               BOOLEAN NOT NULL DEFAULT TRUE,
  max_attempts          INTEGER NOT NULL DEFAULT 3  CHECK (max_attempts >= 1),
  backoff_base_seconds  INTEGER NOT NULL DEFAULT 60 CHECK (backoff_base_seconds >= 1),
  timeout_seconds       INTEGER NOT NULL DEFAULT 300,
  last_run_at           TIMESTAMPTZ,
  last_status           VARCHAR(12),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- RUN LOG — one row per (job, scheduled_for) slot. The UNIQUE(job_id,
-- scheduled_for) IS the lock: two concurrent ticks cannot both claim a
-- slot, and a slot is never run twice. Retry re-claims the SAME slot
-- (ON CONFLICT ... DO UPDATE) only while it is 'failed' and eligible.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal.job_runs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id          UUID NOT NULL REFERENCES portal.scheduled_jobs(id) ON DELETE CASCADE,
  job_name        VARCHAR(60) NOT NULL,
  scheduled_for   TIMESTAMPTZ NOT NULL,                     -- the slot this run claims
  trigger         VARCHAR(10) NOT NULL DEFAULT 'scheduler'
                  CHECK (trigger IN ('scheduler','manual')),
  status          VARCHAR(12) NOT NULL DEFAULT 'running'
                  CHECK (status IN ('running','succeeded','failed','dead')),
  attempt         INTEGER NOT NULL DEFAULT 1,
  next_attempt_at TIMESTAMPTZ,                              -- backoff gate for retry
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at     TIMESTAMPTZ,
  duration_ms     INTEGER,
  result          JSONB,
  error           TEXT,
  UNIQUE (job_id, scheduled_for)
);
CREATE INDEX IF NOT EXISTS idx_job_runs_job    ON portal.job_runs (job_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_runs_open   ON portal.job_runs (status) WHERE status IN ('running','failed');

-- ---------------------------------------------------------------------
-- SEED the three existing job routes as registered jobs (idempotent,
-- already guarded). keka-sync additionally honours keka.sync_enabled.
-- ---------------------------------------------------------------------
INSERT INTO portal.scheduled_jobs
  (name, description, schedule_kind, schedule_expr, enabled, max_attempts, backoff_base_seconds) VALUES
  ('notifications-dispatch',
   'Delivery retry processor — sends due pending deliveries, applies backoff, dead-letters exhausted.',
   'interval', '60', TRUE, 3, 60),
  ('wio-clock',
   'WIO clock escalation sweep (Brief §30: day-12 alert / day-15 lapse), deduped per WIO per day.',
   'daily', '07:00', TRUE, 3, 300),
  ('keka-sync',
   'Scheduled org sync (honours keka.sync_enabled master switch).',
   'daily', '02:00', TRUE, 2, 600)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------
-- CONFIG — scheduler master switch + catch-up grace (as data).
-- ---------------------------------------------------------------------
INSERT INTO portal.app_config (key, value, category, description) VALUES
  ('scheduler.enabled', 'true', 'scheduler',
   'Master switch for the auto-pilot tick. When false, ticks are a no-op.'),
  ('scheduler.catchup_grace_seconds', '90', 'scheduler',
   'A due slot remains runnable within this grace window after its scheduled time.')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------
-- GRANTS (db/007 pattern).
-- ---------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE
  ON portal.scheduled_jobs, portal.job_runs
  TO essentia_app;
