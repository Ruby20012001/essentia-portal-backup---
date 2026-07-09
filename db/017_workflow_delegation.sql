-- =====================================================================
-- 017 — DELEGATION: reason + event routing (Phase 4, Step 6)
--   portal.workflow_delegations already exists (013). Add an optional reason
--   and route the three delegation events so the delegate is notified via the
--   framework (publishEvent only — never a direct send). Additive; idempotent.
--
--   ROLLBACK: ALTER TABLE ... DROP COLUMN reason; DELETE the event_routes rows.
-- =====================================================================

ALTER TABLE portal.workflow_delegations
  ADD COLUMN IF NOT EXISTS reason TEXT;

-- Delegation events → in-app, explicit recipient (payload.recipientId).
INSERT INTO portal.event_routes
  (event_type, category, notification_type, template_code, recipient_strategy, default_channels, priority) VALUES
  ('workflow.delegation_created', 'approval', 'assignment', 'assignment', 'explicit', '["in_app"]', 'informational'),
  ('workflow.delegation_revoked', 'approval', 'assignment', 'assignment', 'explicit', '["in_app"]', 'informational'),
  ('workflow.task_delegated',     'approval', 'assignment', 'assignment', 'explicit', '["in_app"]', 'action_required')
ON CONFLICT (event_type) DO NOTHING;
