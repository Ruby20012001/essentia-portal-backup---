-- =====================================================================
-- 023 — EXIT PROTOCOL: THE SIX REMOVAL ACTIONS AT 11:59PM (Velocity Gate #4)
--   CLAUDE.md (permanent constraint): "Exit protocol fires at exactly 11:59pm —
--   all 6 removal actions simultaneously." Brief §36 lists them: Teams channels
--   removed, WhatsApp groups removed, SSO revoked, email auto-responder
--   activated, phone call forwarding activated — plus approval authority
--   revoked (§33: WO/PO authority dies at 11:59pm on the Keka exit date).
--
--   The brief demands a "confirmed complete log", and the §38 QA critique calls
--   out the real failure mode: an action that silently does not happen. So every
--   action is logged per exit with an explicit status — completed / partial /
--   not_wired / failed. An integration that is not configured is recorded
--   not_wired; it is NEVER reported as done.
--
--   Single-fire is public.users.exit_protocol_fired; per-action idempotency is
--   UNIQUE (user_id, exit_date, action_code). Forward-only, idempotent.
--
--   ROLLBACK: DELETE FROM portal.scheduled_jobs WHERE name='exit-protocol';
--             DROP TABLE portal.exit_protocol_actions;
-- =====================================================================

CREATE TABLE IF NOT EXISTS portal.exit_protocol_actions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.users(id),
  exit_date   DATE NOT NULL,
  action_code VARCHAR(40) NOT NULL,
  status      VARCHAR(12) NOT NULL
              CHECK (status IN ('completed','partial','not_wired','failed')),
  detail      TEXT,
  acted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, exit_date, action_code)
);
CREATE INDEX IF NOT EXISTS idx_exit_actions_user
  ON portal.exit_protocol_actions (user_id, exit_date);

-- The 11:59pm sweep. Cadence mirrors config exit_protocol.fire_time = "23:59".
INSERT INTO portal.scheduled_jobs
  (name, description, schedule_kind, schedule_expr, enabled, max_attempts, backoff_base_seconds) VALUES
  ('exit-protocol',
   'Fire the exit protocol — all six removal actions — at 11:59pm on exit_date (CLAUDE.md) — Velocity Gate #4.',
   'daily', '23:59', TRUE, 3, 300)
ON CONFLICT (name) DO NOTHING;
