-- =====================================================================
-- 015 — TASK-LEVEL AUDIT ON workflow_actions (Phase 4, Step 4)
--   A parallel group produces several actions with the same step_no; add
--   task_id + group_no so each action links to the exact task/group it
--   decided (WES §3). Additive + nullable + idempotent; step_no is kept for
--   backward-compat and the transition. No shipped migration edited.
--
--   ROLLBACK: ALTER TABLE portal.workflow_actions DROP COLUMN task_id, group_no.
-- =====================================================================

ALTER TABLE portal.workflow_actions
  ADD COLUMN IF NOT EXISTS task_id  UUID REFERENCES portal.workflow_tasks(id),
  ADD COLUMN IF NOT EXISTS group_no INTEGER;

CREATE INDEX IF NOT EXISTS idx_wf_actions_task ON portal.workflow_actions (task_id);
