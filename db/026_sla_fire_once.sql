-- =====================================================================
-- 026 — SLA WARN/BREACH FIRE EXACTLY ONCE PER TASK (WES §8)
--   The sweep re-selected every still-pending task on every tick. The EVENTS
--   were deduped downstream, so users were not spammed — but the
--   WORKFLOW_SLA_BREACH audit row was not, so one breached task wrote a row on
--   every 5-minute tick (~288/day, indefinitely). The sweep counters had the
--   same shape: they reported tasks-in-state, not work actually done.
--
--   These stamps make the warn and breach phases idempotent AT THE SOURCE: the
--   sweep selects only un-stamped tasks and stamps them as it fires. Deadlines
--   remain the enforcement (warn_at / sla_due_at are untouched); this only
--   records that the one-shot notification already happened, so it matches the
--   "publish once (deduped)" wording in WES §8.
--
--   Additive and idempotent; no existing migration modified.
--   ROLLBACK: ALTER TABLE portal.workflow_tasks
--               DROP COLUMN sla_warned_at, DROP COLUMN sla_breached_at;
-- =====================================================================

ALTER TABLE portal.workflow_tasks
  ADD COLUMN IF NOT EXISTS sla_warned_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_breached_at TIMESTAMPTZ;

-- The sweep's working sets: pending tasks that have not yet fired.
CREATE INDEX IF NOT EXISTS idx_wt_sla_unwarned
  ON portal.workflow_tasks (warn_at)
  WHERE status = 'pending' AND sla_warned_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_wt_sla_unbreached
  ON portal.workflow_tasks (sla_due_at)
  WHERE status = 'pending' AND sla_breached_at IS NULL;
