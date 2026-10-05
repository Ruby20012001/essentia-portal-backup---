-- =====================================================================
-- 061 — API HEALTH PULSE (S13 · Blueprint §09)
--   portal.api_health_log and api_failure_state have existed since 001,
--   with nothing writing to them. This registers the five-minute job that
--   does — handler 'api-health-pulse' in frontend/lib/services/scheduler.ts —
--   and routes its one alert: three failures in a row on an integration
--   publishes `integration.degraded`, which goes to the platform admins the
--   same way a dead-lettered job does (db/012).
--
--   The pulse probes only integrations the portal can actually reach; the
--   rest stay "Never checked" on S13 rather than being logged as down.
--   Forward-only, idempotent.
--
--   ROLLBACK: DELETE FROM portal.scheduled_jobs WHERE name = 'api-health-pulse';
--             DELETE FROM portal.event_routes WHERE event_type = 'integration.degraded';
-- =====================================================================

INSERT INTO portal.scheduled_jobs
  (name, description, schedule_kind, schedule_expr, enabled, max_attempts, backoff_base_seconds) VALUES
  ('api-health-pulse',
   'Probe each reachable integration and log its health for S13; purge logs older than 30 days.',
   'interval', '300', TRUE, 1, 60)
ON CONFLICT (name) DO NOTHING;

INSERT INTO portal.event_routes
  (event_type, category, notification_type, template_code, recipient_strategy, default_channels, priority) VALUES
  ('integration.degraded', 'integration', 'system_alert', 'system_alert', 'platform_admins',
   '["in_app","email"]', 'urgent')
ON CONFLICT (event_type) DO NOTHING;
