-- =====================================================================
-- 019 — NOTIFICATION INTEGRATION (Phase 4, Step 8)
--   The approval-assignment notification (workflow.step_pending) now resolves
--   the EFFECTIVE TASK approver — delegation-aware, and works for every
--   workflow — instead of the legacy workflow_steps approver (PIO-only, and
--   blind to delegation). Re-route to the workflow_task_assignee strategy.
--   Additive/idempotent; no schema change.
--
--   ROLLBACK: set recipient_strategy back to 'workflow_step_approver'.
-- =====================================================================

UPDATE portal.event_routes
  SET recipient_strategy = 'workflow_task_assignee'
  WHERE event_type = 'workflow.step_pending';
