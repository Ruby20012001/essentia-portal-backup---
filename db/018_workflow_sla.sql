-- =====================================================================
-- 018 — WORKFLOW SLA / TIMERS (Phase 4, Step 7)
--   Register the workflow-timers scheduler job and route the SLA/timeout
--   events. No new tables — per-task deadlines (sla_due_at/warn_at/timeout_at,
--   013) and per-group SLA config (sla_hours/…/timeout_action, 013) already
--   exist. Additive; idempotent; forward-only.
--
--   ROLLBACK: DELETE the scheduled_jobs row + the event_routes rows below.
-- =====================================================================

-- The SLA sweep job (auto-pilot). Cadence is data; 5 min by default.
INSERT INTO portal.scheduled_jobs
  (name, description, schedule_kind, schedule_expr, enabled, max_attempts, backoff_base_seconds) VALUES
  ('workflow-timers',
   'Workflow SLA sweep — warnings, breaches, escalations, reminders, timeouts.',
   'interval', '300', TRUE, 3, 120)
ON CONFLICT (name) DO NOTHING;

-- Route the SLA/timeout events (explicit recipient via payload.recipientId).
INSERT INTO portal.event_routes
  (event_type, category, notification_type, template_code, recipient_strategy, default_channels, priority) VALUES
  ('workflow.sla_warning',   'approval', 'deadline',   'system_alert', 'explicit', '["in_app"]',         'action_required'),
  ('workflow.sla_breached',  'approval', 'delay',      'system_alert', 'explicit', '["in_app","email"]', 'urgent'),
  ('workflow.escalated',     'approval', 'escalation', 'system_alert', 'explicit', '["in_app","email"]', 'urgent'),
  ('workflow.task_reminded', 'approval', 'reminder',   'system_alert', 'explicit', '["in_app"]',         'action_required'),
  ('workflow.timed_out',     'approval', 'delay',      'system_alert', 'explicit', '["in_app"]',         'urgent')
ON CONFLICT (event_type) DO NOTHING;
