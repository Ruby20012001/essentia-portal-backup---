-- =====================================================================
-- 006 — S4 VERIFICATION HARDENING
-- 1. Audit entries carry the actor's role (verification requirement).
-- 2. WIO lifecycle events get notification templates.
-- =====================================================================

ALTER TABLE audit.log ADD COLUMN IF NOT EXISTS actor_role access_level;

INSERT INTO portal.notification_templates
  (code, tier, title_template, body_template, action_url_template, action_label, description) VALUES
  ('wio_created', 'informational',
   'WIO {{wioNumber}} created',
   '{{projectCode}} · routed to {{department}}. The {{days}}-day conversion clock is running.',
   '/wio-pio', 'Open hub', 'S4: WIO creation event'),
  ('wio_converted', 'informational',
   '{{wioNumber}} converted → {{pioNumber}}',
   '{{projectCode}}: the factory clock is running; Triangle of Agreement is next.',
   '/wio-pio', 'Open hub', 'S4: WIO→PIO conversion event'),
  ('wio_cancelled', 'informational',
   'WIO {{wioNumber}} cancelled',
   '{{projectCode}} · {{department}}. The record stays in history with its full audit trail.',
   '/wio-pio', 'Open hub', 'S4: WIO cancellation event'),
  ('workflow_decided', 'action_required',
   '{{workflowName}} {{decision}} — {{resourceRef}}',
   'Decision by {{actor}} at step {{stepNo}}: {{decision}}.{{commentsLine}}',
   '/wio-pio', 'Open hub', 'Workflow terminal decision (approved/rejected)')
ON CONFLICT (code) DO NOTHING;
