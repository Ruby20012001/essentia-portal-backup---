-- =====================================================================
-- 012 — SCHEDULER DEAD-LETTER ALERT POLICY (config-driven)
--   When a scheduled job exhausts its retries and dead-letters, the
--   scheduler publishes `scheduler.job_dead`. This routes the alert to the
--   platform operators via the 'platform_admins' recipient strategy, whose
--   membership is DATA (access levels + job-title patterns) — adding a future
--   Operations role is a config change, never a code edit.
-- =====================================================================

-- Route the dead-letter event to platform admins on in-app + email, urgent.
INSERT INTO portal.event_routes
  (event_type, category, notification_type, template_code, recipient_strategy, default_channels, priority) VALUES
  ('scheduler.job_dead', 'system', 'system_alert', 'system_alert', 'platform_admins',
   '["in_app","email"]', 'urgent')
ON CONFLICT (event_type) DO NOTHING;

-- Recipient policy as data. Default recipients: Founders (L0), the COO, and a
-- CTO / Platform Administrator if one exists. To add an Operations role later,
-- append its title substring to notifications.admin_alert_title_patterns.
INSERT INTO portal.app_config (key, value, category, description) VALUES
  ('notifications.admin_alert_levels', '["L0"]', 'notifications',
   'Access levels that receive platform-admin alerts (scheduler dead-letters, etc.). Founders (L0) by default.'),
  ('notifications.admin_alert_title_patterns',
   '["COO","Chief Operating","CTO","Chief Technology","Platform Admin"]', 'notifications',
   'job_title substrings (ILIKE) that ALSO receive platform-admin alerts — COO, CTO / Platform Administrator, and any future Operations role. Config-driven; add a role without code changes.')
ON CONFLICT (key) DO NOTHING;
