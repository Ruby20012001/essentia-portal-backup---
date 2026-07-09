-- =====================================================================
-- 016 — WORKFLOW INSTANCE CONTEXT (Phase 4, Step 5 — conditional routing)
--   Adds portal.workflow_instances.context — the data a group's `condition`
--   predicate is evaluated against (e.g. {"amount": 60000000}). A group whose
--   condition is false is SKIPPED (WES §7). Additive + nullable-with-default;
--   PIO (no conditions) is unaffected. Forward-only; idempotent.
--
--   ROLLBACK: ALTER TABLE portal.workflow_instances DROP COLUMN context.
-- =====================================================================

ALTER TABLE portal.workflow_instances
  ADD COLUMN IF NOT EXISTS context JSONB NOT NULL DEFAULT '{}';
