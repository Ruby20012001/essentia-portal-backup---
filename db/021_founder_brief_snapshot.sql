-- =====================================================================
-- 021 — FOUNDER MORNING BRIEF AUTO-GENERATION (Brief §37 · Velocity Gate #6)
--   Gate #6 requires the Founder Morning Brief to auto-generate at 6:30am.
--   The screen (S18) already reads the 7 numbers live; this adds the daily
--   snapshot the auto-pilot writes each morning — the "generated" artefact
--   (history + audit + a hook for later notify/email), one row per day.
--   Forward-only, idempotent.
--
--   ROLLBACK: DELETE FROM portal.scheduled_jobs WHERE name='founder-morning-brief';
--             DROP TABLE portal.founder_brief_snapshots;
-- =====================================================================

CREATE TABLE IF NOT EXISTS portal.founder_brief_snapshots (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brief_date    DATE NOT NULL UNIQUE,                 -- one brief per day
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by  UUID REFERENCES public.users(id),     -- the auto-pilot (or a manual run)
  numbers       JSONB NOT NULL DEFAULT '[]',           -- the 7 numbers, as rendered
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Register the 6:30am daily job. Handler 'founder-morning-brief' lives in the
-- scheduler HANDLERS registry (frontend/lib/services/scheduler.ts).
INSERT INTO portal.scheduled_jobs
  (name, description, schedule_kind, schedule_expr, enabled, max_attempts, backoff_base_seconds) VALUES
  ('founder-morning-brief',
   'Generate the Founder Morning Brief snapshot (the 7 numbers, Brief §37) — Velocity Gate #6.',
   'daily', '06:30', TRUE, 3, 300)
ON CONFLICT (name) DO NOTHING;
